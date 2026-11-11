// 生成链上证据报告。证据以练习环境为准（开发和全部测试都在这套部署上）：
//   AV_ENV=rehearsal npm run evidence → docs/EVIDENCE.md
// 正式环境只用于上台演示；需要时也能生成一份 docs/EVIDENCE-stage.md（不提交）
// 所有数据都直接从 Sepolia 读取（合约状态 + 事件 + 交易回执），不依赖本地的任何记录。
// 报告里每个数字都带 Etherscan 链接，老师可以逐条核对。
import { writeFileSync } from "node:fs";
import path from "node:path";
import { decodeErrorResult, decodeEventLog, formatUnits, type Address, type Hex } from "viem";
import { agentShopAbi, mockUsdcAbi } from "./generated/abi.js";
import { allShops, AV_ENV, deployment, EXPLORER, ROOT } from "./config.js";
import { publicClient, USDC, VAULT } from "./chain.js";
import { agentVaultAbi } from "./generated/abi.js";
import { STATUS } from "./shop.js";
import { ensureRegistry } from "./registry.js";

const f = (v: bigint) => formatUnits(v, 6);
const addr = (a: string) => `[\`${a.slice(0, 6)}…${a.slice(-4)}\`](${EXPLORER}/address/${a})`;
const tx = (h: string) => `[\`${h.slice(0, 10)}…\`](${EXPLORER}/tx/${h})`;
const tokenPage = (a: string) => `${EXPLORER}/token/${USDC}?a=${a}`;

function nameOf(a: string): string {
  const x = a.toLowerCase();
  if (x === VAULT.toLowerCase()) return "小钱包（金库）";
  const s = allShops().find((m) => m.address.toLowerCase() === x);
  if (s) return `${s.emoji} ${s.name}`;
  if (x === deployment.roles.merchant.toLowerCase()) return "商家钱包";
  if (x === deployment.roles.owner.toLowerCase()) return "金库主人";
  if (x === deployment.roles.agent.toLowerCase()) return "AI 代理";
  if (x === deployment.attacker.toLowerCase()) return "攻击者";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

const bal = (a: Address) => publicClient.readContract({ address: USDC, abi: mockUsdcAbi, functionName: "balanceOf", args: [a] });

async function transfersIn(hash: Hex) {
  const rc = await publicClient.getTransactionReceipt({ hash });
  return {
    status: rc.status,
    transfers: rc.logs
      .filter((l) => l.address.toLowerCase() === USDC.toLowerCase())
      .flatMap((l) => {
        try {
          const ev = decodeEventLog({ abi: mockUsdcAbi, data: l.data, topics: l.topics });
          return ev.eventName === "Transfer" ? [{ from: ev.args.from, to: ev.args.to, value: ev.args.value }] : [];
        } catch {
          return [];
        }
      }),
  };
}

const EVENT_CN: Record<string, string> = {
  OrderCreated: "下单",
  OrderPaid: "付款进托管",
  OrderDelivered: "送达",
  OrderCompleted: "放款（托管 → 可提现）",
  OrderRefunded: "退款回金库",
  OrderCancelled: "取消",
  Withdrawn: "商家提现",
};

/** 通过 Etherscan API 列出 AI 代理钱包在 v2 部署之后的失败交易，并在节点上重放拿到拒绝原因 */
async function failedAgentTxs() {
  const key = process.env.ETHERSCAN_API_KEY;
  if (!key) return [];
  const url = `https://api.etherscan.io/v2/api?chainid=11155111&module=account&action=txlist&address=${deployment.roles.agent}&startblock=${deployment.deployBlock}&sort=asc&apikey=${key}`;
  try {
    const r = (await (await fetch(url)).json()) as { result: { hash: Hex; isError: string; to: string; functionName: string; timeStamp: string; input: Hex; blockNumber: string }[] };
    if (!Array.isArray(r.result)) return [];
    const out = [];
    for (const t of r.result.filter((x) => x.isError === "1")) {
      let reason = "revert";
      try {
        await publicClient.call({ to: t.to as Address, data: t.input, account: deployment.roles.agent, blockNumber: BigInt(t.blockNumber) - 1n });
      } catch (e) {
        // 从节点返回的 revert 数据里解码出合约的自定义错误名
        const data = (e as { walk?: (fn: (x: unknown) => boolean) => unknown }).walk?.(
          (x) => typeof (x as { data?: unknown })?.data === "string",
        ) as { data?: Hex } | undefined;
        try {
          const abi = [...agentVaultAbi, ...agentShopAbi].filter((x) => x.type === "error");
          if (data?.data) reason = decodeErrorResult({ abi, data: data.data }).errorName;
        } catch {
          /* 保留默认 */
        }
      }
      out.push({
        hash: t.hash,
        to: t.to,
        fn: (t.functionName || "").split("(")[0] || t.input.slice(0, 10),
        time: new Date(Number(t.timeStamp) * 1000).toLocaleString("zh-CN"),
        reason,
      });
    }
    return out;
  } catch {
    return [];
  }
}

async function main() {
  await ensureRegistry(true);
  const block = await publicClient.getBlockNumber();
  const now = new Date();
  const out: string[] = [];
  const p = (s = "") => out.push(s);

  p("# 链上证据报告（自动生成）");
  p();
  p(`> 由 \`npm run evidence\` 在 ${now.toISOString()} 生成，读取的是 Sepolia **区块 #${block}** 时的链上状态。`);
  p(`> 部署：${AV_ENV === "rehearsal" ? "练习环境（开发和测试用，包含全部测试交易）" : "正式演示环境"}，金库 \`${VAULT}\`。`);
  p("> 所有数据都直接来自链上（合约状态、事件、交易回执），不依赖本地记录。每个地址和交易都附 Etherscan 链接，可以逐条核对。");
  p();

  // ── 1. 合约 ──
  p("## 1. 合约地址（已在 Etherscan 验证源码）");
  p();
  p("| 合约 | 地址 | 源码 |");
  p("|---|---|---|");
  p(`| AgentVault（金库） | \`${VAULT}\` | [查看已验证源码](${EXPLORER}/address/${VAULT}#code) |`);
  p(`| MockUSDC（测试稳定币） | \`${USDC}\` | [查看已验证源码](${EXPLORER}/address/${USDC}#code) |`);
  for (const s of allShops()) {
    const ok = await publicClient.readContract({ address: VAULT, abi: agentVaultAbi, functionName: "isMerchant", args: [s.address] });
    p(`| AgentShop ${s.emoji} ${s.name}（白名单：${ok ? "✅" : "❌"}） | \`${s.address}\` | [查看已验证源码](${EXPLORER}/address/${s.address}#code) |`);
  }
  p();

  // ── 2. 余额对账 ──
  p("## 2. 余额对账：钱现在在哪里");
  p();
  p("| 地址 | 链上 mUSDC 余额 | 托管中 | 可提现 | 校验 |");
  p("|---|---|---|---|---|");
  const vaultBal = await bal(VAULT);
  p(`| [小钱包（金库）](${tokenPage(VAULT)}) | **${f(vaultBal)}** | — | — | AI 能动用的钱 |`);
  let total = vaultBal;
  let allOk = true;
  for (const s of allShops()) {
    const [b, e, w] = await Promise.all([
      bal(s.address),
      publicClient.readContract({ address: s.address, abi: agentShopAbi, functionName: "escrowed" }),
      publicClient.readContract({ address: s.address, abi: agentShopAbi, functionName: "withdrawable" }),
    ]);
    total += b;
    const ok = b === e + w;
    allOk &&= ok;
    p(`| [${s.emoji} ${s.name}](${tokenPage(s.address)}) | **${f(b)}** | ${f(e)} | ${f(w)} | ${ok ? "✅ 余额 = 托管 + 可提现" : "❌ 对不上"} |`);
  }
  // 商家钱包、外部平台收款地址、普通地址可能被两套环境共用：只统计从本环境流过去的钱
  const attackerBal = await bal(deployment.attacker);
  let merchantGot = 0n;
  for (const s of allShops()) {
    const logs = await publicClient.getContractEvents({ address: s.address, abi: agentShopAbi, eventName: "Withdrawn", fromBlock: BigInt(deployment.deployBlock) });
    merchantGot += logs.reduce((sum, l) => sum + ((l.args as { amount?: bigint }).amount ?? 0n), 0n);
  }
  total += merchantGot;
  p(`| [商家钱包](${tokenPage(deployment.roles.merchant)}) | **${f(merchantGot)}** | — | — | 从本环境商家合约提现的总额 |`);
  const vaultLogs = await publicClient.getContractEvents({ address: VAULT, abi: agentVaultAbi, fromBlock: BigInt(deployment.deployBlock) });
  const [outs, backs] = await Promise.all([
    publicClient.getContractEvents({ address: USDC, abi: mockUsdcAbi, eventName: "Transfer", args: { from: VAULT }, fromBlock: BigInt(deployment.deployBlock) }),
    publicClient.getContractEvents({ address: USDC, abi: mockUsdcAbi, eventName: "Transfer", args: { to: VAULT }, fromBlock: BigInt(deployment.deployBlock) }),
  ]);
  const net = (a: string) =>
    outs.filter((l) => String(l.args.to).toLowerCase() === a.toLowerCase()).reduce((x, l) => x + (l.args.value ?? 0n), 0n) -
    backs.filter((l) => String(l.args.from).toLowerCase() === a.toLowerCase()).reduce((x, l) => x + (l.args.value ?? 0n), 0n);
  const platforms = (deployment as unknown as { externalPlatforms?: { name: string; payTo: Address }[] }).externalPlatforms ?? [];
  const known = new Set([VAULT, deployment.roles.merchant, deployment.attacker, ...allShops().map((s) => s.address), ...platforms.map((x) => x.payTo)].map((a) => a.toLowerCase()));
  for (const pf of platforms) {
    const b = net(pf.payTo);
    total += b;
    p(`| [${pf.name}（外部平台收款地址）](${tokenPage(pf.payTo)}) | **${f(b)}** | — | — | 金库付给平台的 − 平台退回的（x402） |`);
  }
  const plain = [...new Set(vaultLogs.filter((l) => l.eventName === "MerchantSet").map((l) => (l.args as { merchant: Address }).merchant))].filter((a) => !known.has(a.toLowerCase()));
  for (const a of plain) {
    const b = net(a);
    total += b;
    p(`| [普通地址（转账）](${tokenPage(a)}) \`${a.slice(0, 10)}…\` | **${f(b)}** | — | — | AI 直接转账（没有订单和托管） |`);
  }
  p(`| [攻击者地址](${tokenPage(deployment.attacker)}) | **${f(attackerBal)}** | — | — | ${attackerBal === 0n ? "✅ 一分没收到" : "❌"} |`);
  p(`| **合计**（金库 + 商家合约 + 商家钱包 + 外部平台 + 普通地址） | **${f(total)}** | | | 付款 / 退款 / 放款 / 提现只在这些地址之间移动 |`);
  p();

  // 资金守恒：合计 = 存入金库的总额 − 主人取出的总额
  const deposited = vaultLogs.filter((l) => l.eventName === "Deposited").reduce((s, l) => s + (l.args as { amount: bigint }).amount, 0n);
  const withdrawn = vaultLogs.filter((l) => l.eventName === "Withdrawn").reduce((s, l) => s + (l.args as { amount: bigint }).amount, 0n);
  const conserved = total === deposited - withdrawn;
  p(`**资金守恒检查**：金库累计存入 ${f(deposited)} − 主人取出 ${f(withdrawn)} = ${f(deposited - withdrawn)}；当前合计 ${f(total)} → ${conserved ? "✅ 一分不差" : "❌ 不一致"}`);
  p();
  p(`**商家合约账本检查**：${allOk ? "✅ 每个商家合约的 mUSDC 余额都等于 托管中 + 可提现" : "❌ 有合约对不上"}`);
  p();

  // ── 3. 订单 ──
  p("## 3. 每个订单的链上记录");
  p();
  p("每一行是一笔真实的链上交易；“实际转账”一列是从交易回执里解码出来的 mUSDC Transfer 事件。");
  p();
  const summary: string[] = [];
  for (const s of allShops()) {
    const logs = await publicClient.getContractEvents({ address: s.address, abi: agentShopAbi, fromBlock: BigInt(deployment.deployBlock) });
    const next = await publicClient.readContract({ address: s.address, abi: agentShopAbi, functionName: "nextOrderId" });
    for (let id = 1n; id < next; id++) {
      const [o] = await publicClient.readContract({ address: s.address, abi: agentShopAbi, functionName: "getOrder", args: [id] });
      const mine = logs.filter((l) => (l.args as { orderId?: bigint }).orderId === id);
      const done = mine.find((l) => l.eventName === "OrderCompleted");
      const wd = done ? logs.find((l) => l.eventName === "Withdrawn" && l.blockNumber >= done.blockNumber) : undefined;
      const rows = wd ? [...mine, wd] : mine;
      p(`### ${s.emoji} ${s.name} · 订单 ${s.id}-${id}（${f(o.total)} mUSDC，当前状态：${STATUS[o.status]}）`);
      p();
      p("| 步骤 | 区块 | 交易 | 实际转账 |");
      p("|---|---|---|---|");
      let paidIn = 0n;
      for (const l of rows) {
        const t = await transfersIn(l.transactionHash);
        for (const x of t.transfers) if (x.to.toLowerCase() === s.address.toLowerCase() && x.from.toLowerCase() === VAULT.toLowerCase()) paidIn += x.value;
        const moves = t.transfers.map((x) => `${f(x.value)}：${nameOf(x.from)} → ${nameOf(x.to)}`).join("<br>") || "（无转账，只改合约账本）";
        p(`| ${EVENT_CN[l.eventName as string] ?? l.eventName} | ${l.blockNumber} | ${tx(l.transactionHash)} | ${moves} |`);
      }
      p();
      if (o.status >= 2) {
        const ok = paidIn === o.total;
        summary.push(`| ${s.id}-${id} | ${f(o.total)} | ${f(paidIn)} | ${STATUS[o.status]} | ${ok ? "✅" : "❌"} |`);
      } else {
        summary.push(`| ${s.id}-${id} | ${f(o.total)} | 0 | ${STATUS[o.status]}（未付款${s.flagged ? "：诈骗店付款被合约拒绝" : ""}） | ✅ 没有钱离开金库 |`);
      }
    }
  }

  p("## 4. 订单金额核对（类似 Have / Result / As expected 的检查）");
  p();
  p("| 订单 | 订单金额（合约计算） | 金库实际转入商家合约 | 状态 | 是否一致 |");
  p("|---|---|---|---|---|");
  for (const r of summary) p(r);
  p();

  // ── 5. 审批 ──
  p("## 5. 金库审批请求（超额付款）");
  p();
  const nextReq = await publicClient.readContract({ address: VAULT, abi: agentVaultAbi, functionName: "nextRequestId" });
  const REQ = ["None", "待审批", "已批准付款", "已拒绝", "已过期"];
  p("| # | 收款方 | 金额 | 备注 | 状态 |");
  p("|---|---|---|---|---|");
  for (let i = 1n; i < nextReq; i++) {
    const [r, memo] = await Promise.all([
      publicClient.readContract({ address: VAULT, abi: agentVaultAbi, functionName: "getRequest", args: [i] }),
      publicClient.readContract({ address: VAULT, abi: agentVaultAbi, functionName: "getRequestMemo", args: [i] }),
    ]);
    p(`| ${i} | ${nameOf(r.merchant)} | ${f(r.amount)} | ${memo} | ${REQ[r.status]} |`);
  }
  p();

  // ── 6. 被拒绝的尝试 ──
  p("## 6. 被合约拒绝的尝试");
  p();
  p("被合约拒绝的交易不会改变任何状态、也不会产生事件，所以不出现在上面的表里。但它们作为**失败交易**留在链上：");
  p();
  const failed = await failedAgentTxs();
  if (failed.length) {
    p("| 时间 | 交易 | 调用 | 发给 | 链上结果 |");
    p("|---|---|---|---|---|");
    for (const t of failed) p(`| ${t.time} | ${tx(t.hash)} | ${t.fn} | ${nameOf(t.to)} | ❌ 被合约拒绝（${t.reason}） |`);
    p();
  }
  p("其他可以核对的地方：");
  p(`- AI 代理钱包的全部交易（包括标红的失败交易）：${EXPLORER}/address/${deployment.roles.agent}`);
  for (const s of allShops().filter((x) => x.flagged)) p(`- 诈骗店「${s.name}」合约的 mUSDC 转账记录（应该是空的）：${tokenPage(s.address)}`);
  p(`- 攻击者地址的 mUSDC 转账记录（应该是空的）：${tokenPage(deployment.attacker)}`);
  p("- v1 中故意上链留档的失败交易（AI 付款给攻击者 → MerchantNotAllowed）：https://sepolia.etherscan.io/tx/0x9fcaed0f12d5f0ae91eaf540c3dcc82457535083515d3268818d865dd5463d87");
  p();

  // 练习环境 → docs/EVIDENCE.md（报告用的证据）；正式环境 → docs/EVIDENCE-stage.md（只在本地看，不提交）
  const file = path.join(ROOT, AV_ENV === "rehearsal" ? "docs/EVIDENCE.md" : "docs/EVIDENCE-stage.md");
  writeFileSync(file, out.join("\n"));
  console.log(`已生成 ${file}（区块 #${block}）`);
  console.log(`资金守恒：${conserved ? "✅" : "❌"}  商家账本：${allOk ? "✅" : "❌"}  攻击者余额：${f(attackerBal)}`);
}

await main();
