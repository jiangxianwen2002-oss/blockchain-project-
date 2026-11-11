// 外部平台驱动：让 AI 用同样的工具（看菜单 / 下单 / 付款 / 查订单 / 取消 / 申诉 / 确认收货）
// 去"不用我们合约格式"的平台购物。平台遵循 UCP 风格结账 + x402 付款（见 cloudeats.ts）。
//
// 钱怎么走：仍然是 AI 调用金库 pay() 付款到平台的收款地址 —— 金库照样检查白名单、单笔上限、每日额度，
// 超额照样要主人批准。区别只在于钱付出去以后：平台模式没有链上托管，退款按平台规则由平台转回。
import { formatUnits, getAddress, parseUnits, type Address } from "viem";
import { setPlatforms, type Merchant } from "./config.js";
import { pay, USDC, type PayResult } from "./chain.js";
import { injectionHints } from "./shop.js";

/** 已接入的外部平台（UCP 发现地址），逗号分隔 */
const ENDPOINTS = (process.env.UCP_PLATFORMS || "http://127.0.0.1:8788").split(",").map((s) => s.trim()).filter(Boolean);
const NETWORK = "eip155:11155111";

async function call(shop: Merchant, path: string, init: RequestInit = {}) {
  const res = await fetch(shop.endpoint + path, { ...init, headers: { "Content-Type": "application/json", ...(init.headers ?? {}) }, signal: AbortSignal.timeout(15_000) });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data, headers: res.headers };
}

/** 发现平台：读取 /.well-known/ucp，拿到名字和 x402 收款地址；白名单状态由调用方（registry）按链上事件填写 */
export async function discoverPlatforms(allowed: (a: Address) => boolean) {
  const list: Merchant[] = [];
  for (const endpoint of ENDPOINTS) {
    try {
      const res = await fetch(`${endpoint}/.well-known/ucp`, { signal: AbortSignal.timeout(1500) });
      const p = await res.json();
      const h = (p.payment_handlers ?? []).find((x: { type: string; network: string }) => x.type === "x402" && x.network === NETWORK);
      if (!h || String(h.asset).toLowerCase() !== USDC.toLowerCase()) continue; // 不支持我们的网络和币种
      const address = getAddress(h.payTo);
      list.push({
        id: "cloudeats",
        name: p.name,
        emoji: "",
        category: "外卖平台",
        eta: "约 30 分钟",
        address,
        allowed: allowed(address),
        kind: "ucp",
        endpoint,
        protocol: `${p.protocol} + x402`,
      });
    } catch {
      /* 平台没开：跳过 */
    }
  }
  setPlatforms(list);
}

const STATUS: Record<string, string> = {
  ready_for_payment: "Created",
  canceled: "Cancelled",
  confirmed: "Paid",
  delivered: "Delivered",
  completed: "Completed",
  refunded: "Refunded",
};
const TEXT: Record<string, string> = {
  Created: "等待付款",
  Cancelled: "订单已取消",
  Paid: "已付款（钱已付到平台收款地址），餐厅备餐中",
  Delivered: "骑手已送达，等待确认收货",
  Completed: "已完成",
  Refunded: "平台已退款，钱已退回小钱包",
};

type SessionView = {
  id: string;
  status: string;
  line_items: { id: string; name: string; restaurant: string; price: string; quantity: number }[];
  totals: { total: string };
  payment: { payTo: Address; amount: string; memo: string };
  order?: { status: string; paid_tx?: string; refund_tx?: string; note?: string };
  created_at: number;
};

function toOrder(shop: Merchant, s: SessionView) {
  const status = STATUS[s.order?.status ?? s.status] ?? "None";
  return {
    order_id: `${shop.id}-${s.id}`,
    shop: shop.id,
    shopName: shop.name,
    category: shop.category,
    kind: "ucp" as const,
    protocol: shop.protocol,
    status,
    statusText: TEXT[status] ?? status,
    total: s.totals.total,
    items: s.line_items.map((l) => ({ name: `${l.restaurant}·${l.name}`, price: l.price, qty: l.quantity })),
    createdAt: Math.floor(s.created_at / 1000),
    payment: s.payment,
    paidTx: s.order?.paid_tx,
    refundTx: s.order?.refund_tx,
    note: s.order?.note,
  };
}

export async function readMenu(shop: Merchant) {
  const { data } = await call(shop, "/catalog");
  const items = (data.items ?? []) as { id: string; restaurant: string; name: string; price: string }[];
  return {
    shop: { id: shop.id, name: shop.name, category: shop.category, protocol: shop.protocol, payTo: shop.address },
    whitelisted: Boolean(shop.allowed),
    notice: "外部平台（UCP 风格结账 + x402 付款）。付款直接到平台收款地址，没有链上托管，退款按平台规则。",
    warnings: items.flatMap((it) => injectionHints(it.name).map((h) => `「${it.name}」含"${h}"`)),
    menu: items.map((it) => ({ item_id: Number(it.id), name: `${it.restaurant}·${it.name}`, price: it.price, available: true })),
  };
}

export async function createOrder(shop: Merchant, items: { item_id: number; qty: number }[], maxTotal: string) {
  if (!Array.isArray(items) || !items.length) return { status: "invalid_input" as const, reason: "订单里没有商品" };
  if (!/^\d+(\.\d{1,6})?$/.test(maxTotal)) return { status: "invalid_input" as const, reason: `max_total 格式不对：${maxTotal}` };
  const { status, data } = await call(shop, "/checkout-sessions", {
    method: "POST",
    body: JSON.stringify({ line_items: items.map((x) => ({ item: { id: String(x.item_id) }, quantity: Number(x.qty) })) }),
  });
  if (status !== 201) return { status: "rejected_by_platform" as const, reason: data.error ?? `HTTP ${status}` };
  const o = toOrder(shop, data);
  // 防涨价：平台给出的总价超过 AI 按菜单算的价格 → 取消，不付款（链上商家是合约拒绝，这里由 AI 这一层把关）
  if (parseUnits(o.total, 6) > parseUnits(maxTotal, 6)) {
    await call(shop, `/checkout-sessions/${data.id}/cancel`, { method: "POST" });
    return { status: "rejected_by_platform" as const, reason: `平台报价 ${o.total} 超过了能接受的最高价 ${maxTotal}，已取消` };
  }
  return o;
}

export async function getOrder(shop: Merchant, id: string) {
  const { status, data } = await call(shop, `/checkout-sessions/${id}`);
  return status === 200 ? toOrder(shop, data) : undefined;
}

/**
 * x402 付款：
 *   1. POST complete（不带凭证）→ 平台返回 402 + 付款要求
 *   2. 核对付款要求：网络、币种、收款地址都要和白名单里登记的一致，金额要和订单一致
 *   3. 从金库付款（金库检查白名单 / 额度；超额 → 等主人批准，平台会自己在链上发现这笔付款）
 *   4. 带上 X-PAYMENT（交易哈希）重新 POST complete → 平台去链上核实 → 订单成立
 */
export async function payOrder(shop: Merchant, id: string, opts: { recordOnChain?: boolean }) {
  const first = await call(shop, `/checkout-sessions/${id}/complete`, { method: "POST" });
  if (first.status === 200) return { payment: { status: "already_paid" }, order: toOrder(shop, first.data) };
  if (first.status !== 402) return { payment: { status: "rejected_by_platform", reason: first.data.error ?? `HTTP ${first.status}` } };
  const req = first.data.accepts?.[0];
  const order = (await getOrder(shop, id))!;
  if (
    !req || req.scheme !== "exact" || req.network !== NETWORK ||
    String(req.asset).toLowerCase() !== USDC.toLowerCase() ||
    String(req.payTo).toLowerCase() !== shop.address.toLowerCase() ||
    formatUnits(BigInt(req.amount), 6) !== order.total
  )
    return { payment: { status: "rejected_by_agent", reason: "平台给出的付款要求和订单 / 登记的收款地址不一致，没有付款" }, order };

  const result: PayResult = await pay(getAddress(req.payTo), order.total, req.extra?.memo ?? order.payment.memo, opts);
  if (result.status !== "executed") {
    if (result.status === "pending_approval") order.statusText = "超出 AI 的额度，等待主人批准（批准后平台会自动确认收款）";
    return { payment: result, order };
  }
  const proof = Buffer.from(JSON.stringify({ x402Version: 2, scheme: "exact", network: NETWORK, payload: { txHash: result.txHash } })).toString("base64");
  const second = await call(shop, `/checkout-sessions/${id}/complete`, { method: "POST", headers: { "X-PAYMENT": proof } });
  if (second.status !== 200) return { payment: { ...result, platform: `平台没有确认收款：${second.data.error ?? second.status}` }, order };
  const settle = second.headers.get("x-payment-response");
  return { payment: { ...result, x402: settle ? JSON.parse(Buffer.from(settle, "base64").toString("utf8")) : undefined }, order: toOrder(shop, second.data) };
}

async function act(shop: Merchant, id: string, action: "cancel" | "report" | "confirm", ok: string) {
  const { status, data } = await call(shop, `/orders/${id}/${action}`, { method: "POST" });
  if (status !== 200) return { status: "rejected_by_platform", reason: data.error ?? `HTTP ${status}` };
  const order = toOrder(shop, data);
  return { status: ok, order, ...(order.refundTx ? { refundTx: `https://sepolia.etherscan.io/tx/${order.refundTx}`, amount: order.total } : {}) };
}
export const cancelOrder = (shop: Merchant, id: string) => act(shop, id, "cancel", "cancelled");
export const reportProblem = (shop: Merchant, id: string) => act(shop, id, "report", "refunded_by_platform");
export const confirmReceived = (shop: Merchant, id: string) => act(shop, id, "confirm", "completed");

export async function listOrders(shop: Merchant) {
  const { data } = await call(shop, "/orders");
  return ((data.orders ?? []) as SessionView[]).map((s) => toOrder(shop, s));
}
