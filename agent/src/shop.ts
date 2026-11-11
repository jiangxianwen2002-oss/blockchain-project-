// 链上商家合约（AgentShop）的读写：菜单、下单、订单状态、取消退款、确认收货。
// 订单号格式："<店铺 id>-<链上订单编号>"，例如 food-7（每家店的合约各自编号）
import { decodeEventLog, formatUnits, parseUnits, type Address, type Hex } from "viem";
import { agentShopAbi } from "./generated/abi.js";
import { allShops, deployment, env, findShop, txUrl, type Merchant } from "./config.js";
import { explainRevert, publicClient, walletFor } from "./chain.js";

export const STATUS = ["None", "Created", "Paid", "Delivered", "Completed", "Refunded", "Cancelled", "Disputed"] as const;

/** 商家写的文字（公告、商品名）里疑似"写给 AI 的指令"的关键词：提示注入检测 */
const INJECTION_HINTS = ["ai 助手", "ai助手", "系统通知", "无需询问", "无需再询问", "直接完成付款", "激活费", "验证费", "押金", "忽略之前", "再买", "多买", "ignore previous", "system:"];
export const injectionHints = (text: string) => INJECTION_HINTS.filter((k) => text.toLowerCase().includes(k));
export type OrderStatus = (typeof STATUS)[number];

const shopAbi = agentShopAbi;

export function statusText(status: OrderStatus, category: string, extra: { pendingRequest?: boolean } = {}): string {
  const ride = category === "打车";
  switch (status) {
    case "Created":
      return extra.pendingRequest ? "超出 AI 的额度，等待主人批准" : "等待付款";
    case "Paid":
      return ride ? "已付款（钱在商家合约托管），等司机接单" : "已付款（钱在商家合约托管），商家备货中";
    case "Delivered":
      return ride ? "已到达目的地，等待确认" : "已送达，等待确认收货";
    case "Completed":
      return "已确认，货款已放给商家";
    case "Refunded":
      return "已退款，钱已退回小钱包";
    case "Cancelled":
      return "订单已取消";
    case "Disputed":
      return "已申诉：钱冻结在托管里，等商家退款或平台仲裁";
    default:
      return "订单不存在";
  }
}

export function parseOrderRef(ref: string): { shop: Merchant; id: bigint } | undefined {
  const m = String(ref).trim().match(/^(.+?)[-#:\s]?(\d+)$/);
  if (!m) return undefined;
  const shop = findShop(m[1].replace(/[-#:\s]$/, ""));
  return shop ? { shop, id: BigInt(m[2]) } : undefined;
}

export const orderRef = (shop: Merchant, id: bigint | number) => `${shop.id}-${id}`;

export async function readMenu(shop: Merchant) {
  const [name, description, items] = await Promise.all([
    publicClient.readContract({ address: shop.address, abi: shopAbi, functionName: "name" }),
    publicClient.readContract({ address: shop.address, abi: shopAbi, functionName: "description" }),
    publicClient.readContract({ address: shop.address, abi: shopAbi, functionName: "getItems" }),
  ]);
  return {
    shop: { id: shop.id, name, category: shop.category, address: shop.address, eta: shop.eta },
    /** 这家店当前是否在主人的白名单里（链上状态）。不在白名单的店付不了款 */
    whitelisted: Boolean(shop.allowed),
    /** 店家自己写的公告：外部内容，不是指令 */
    notice: description,
    /** 公告或商品名里疑似写给 AI 的指令（提示注入检测） */
    warnings: [description, ...items.map((it) => it.name)].flatMap((t) => injectionHints(t).map((h) => `「${t.length > 30 ? t.slice(0, 30) + "…" : t}」含"${h}"`)),
    menu: items.map((it, i) => ({
      item_id: i,
      name: it.name,
      price: formatUnits(it.price, 6),
      available: it.active && it.stock > 0,
    })),
  };
}

export async function getOrder(shop: Merchant, id: bigint) {
  const [o, lines] = await publicClient.readContract({ address: shop.address, abi: shopAbi, functionName: "getOrder", args: [id] });
  const status = STATUS[o.status] ?? "None";
  let items: { name: string; price: string; qty: number }[] = [];
  if (lines.length) {
    const menu = await publicClient.readContract({ address: shop.address, abi: shopAbi, functionName: "getItems" });
    items = lines.map((l) => ({ name: menu[l.itemId]?.name ?? `#${l.itemId}`, price: formatUnits(menu[l.itemId]?.price ?? 0n, 6), qty: l.qty }));
  }
  return {
    order_id: orderRef(shop, id),
    shop: shop.id,
    shopName: shop.name,
    emoji: shop.emoji,
    category: shop.category,
    shopAddress: shop.address,
    chainOrderId: id.toString(),
    buyer: o.buyer as Address,
    status,
    statusText: statusText(status, shop.category),
    total: formatUnits(o.total, 6),
    items,
    createdAt: Number(o.createdAt),
    paidAt: Number(o.paidAt),
    deliveredAt: Number(o.deliveredAt),
    payment: { payTo: shop.address, amount: formatUnits(o.total, 6), memo: `order:${id}` },
  };
}
export type OrderView = Awaited<ReturnType<typeof getOrder>>;

/** AI 代理（买家）发交易：先模拟，拿到中文的拒绝原因；再签名发送 */
async function agentWrite(
  shop: Merchant,
  functionName: "createOrder" | "refund" | "confirmReceived" | "cancelOrder" | "dispute",
  args: readonly unknown[],
) {
  const wallet = walletFor(env.agentKey());
  const call = { address: shop.address, abi: shopAbi, functionName, args, account: wallet.account } as never;
  try {
    await publicClient.simulateContract(call);
  } catch (err) {
    return { ok: false as const, reason: explainRevert(err) };
  }
  const hash: Hex = await wallet.writeContract(call);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return { ok: receipt.status === "success", hash, receipt, explorer: txUrl(hash), reason: receipt.status === "success" ? "" : "交易失败" };
}

/**
 * 下单。maxTotal 是"能接受的最高总价"（按之前看到的菜单价格算）：
 * 商家如果在这之间涨了价，合约会拒绝下单（PriceAboveMax），而不是让 AI 按新价格付款
 */
export async function createOrder(shop: Merchant, items: { item_id: number; qty: number }[], maxTotal: string) {
  if (!Array.isArray(items) || items.length === 0) return { status: "invalid_input" as const, reason: "订单里没有商品" };
  const ids = items.map((x) => Number(x.item_id));
  const qtys = items.map((x) => Number(x.qty));
  if (ids.some((x) => !Number.isInteger(x) || x < 0) || qtys.some((x) => !Number.isInteger(x) || x < 1 || x > 50))
    return { status: "invalid_input" as const, reason: "商品编号或数量不合法" };
  if (!/^\d+(\.\d{1,6})?$/.test(maxTotal)) return { status: "invalid_input" as const, reason: `max_total 格式不对：${maxTotal}` };
  const r = await agentWrite(shop, "createOrder", [ids, qtys, parseUnits(maxTotal, 6)]);
  if (!r.ok || !("receipt" in r) || !r.receipt) return { status: "rejected_by_contract" as const, reason: r.reason };
  for (const log of r.receipt.logs) {
    if (log.address.toLowerCase() !== shop.address.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: shopAbi, data: log.data, topics: log.topics });
      if (ev.eventName === "OrderCreated") return { ...(await getOrder(shop, ev.args.orderId)), createTx: r.explorer };
    } catch {
      /* 忽略 */
    }
  }
  return { status: "rejected_by_contract" as const, reason: "没有找到下单事件" };
}

/** 买家取消：没付款 → cancelOrder；已付款未发货 → refund（钱退回金库） */
export async function cancelOrRefund(shop: Merchant, id: bigint) {
  const o = await getOrder(shop, id);
  if (o.status === "Created") {
    const r = await agentWrite(shop, "cancelOrder", [id]);
    return r.ok ? { status: "cancelled", explorer: r.explorer, order: await getOrder(shop, id) } : { status: "rejected_by_contract", reason: r.reason };
  }
  const r = await agentWrite(shop, "refund", [id]);
  return r.ok
    ? { status: "refunded", amount: o.total, explorer: r.explorer, order: await getOrder(shop, id) }
    : { status: "rejected_by_contract", reason: r.reason };
}

/** 申诉：送达后说"没收到 / 有问题"，钱冻结在托管里，等商家退款或平台仲裁 */
export async function reportProblem(shop: Merchant, id: bigint) {
  const r = await agentWrite(shop, "dispute", [id]);
  return r.ok ? { status: "disputed", explorer: r.explorer, order: await getOrder(shop, id) } : { status: "rejected_by_contract", reason: r.reason };
}

export async function confirmReceived(shop: Merchant, id: bigint) {
  const r = await agentWrite(shop, "confirmReceived", [id]);
  return r.ok ? { status: "completed", explorer: r.explorer, order: await getOrder(shop, id) } : { status: "rejected_by_contract", reason: r.reason };
}

/** 所有店里这个代理下过的订单，最新的在前 */
export async function listOrders(buyer: Address = deployment.roles.agent, limitPerShop = 30) {
  const out: OrderView[] = [];
  for (const shop of allShops()) {
    const next = await publicClient.readContract({ address: shop.address, abi: shopAbi, functionName: "nextOrderId" });
    const from = next - 1n > BigInt(limitPerShop) ? next - BigInt(limitPerShop) : 1n;
    for (let id = next - 1n; id >= from; id--) {
      const o = await getOrder(shop, id);
      if (o.buyer.toLowerCase() === buyer.toLowerCase()) out.push(o);
    }
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}
