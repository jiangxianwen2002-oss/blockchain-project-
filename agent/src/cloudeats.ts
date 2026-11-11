// 模拟的外部外卖平台「云间外卖 CloudEats」：演示 AI 小钱包如何接入"不用我们合约格式"的大平台。
//
// 它遵循两套主流的 AI 购物协议（简化版）：
//   · 结账层：UCP / ACP 风格的 REST 接口 —— 商品目录 → 创建结账会话 → 完成结账 → 查订单
//   · 付款层：x402 —— 完成结账时如果没带付款凭证，返回 HTTP 402 和付款要求
//              { scheme: "exact", network: "eip155:11155111", asset: mUSDC, payTo, amount }
//     AI 从金库付款到 payTo（金库照样检查白名单和额度），再带着交易哈希重新请求，平台去链上核实
//
// 和真实 x402 的区别：标准 x402 的 exact 方案是用户钱包签一个 USDC 授权（EIP-3009），由平台代为提交。
// 我们的钱在金库合约里，合约签不了这种授权，所以改为"金库先付款，交易哈希作为付款凭证"（x402 兼容的变体）。
//
// 平台的商家不需要在链上部署任何合约；平台只有一个收款地址。退款由平台按自己的规则从收款地址转回金库。
// 用法：npm run cloudeats（监听 127.0.0.1:8788）
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { decodeEventLog, formatUnits, parseUnits, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { agentVaultAbi, mockUsdcAbi } from "./generated/abi.js";
import { AV_ENV, ROOT } from "./config.js";
import { publicClient, USDC, VAULT, walletFor } from "./chain.js";

const PORT = Number(process.env.CLOUDEATS_PORT || 8788);
const NETWORK = "eip155:11155111"; // CAIP-2：Sepolia
const KEY = process.env.CLOUDEATS_PRIVATE_KEY as Hex | undefined;
if (!KEY) throw new Error("缺少 CLOUDEATS_PRIVATE_KEY（.env）");
const PAY_TO = privateKeyToAccount(KEY).address;
// 每个环境一份订单文件：练习环境的测试订单不会出现在正式环境里
const DB = path.join(ROOT, `agent/cloudeats.${AV_ENV}.local.json`);
const DELIVER_AFTER = 40_000; // 付款 40 秒后"骑手送达"
const AUTO_COMPLETE = 3 * 60_000; // 送达 3 分钟没人确认，自动完成

const CATALOG = [
  { id: "1", restaurant: "汉堡工坊", name: "双层牛肉堡套餐", price: "32" },
  { id: "2", restaurant: "汉堡工坊", name: "香辣鸡腿堡", price: "18" },
  { id: "3", restaurant: "川味小馆", name: "水煮鱼单人份", price: "38" },
  { id: "4", restaurant: "川味小馆", name: "麻婆豆腐饭", price: "22" },
  { id: "5", restaurant: "轻食沙拉", name: "鸡胸肉凯撒沙拉", price: "26" },
  { id: "6", restaurant: "茶语", name: "生椰拿铁", price: "16" },
];

type Line = { id: string; name: string; restaurant: string; price: string; quantity: number };
type OrderStatus = "confirmed" | "delivered" | "completed" | "refunded";
type Session = {
  id: number;
  status: "ready_for_payment" | "completed" | "canceled";
  line_items: Line[];
  total: string; // 原子单位（6 位小数）
  memo: string;
  created_at: number;
  order?: { status: OrderStatus; paid_tx: Hex; paid_at: number; delivered_at?: number; refund_tx?: Hex; note?: string };
};

const db: { next: number; sessions: Record<number, Session>; usedTx: string[]; lastBlock?: string } = existsSync(DB)
  ? JSON.parse(readFileSync(DB, "utf8"))
  : { next: 1, sessions: {}, usedTx: [] };
const save = () => writeFileSync(DB, JSON.stringify(db, null, 2));

const money = (atomic: string) => formatUnits(BigInt(atomic), 6);

function view(s: Session) {
  return {
    id: String(s.id),
    status: s.status,
    line_items: s.line_items,
    totals: { total: money(s.total), currency: "mUSDC" },
    payment: { protocol: "x402", payTo: PAY_TO, amount: money(s.total), memo: s.memo },
    order: s.order && { id: String(s.id), ...s.order },
    created_at: s.created_at,
  };
}

/** x402 付款要求（HTTP 402 的响应体） */
const paymentRequired = (s: Session) => ({
  x402Version: 2,
  error: "需要付款",
  accepts: [
    {
      scheme: "exact",
      network: NETWORK,
      asset: USDC,
      payTo: PAY_TO,
      amount: s.total,
      resource: `http://127.0.0.1:${PORT}/checkout-sessions/${s.id}/complete`,
      description: `云间外卖订单 #${s.id}`,
      maxTimeoutSeconds: 24 * 3600,
      extra: { name: "mUSDC", decimals: 6, memo: s.memo },
    },
  ],
});

/** 去链上核实：这笔交易确实从金库转了 amount 到平台收款地址，备注是这个订单 */
async function verifyPayment(txHash: Hex, s: Session): Promise<string | undefined> {
  if (db.usedTx.includes(txHash.toLowerCase())) return "这笔交易已经用过了";
  const r = await publicClient.getTransactionReceipt({ hash: txHash }).catch(() => undefined);
  if (!r || r.status !== "success") return "找不到这笔交易或交易失败";
  let paid = false;
  let memo: string | undefined;
  for (const log of r.logs) {
    try {
      if (log.address.toLowerCase() === USDC.toLowerCase()) {
        const ev = decodeEventLog({ abi: mockUsdcAbi, data: log.data, topics: log.topics });
        if (ev.eventName === "Transfer") {
          const a = ev.args as { from: Address; to: Address; value: bigint };
          if (a.from.toLowerCase() === VAULT.toLowerCase() && a.to.toLowerCase() === PAY_TO.toLowerCase() && a.value === BigInt(s.total)) paid = true;
        }
      }
      if (log.address.toLowerCase() === VAULT.toLowerCase()) {
        const ev = decodeEventLog({ abi: agentVaultAbi, data: log.data, topics: log.topics });
        if (ev.eventName === "PaymentExecuted") memo = (ev.args as { memo: string }).memo;
        if (ev.eventName === "RequestApproved") {
          // 超额付款由主人批准：备注存在金库的审批请求里
          memo = await publicClient.readContract({ address: VAULT, abi: agentVaultAbi, functionName: "getRequestMemo", args: [(ev.args as { requestId: bigint }).requestId] });
        }
      }
    } catch {
      /* 别的事件 */
    }
  }
  if (!paid) return "链上没有找到金库付给平台的这笔款（金额或收款地址不对）";
  if (memo !== s.memo) return `付款备注不对（应为 ${s.memo}）`;
  return undefined;
}

function markPaid(s: Session, txHash: Hex) {
  s.status = "completed";
  s.order = { status: "confirmed", paid_tx: txHash, paid_at: Date.now() };
  db.usedTx.push(txHash.toLowerCase());
  save();
  console.log(`💰 订单 #${s.id} 已付款 ${money(s.total)} mUSDC（${txHash}）`);
}

/** 平台按自己的规则退款：从收款地址把 mUSDC 转回金库 */
async function refund(s: Session, note: string) {
  const w = walletFor(KEY!);
  const hash = await w.writeContract({ address: USDC, abi: mockUsdcAbi, functionName: "transfer", args: [VAULT, BigInt(s.total)] });
  await publicClient.waitForTransactionReceipt({ hash });
  s.order = { ...s.order!, status: "refunded", refund_tx: hash, note };
  save();
  console.log(`↩️  订单 #${s.id} 已退款（${hash}）`);
  return hash;
}

// 后台：① 发现"主人批准后才到账"的付款（AI 那时拿不到交易哈希）② 模拟骑手送达、超时自动完成
let watching = false;
async function tick() {
  if (watching) return;
  watching = true;
  try {
    const waiting = Object.values(db.sessions).filter((s) => s.status === "ready_for_payment");
    if (waiting.length) {
      const head = await publicClient.getBlockNumber();
      const from = db.lastBlock ? BigInt(db.lastBlock) + 1n : head - 500n;
      if (from <= head) {
        const logs = await publicClient.getContractEvents({ address: USDC, abi: mockUsdcAbi, eventName: "Transfer", args: { from: VAULT, to: PAY_TO }, fromBlock: from, toBlock: head });
        for (const l of logs) for (const s of waiting) if (s.status === "ready_for_payment" && !(await verifyPayment(l.transactionHash!, s))) markPaid(s, l.transactionHash!);
        db.lastBlock = head.toString();
        save();
      }
    }
    const now = Date.now();
    for (const s of Object.values(db.sessions)) {
      if (s.order?.status === "confirmed" && now - s.order.paid_at > DELIVER_AFTER) {
        s.order.status = "delivered";
        s.order.delivered_at = now;
        save();
        console.log(`🛵 订单 #${s.id} 已送达`);
      } else if (s.order?.status === "delivered" && now - (s.order.delivered_at ?? now) > AUTO_COMPLETE) {
        s.order.status = "completed";
        save();
      }
    }
  } catch (e) {
    console.error("后台任务出错：", e instanceof Error ? e.message.split("\n")[0] : e);
  } finally {
    watching = false;
  }
}
setInterval(tick, 8000);

// ─────────────── HTTP 接口 ───────────────

function send(res: ServerResponse, code: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", ...headers });
  res.end(JSON.stringify(body));
}
async function body(req: IncomingMessage) {
  let raw = "";
  for await (const c of req) raw += c;
  return raw ? JSON.parse(raw) : {};
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const p = url.pathname.replace(/^\/ucp/, "");
  const m = p.match(/^\/(checkout-sessions|orders)\/(\d+)(?:\/(\w+))?$/);
  const s = m ? db.sessions[Number(m[2])] : undefined;
  try {
    // 平台说明（UCP 的发现入口）：AI 和控制台从这里知道平台支持什么、往哪个地址付款
    if (p === "/.well-known/ucp")
      return send(res, 200, {
        name: "云间外卖 CloudEats",
        description: "模拟的外部外卖平台（汉堡工坊、川味小馆、轻食沙拉、茶语）",
        protocol: "UCP 风格结账（简化版）",
        services: { catalog: "/catalog", checkout: "/checkout-sessions", orders: "/orders" },
        payment_handlers: [{ type: "x402", scheme: "exact", network: NETWORK, asset: USDC, payTo: PAY_TO }],
        policies: { refund: "送达前可取消；送达后申诉，平台核实后从收款地址退回" },
      });

    if (p === "/catalog") return send(res, 200, { items: CATALOG });

    if (p === "/checkout-sessions" && req.method === "POST") {
      const b = await body(req);
      const lines: Line[] = [];
      for (const li of b.line_items ?? []) {
        const it = CATALOG.find((x) => x.id === String(li?.item?.id ?? li?.id));
        const q = Number(li?.quantity);
        if (!it || !Number.isInteger(q) || q < 1 || q > 20) return send(res, 400, { error: `商品或数量不合法：${JSON.stringify(li)}` });
        lines.push({ ...it, quantity: q });
      }
      if (!lines.length) return send(res, 400, { error: "购物车是空的" });
      const total = lines.reduce((a, l) => a + parseUnits(l.price, 6) * BigInt(l.quantity), 0n);
      const id = db.next++;
      db.sessions[id] = { id, status: "ready_for_payment", line_items: lines, total: total.toString(), memo: `cloudeats:${id}`, created_at: Date.now() };
      save();
      return send(res, 201, view(db.sessions[id]));
    }

    if (p === "/orders" && req.method === "GET")
      return send(res, 200, { orders: Object.values(db.sessions).sort((a, b) => b.id - a.id).slice(0, 30).map(view) });

    if (!s) return send(res, 404, { error: "订单不存在" });
    const action = m![3];

    if (!action && req.method === "GET") return send(res, 200, view(s));

    // 完成结账：x402 —— 没带付款凭证就返回 402
    if (m![1] === "checkout-sessions" && action === "complete" && req.method === "POST") {
      // 已经付过款（比如后台扫描先在链上发现了这笔钱）：照样返回付款回执，客户端拿到的结果和正常流程一样
      if (s.status === "completed") {
        const receipt = s.order?.paid_tx && Buffer.from(JSON.stringify({ success: true, transaction: s.order.paid_tx, network: NETWORK, payer: VAULT })).toString("base64");
        return send(res, 200, view(s), receipt ? { "X-PAYMENT-RESPONSE": receipt } : {});
      }
      if (s.status === "canceled") return send(res, 409, { error: "订单已取消" });
      const header = req.headers["x-payment"];
      if (!header) return send(res, 402, paymentRequired(s));
      let txHash: Hex;
      try {
        const pl = JSON.parse(Buffer.from(String(header), "base64").toString("utf8"));
        if (pl.scheme !== "exact" || pl.network !== NETWORK) throw new Error();
        txHash = pl.payload.txHash;
      } catch {
        return send(res, 400, { error: "X-PAYMENT 格式不对" });
      }
      const why = await verifyPayment(txHash, s);
      if (why) return send(res, 402, { ...paymentRequired(s), error: why });
      markPaid(s, txHash);
      const receipt = Buffer.from(JSON.stringify({ success: true, transaction: txHash, network: NETWORK, payer: VAULT })).toString("base64");
      return send(res, 200, view(s), { "X-PAYMENT-RESPONSE": receipt });
    }

    if (action === "cancel" && req.method === "POST") {
      if (s.status === "ready_for_payment") {
        s.status = "canceled";
        save();
        return send(res, 200, view(s));
      }
      if (s.order?.status !== "confirmed") return send(res, 409, { error: "已送达的订单不能取消，请申诉" });
      await refund(s, "送达前取消，全额退款");
      return send(res, 200, view(s));
    }

    if (action === "report" && req.method === "POST") {
      if (s.order?.status !== "delivered") return send(res, 409, { error: "只有已送达、还没完成的订单可以申诉" });
      await refund(s, "申诉成立（模拟平台客服核实），全额退款");
      return send(res, 200, view(s));
    }

    if (action === "confirm" && req.method === "POST") {
      if (s.order?.status !== "delivered") return send(res, 409, { error: "订单还没送达" });
      s.order.status = "completed";
      save();
      return send(res, 200, view(s));
    }

    send(res, 404, { error: "not found" });
  } catch (e) {
    send(res, 500, { error: e instanceof Error ? e.message : String(e) });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`🍔 云间外卖 CloudEats（模拟平台）已启动：http://127.0.0.1:${PORT}（环境：${AV_ENV}）`);
  console.log(`   协议：UCP 风格结账 + x402 付款；收款地址 ${PAY_TO}`);
});
