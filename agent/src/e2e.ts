// 端到端测试（Sepolia 真实交易）：把控制台、商家入驻、平台仲裁页面上每个"要 MetaMask 签名"的按钮，
// 用对应角色的测试钱包（.env 里的 owner / 平台仲裁人 / 商家）发出完全相同的合约调用；AI 一侧用离线规则模式（不调用大模型）。
// 跑完把结果写进 docs/E2E-RESULTS.md，每一步都附 Etherscan 交易链接。
//
// 用法（只在练习环境）：先启动模拟平台（AV_ENV=rehearsal npm run cloudeats），再运行 AV_ENV=rehearsal npm run e2e
// 会改动链上状态，但跑完会把额度、白名单恢复成原样；会新开一家"测试面包房"（不加入白名单）。
import { writeFileSync } from "node:fs";
import path from "node:path";
import { getAddress, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { agentShopAbi, agentVaultAbi, mockUsdcAbi, shopFactoryAbi } from "./generated/abi.js";
import { allPlatforms, AV_ENV, deployment, env, findShop, ROOT, txUrl } from "./config.js";
import { explainRevert, fmt, getRequest, publicClient, toUnits, USDC, VAULT, walletFor } from "./chain.js";
import { ensureRegistry } from "./registry.js";
import { getOrder, parseOrderRef } from "./shop.js";
import { runOffline } from "./offline.js";
import { runTool } from "./tools.js";
import type { AgentEvent } from "./llm.js";

const AGENT = deployment.roles.agent;
const owner = walletFor(env.ownerKey());
const arbiter = walletFor(env.platformKey());
const merchant = walletFor(env.merchantKey());
const vault = { address: VAULT, abi: agentVaultAbi } as const;

type Row = { section: string; name: string; ok: boolean; detail: string; tx?: string };
const rows: Row[] = [];
let section = "";
const check = (name: string, ok: boolean, detail = "", tx?: string) => {
  rows.push({ section, name, ok, detail, tx });
  console.log(`  ${ok ? "✅" : "❌"} ${name}${detail ? "：" + detail : ""}${tx ? "  " + tx : ""}`);
};
const step = (s: string) => {
  section = s;
  console.log(`\n── ${s} ──`);
};

/** 用某个钱包发一笔合约调用（先模拟，拿到人话的拒绝原因） */
async function send(w: ReturnType<typeof walletFor>, call: { address: Address; abi: unknown; functionName: string; args?: readonly unknown[] }) {
  const req = { ...call, account: w.account } as never;
  try {
    await publicClient.simulateContract(req);
  } catch (err) {
    return { ok: false as const, reason: explainRevert(err) };
  }
  const hash: Hex = await w.writeContract(req);
  const r = await publicClient.waitForTransactionReceipt({ hash });
  return { ok: r.status === "success", hash, url: txUrl(hash), reason: r.status === "success" ? "" : "交易失败" };
}
/** 只模拟，不上链：用来验证"这一步会被合约拒绝" */
async function rejects(w: ReturnType<typeof walletFor>, call: { address: Address; abi: unknown; functionName: string; args?: readonly unknown[] }) {
  try {
    await publicClient.simulateContract({ ...call, account: w.account } as never);
    return "";
  } catch (err) {
    return explainRevert(err);
  }
}
const read = <T>(functionName: string, args: readonly unknown[] = []) =>
  publicClient.readContract({ ...vault, functionName, args } as never) as Promise<T>;

/** AI 一侧：离线规则模式跑一句话，收集每个工具的结果 */
async function ai(text: string) {
  const results: Record<string, any> = {};
  let final = "";
  await runOffline(text, {
    onEvent: (e: AgentEvent) => {
      if (e.type === "tool_result") results[e.name] = e.result;
      if (e.type === "final") final = e.text;
    },
  });
  console.log(`  🤖 「${text}」→ ${final.slice(0, 70)}`);
  return { results, final };
}

type Policy = { dailyLimit: bigint; perTxLimit: bigint; expiresAt: bigint; active: boolean };

async function main() {
  // 端到端测试会在链上留下订单、审批和仲裁记录，只允许在练习环境跑，保证正式演示环境是干净的
  if (AV_ENV !== "rehearsal") {
    console.error("端到端测试只能在练习环境运行：AV_ENV=rehearsal npm run e2e");
    process.exit(1);
  }
  await ensureRegistry(true);
  const before = {
    policy: await read<Policy>("getPolicy", [AGENT]),
    balance: await read<bigint>("balance"),
  };
  const store = findShop("store")!;
  const cloud = allPlatforms()[0];
  console.log(`金库余额 ${fmt(before.balance)}，额度 每日 ${fmt(before.policy.dailyLimit)} / 单笔 ${fmt(before.policy.perTxLimit)}`);

  // 1. 额度规则：改单笔上限 → 读回 → 恢复
  step("控制台 · 额度规则");
  {
    const p = before.policy;
    const r = await send(owner, { ...vault, functionName: "setAgent", args: [AGENT, p.dailyLimit, toUnits(20), p.expiresAt] });
    const now = await read<Policy>("getPolicy", [AGENT]);
    check("保存额度（单笔改成 20）", r.ok && now.perTxLimit === toUnits(20), `单笔上限 = ${fmt(now.perTxLimit)}`, r.url);
    const back = await send(owner, { ...vault, functionName: "setAgent", args: [AGENT, p.dailyLimit, p.perTxLimit, p.expiresAt] });
    check("恢复原额度", back.ok, `单笔上限 = ${fmt((await read<Policy>("getPolicy", [AGENT])).perTxLimit)}`, back.url);
    const bad = await rejects(owner, { ...vault, functionName: "setAgent", args: [AGENT, toUnits(10), toUnits(50), p.expiresAt] });
    check("单笔大于每日额度会被拒绝", bad.includes("InvalidLimits"), bad.split(":")[0]);
  }

  // 2. 紧急冻结 / 解冻
  step("控制台 · 紧急冻结");
  {
    const r = await send(owner, { ...vault, functionName: "pause" });
    check("冻结", r.ok && (await read<boolean>("paused")), "", r.url);
    const blocked = await rejects(walletFor(env.agentKey()), { ...vault, functionName: "pay", args: [findShop("food")!.address, toUnits(1), "order:0"] });
    check("冻结期间 AI 付款被拒绝", blocked.includes("EnforcedPause"), blocked.split(":")[0]);
    const u = await send(owner, { ...vault, functionName: "unpause" });
    check("解冻", u.ok && !(await read<boolean>("paused")), "", u.url);
  }

  // 3. 超额 → 批准
  step("助手 / 控制台 · 超额付款审批");
  {
    const { results } = await ai("给全组 6 个人点奶茶");
    const pay = results.pay_order?.payment;
    check("超额付款进入待审批", pay?.status === "pending_approval", `请求 #${pay?.requestId}，金额 ${pay?.amount}`, pay?.explorer);
    if (pay?.status === "pending_approval") {
      const r = await send(owner, { ...vault, functionName: "approveRequest", args: [BigInt(pay.requestId)] });
      const ref = parseOrderRef(results.create_order.order_id)!;
      const o = await getOrder(ref.shop, ref.id);
      check("批准后订单变成已付款（托管中）", r.ok && o.status === "Paid", `${o.order_id}：${o.statusText}`, r.url);
    }
    const second = await ai("给全组 3 个人点奶茶");
    const p2 = second.results.pay_order?.payment;
    check("第二笔超额也进入待审批", p2?.status === "pending_approval", `请求 #${p2?.requestId}，金额 ${p2?.amount}`, p2?.explorer);
    if (p2?.status === "pending_approval") {
      const r = await send(owner, { ...vault, functionName: "rejectRequest", args: [BigInt(p2.requestId)] });
      const req = await getRequest(BigInt(p2.requestId));
      check("拒绝后钱没有付出（请求状态 = 已拒绝）", r.ok && Number(req.status) === 3, "", r.url);
      const again = await rejects(owner, { ...vault, functionName: "approveRequest", args: [BigInt(p2.requestId)] });
      check("已拒绝的请求不能再批准", again.includes("RequestNotPending"), again.split(":")[0]);
    }
  }

  // 4. 导入新商家 → AI 能买 → 移出 → AI 付不了
  step("控制台 · 商家白名单（导入 / 移出）");
  {
    const add = await send(owner, { ...vault, functionName: "setMerchant", args: [store.address, true] });
    check(`导入「${store.name}」`, add.ok, "", add.url);
    await ensureRegistry(true);
    const { results } = await ai("在小卖部买一瓶可乐");
    const pay = results.pay_order?.payment;
    check("导入后 AI 马上能在这家店下单付款", pay?.status === "executed", `${results.create_order?.order_id} 付款 ${pay?.amount}`, pay?.explorer);
    const rm = await send(owner, { ...vault, functionName: "setMerchant", args: [store.address, false] });
    check("移出白名单（恢复演示前的状态）", rm.ok, "", rm.url);
    const blocked = await rejects(walletFor(env.agentKey()), { ...vault, functionName: "pay", args: [store.address, toUnits(1), "order:999"] });
    check("移出后 AI 付款被合约拒绝", blocked.includes("MerchantNotAllowed"), blocked.split(":")[0]);
  }

  // 5. 外部平台：移出 → 付款被拒 → 加回 → x402 付款成功
  step("控制台 · 外部平台（CloudEats，x402）");
  if (!cloud) check("模拟平台在线", false, "没有发现 CloudEats，请先运行 npm run cloudeats");
  else {
    const rm = await send(owner, { ...vault, functionName: "setMerchant", args: [cloud.address, false] });
    check("移出平台收款地址", rm.ok, "", rm.url);
    await ensureRegistry(true);
    const order = (await runTool("create_order", { merchant: "cloudeats", items: [{ item_id: 2, qty: 1 }], max_total: "18" })) as { order_id?: string };
    const p1 = ((await runTool("pay_order", { order_id: order.order_id }, { recordOnChain: false })) as { payment: { status: string; reason?: string } }).payment;
    check("移出后 x402 付款被合约拒绝", p1.status === "rejected_by_contract", p1.reason?.split(":")[0]);
    const add = await send(owner, { ...vault, functionName: "setMerchant", args: [cloud.address, true] });
    check("加回白名单", add.ok, "", add.url);
    await ensureRegistry(true);
    const r2 = (await runTool("pay_order", { order_id: order.order_id })) as { payment: { status: string; explorer?: string; x402?: { success: boolean } }; order?: { status: string } };
    check("加回后 402 → 金库付款 → 平台核实，订单确认", r2.payment.status === "executed" && r2.order?.status === "Paid" && r2.payment.x402?.success === true, `${order.order_id}`, r2.payment.explorer);
  }

  // 6. 普通地址：加入 → AI 转账 → 移出 → 转账被拒
  step("控制台 · 普通地址（转账）");
  {
    const friend = privateKeyToAccount(generatePrivateKey()).address;
    const add = await send(owner, { ...vault, functionName: "setMerchant", args: [friend, true] });
    check("加入一个普通钱包地址", add.ok, friend, add.url);
    const r = (await runTool("pay", { merchant: friend, amount: "1", memo: "E2E 测试：给朋友转账" })) as { status: string; explorer?: string };
    check("AI 向普通地址转账成功（没有订单和托管）", r.status === "executed", "1 mUSDC", r.explorer);
    const rm = await send(owner, { ...vault, functionName: "setMerchant", args: [friend, false] });
    check("移出这个地址", rm.ok, "", rm.url);
    const blocked = await rejects(walletFor(env.agentKey()), { ...vault, functionName: "pay", args: [friend, toUnits(1), "again"] });
    check("移出后再转账被拒绝", blocked.includes("MerchantNotAllowed"), blocked.split(":")[0]);
  }

  // 7. 平台仲裁
  step("平台仲裁页");
  {
    const ref = parseOrderRef("food-2")!;
    const o = await getOrder(ref.shop, ref.id);
    if (o.status !== "Disputed") check("food-2 处于申诉中", false, `当前状态 ${o.status}`);
    else {
      const notArb = await rejects(owner, { address: ref.shop.address, abi: agentShopAbi, functionName: "resolveDispute", args: [ref.id, true] });
      check("不是仲裁人（金库主人）不能裁决", notArb.includes("NotArbiter"), notArb.split(":")[0]);
      const before = await read<bigint>("balance");
      const r = await send(arbiter, { address: ref.shop.address, abi: agentShopAbi, functionName: "resolveDispute", args: [ref.id, true] });
      const after = await getOrder(ref.shop, ref.id);
      const delta = (await read<bigint>("balance")) - before;
      check("仲裁人裁决退款：food-2 变成已退款，钱回到金库", r.ok && after.status === "Refunded" && delta === toUnits(o.total), `金库 +${fmt(delta)}`, r.url);
      const twice = await rejects(arbiter, { address: ref.shop.address, abi: agentShopAbi, functionName: "resolveDispute", args: [ref.id, false] });
      check("同一单不能再裁决一次", twice.includes("WrongStatus"), twice.split(":")[0]);
    }
  }

  // 8. 资金：领测试币 → 授权 → 存入 → 取出
  step("控制台 · 资金");
  {
    const me = owner.account.address;
    const f = await send(owner, { address: USDC, abi: mockUsdcAbi, functionName: "faucet" });
    check("领取测试币", f.ok || f.reason.includes("FaucetCooldown"), f.ok ? "" : "冷却中，跳过", f.url);
    const a = await send(owner, { address: USDC, abi: mockUsdcAbi, functionName: "approve", args: [VAULT, toUnits(10)] });
    check("授权金库使用 10 mUSDC", a.ok, "", a.url);
    const b0 = await read<bigint>("balance");
    const d = await send(owner, { ...vault, functionName: "deposit", args: [toUnits(10)] });
    check("存入 10", d.ok && (await read<bigint>("balance")) - b0 === toUnits(10), "", d.url);
    const w = await send(owner, { ...vault, functionName: "withdraw", args: [me, toUnits(10)] });
    check("取出 10 到主人钱包", w.ok && (await read<bigint>("balance")) === b0, "", w.url);
    const notOwner = await rejects(walletFor(env.agentKey()), { ...vault, functionName: "withdraw", args: [AGENT, toUnits(1)] });
    check("AI 钱包不能取款", notOwner.includes("OwnableUnauthorizedAccount"), notOwner.split(":")[0]);
  }

  // 9. 商家入驻：通过官方工厂开店
  step("商家入驻页");
  {
    const factory = { address: deployment.contracts.ShopFactory, abi: shopFactoryAbi } as const;
    const tooShort = await rejects(merchant, { ...factory, functionName: "createShop", args: ["x", "", 10n, ["面包"], [toUnits(5)], [10]] });
    check("确认期短于平台下限会被拒绝", tooShort.includes("WindowTooShort"), tooShort.split(":")[0]);
    const count0 = await publicClient.readContract({ ...factory, functionName: "shopCount" });
    const r = await send(merchant, {
      ...factory,
      functionName: "createShop",
      args: ["E2E 测试面包房", "现烤面包，20 分钟送达（端到端测试开的店，未加入白名单）", 3600n, ["牛角包", "全麦吐司"], [toUnits(8), toUnits(12)], [50, 50]],
    });
    const count1 = await publicClient.readContract({ ...factory, functionName: "shopCount" });
    const shop = count1 > count0 ? ((await publicClient.readContract({ ...factory, functionName: "shops", args: [count1 - 1n] })) as Address) : undefined;
    check("开店成功，工厂多了一家店", r.ok && count1 === count0 + 1n, shop ? getAddress(shop) : "", r.url);
    if (shop) {
      const [isShop, shopOwner, items] = await Promise.all([
        publicClient.readContract({ ...factory, functionName: "isShop", args: [shop] }),
        publicClient.readContract({ address: shop, abi: agentShopAbi, functionName: "owner" }),
        publicClient.readContract({ address: shop, abi: agentShopAbi, functionName: "getItems" }),
      ]);
      check("新店是官方模板（isShop = true），店主是商家钱包，菜单 2 项", isShop && shopOwner === merchant.account.address && items.length === 2);
      const listed = await read<boolean>("isMerchant", [shop]);
      check("新店默认不在用户白名单里（要用户自己导入）", !listed);
    }
  }

  // 收尾：额度和白名单恢复了吗
  step("收尾检查");
  {
    const p = await read<Policy>("getPolicy", [AGENT]);
    check("额度和开始时一样", p.dailyLimit === before.policy.dailyLimit && p.perTxLimit === before.policy.perTxLimit);
    check("金库没有冻结", !(await read<boolean>("paused")));
    check("便利店仍不在白名单（留给现场演示导入）", !(await read<boolean>("isMerchant", [store.address])));
    if (cloud) check("云间外卖仍在白名单", await read<boolean>("isMerchant", [cloud.address]));
  }

  // 写结果
  const passed = rows.filter((r) => r.ok).length;
  const lines = [
    "# 端到端测试结果（Sepolia）",
    "",
    `运行时间：${new Date().toISOString()}　结果：**${passed}/${rows.length} 通过**`,
    "",
    "控制台、商家入驻、平台仲裁页面上需要 MetaMask 签名的操作，由脚本用对应角色的测试钱包发出完全相同的合约调用；AI 一侧用离线规则模式（不调用大模型）。脚本：`agent/src/e2e.ts`（`npm run e2e`）。",
    "",
  ];
  let cur = "";
  for (const r of rows) {
    if (r.section !== cur) {
      cur = r.section;
      lines.push(`\n## ${cur}\n`, "| 结果 | 检查 | 说明 | 交易 |", "|---|---|---|---|");
    }
    lines.push(`| ${r.ok ? "✅" : "❌"} | ${r.name} | ${r.detail.replace(/\|/g, "/")} | ${r.tx ? `[查看](${r.tx})` : ""} |`);
  }
  writeFileSync(path.join(ROOT, "docs/E2E-RESULTS.md"), lines.join("\n") + "\n");
  console.log(`\n结果：${passed}/${rows.length} 通过，已写入 docs/E2E-RESULTS.md`);
  process.exit(passed === rows.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
