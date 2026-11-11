// 离线规则模式：没有 API key、或现场没网时的兜底。
// 用关键词把一句话翻译成"看菜单 → 链上下单 → 付款"（和 LLM 模式走完全相同的工具和合约），保证演示不会卡住。
// 它"不聪明"，甚至会照着诈骗店公告去买"激活费" —— 但安全性和 LLM 模式完全一样，因为真正拦截的是链上合约，不是 AI。
import { runTool } from "./tools.js";
import { trustedShops, type Merchant } from "./config.js";
import { ensureRegistry } from "./registry.js";
import { readMenu } from "./shop.js";
import * as ucp from "./ucp.js";
import type { AgentEvent } from "./llm.js";
import type { PayResult, VaultStatus } from "./chain.js";
import type { OrderView } from "./shop.js";

type Plan =
  | { kind: "order"; shop: string; items: { item_id: number; qty: number }[] }
  | { kind: "transfer"; to: string; amount: string }
  | { kind: "status" }
  | { kind: "shops" }
  | { kind: "track" }
  | { kind: "cancel" }
  | { kind: "confirm" }
  | { kind: "dispute" }
  | { kind: "help" };

const CN: Record<string, number> = { 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const toNum = (s?: string) => (s ? (CN[s] ?? Number(s)) : NaN);
const N = "(\\d+|[一两二三四五六七八九十])";

// 外卖菜单（与链上 DeployV2 的菜单顺序一致）：价格、是否辣
const FOOD = [
  { id: 0, re: /牛腩/, price: 22, spicy: false },
  { id: 1, re: /宫保/, price: 20, spicy: true },
  { id: 2, re: /香锅/, price: 28, spicy: true },
  { id: 3, re: /云吞|馄饨/, price: 18, spicy: false },
  { id: 4, re: /鸡腿|便当/, price: 25, spicy: false },
];
const ICED_TEA = { id: 5, price: 4 };

/** 一句话 → 要做的事 */
export function plan(text: string): Plan {
  const t = text.replace(/\s+/g, "");
  const addr = text.match(/0x[0-9a-fA-F]{40}/);
  if (addr) {
    const amt = t.replace(/0x[0-9a-fA-F]{40}/g, "").match(/(\d+(?:\.\d+)?)/)?.[1] ?? "10";
    return { kind: "transfer", to: addr[0], amount: amt };
  }
  if (/没送到|没收到|送错|有问题|不对|投诉|申诉|坏了|少了/.test(t)) return { kind: "dispute" };
  if (/取消|退款|不要了|退掉/.test(t)) return { kind: "cancel" };
  if (/收到了|确认收货|已经到了|拿到了/.test(t)) return { kind: "confirm" };
  if (/到哪|送到了吗|订单状态|我的订单|司机到/.test(t)) return { kind: "track" };
  if (/额度|余额|还剩|多少钱|冻结/.test(t) && !/点|买|叫|订/.test(t)) return { kind: "status" };
  if (/有哪些|哪些店|商家|能买什么/.test(t)) return { kind: "shops" };

  // 诈骗店：离线模式不识别诈骗，会照着店铺公告把"激活费"一起买了 —— 用来演示合约兜底
  if (/天天特价|1折|一折|特价店/.test(t)) return { kind: "order", shop: "deals", items: [{ item_id: 0, qty: 1 }, { item_id: 1, qty: 1 }] };

  if (/打车|叫车|叫个车|网约车|去机场|去高铁/.test(t)) {
    const item_id = /机场/.test(t) ? 3 : /高铁|火车/.test(t) ? 2 : /回家|下班|公司/.test(t) ? 1 : 0;
    return { kind: "order", shop: "ride", items: [{ item_id, qty: 1 }] };
  }

  if (/奶茶|咖啡|拿铁|美式|甘露|柠檬茶|饮料/.test(t)) {
    const people = toNum(t.match(new RegExp(`${N}(?:个人|人|位)`))?.[1]);
    const cups = toNum(t.match(new RegExp(`${N}杯`))?.[1]);
    const qty = cups || people || (/全组|大家|同事们|全部门/.test(t) ? 6 : 1);
    const item_id = /拿铁/.test(t) ? 2 : /美式|咖啡/.test(t) ? 3 : /甘露/.test(t) ? 1 : /柠檬/.test(t) ? 4 : 0;
    return { kind: "order", shop: "tea", items: [{ item_id, qty }] };
  }

  if (/午饭|晚饭|午餐|晚餐|外卖|吃饭|饭|面|便当|饿|香锅|云吞|馄饨|鸡腿|牛腩|宫保/.test(t)) {
    const budget = toNum(t.match(/(\d+)(?:块|元|以内|之内)/)?.[1]) || 30;
    const noSpicy = /不辣|不要辣|不吃辣|别辣/.test(t);
    const named = FOOD.find((f) => f.re.test(t));
    const main =
      named ??
      FOOD.filter((f) => !(noSpicy && f.spicy) && f.price <= budget).sort((a, b) => b.price - a.price)[0] ??
      FOOD[3];
    const items = [{ item_id: main.id, qty: 1 }];
    if (main.price + ICED_TEA.price <= budget) items.push({ item_id: ICED_TEA.id, qty: 1 });
    return { kind: "order", shop: "food", items };
  }
  return { kind: "help" };
}

/** 名称里的关键部分："小卖部·便利店" → ["小卖部", "便利店"]；"矿泉水（500ml）" → "矿泉水" */
const nameParts = (n: string) => n.split(/[·・\s]/).map((x) => x.trim()).filter((x) => x.length >= 2);
const core = (n: string) => n.replace(/[（(].*?[）)]/g, "").trim();

/** 通用规则：话里提到了白名单里某家店的名字 → 去链上读它的菜单，按商品名匹配。管理员新导入的店也能用 */
async function planByShopName(text: string): Promise<Plan | undefined> {
  const t = text.replace(/\s+/g, "");
  await ensureRegistry();
  const shop: Merchant | undefined = trustedShops().find((m) => nameParts(m.name).some((p) => t.includes(p)));
  if (!shop || ["food", "tea", "ride"].includes(shop.id)) return undefined; // 原有三家店走上面的专用规则
  const { menu } = shop.kind === "ucp" ? await ucp.readMenu(shop) : await readMenu(shop);
  // 平台的商品名是"餐厅·菜名"：话里提到餐厅或菜名的前两个字（"汉堡""水煮"）就算匹配，只取第一个
  const loose = menu.find((it) => it.available && nameParts(it.name).some((x) => t.includes(x) || t.includes(x.slice(0, 2))));
  const items = menu
    .filter((it) => it.available && (t.includes(core(it.name)) || nameParts(it.name).some((x) => t.includes(x))))
    .map((it) => {
      const m = t.match(new RegExp(`${N}(?:瓶|个|包|份|盒|杯|袋)?${core(it.name)}`));
      return { item_id: it.item_id, qty: toNum(m?.[1]) || 1 };
    });
  if (items.length === 0) items.push({ item_id: (loose ?? menu.find((x) => x.available))?.item_id ?? 0, qty: 1 });
  return { kind: "order", shop: shop.id, items };
}

/** 英文界面的演示指令 → 中文关键词（离线规则只认中文关键词；LLM 模式不需要这一步） */
const EN_HINTS: [RegExp, string][] = [
  [/cloudeats/i, "云间外卖"],
  [/spicy chicken burger/i, "香辣鸡腿堡"],
  [/daily deals|90% off|天天特价/i, "天天特价"],
  [/milk tea|bubble tea/i, "奶茶"],
  [/coffee|latte/i, "咖啡"],
  [/airport/i, "去机场"],
  [/\bride\b|taxi|\bcab\b/i, "打车"],
  [/lunch|dinner|meal|food/i, "午饭"],
  [/nothing spicy|not spicy|no spicy|mild/i, "不要辣"],
  [/under (\d+)/i, "$1块以内"],
  [/(\d+) people/i, "$1个人"],
  [/not delivered|never arrived|problem|wrong order/i, "有问题"],
  [/cancel/i, "取消"],
  [/where is my order|order status|track/i, "我的订单"],
  [/got it|received/i, "收到了"],
  [/how much|limit|balance/i, "额度"],
  [/which shops|what shops|merchants/i, "有哪些店"],
];
export const toZhHints = (text: string) => (/[a-z]/i.test(text) ? EN_HINTS.reduce((t, [re, zh]) => (re.test(t) ? `${t} ${t.match(re)![0].replace(re, zh)}` : t), text) : text);

export async function runOffline(text: string, opts: { onEvent?: (e: AgentEvent) => void; lang?: "zh" | "en" } = {}) {
  const emit = opts.onEvent ?? (() => {});
  const en = opts.lang === "en";
  const L = (zh: string, enText: string) => (en ? enText : zh);
  text = toZhHints(text);
  emit({ type: "mode", mode: "offline" });
  let i = 0;
  const call = async (name: string, input: Record<string, unknown> = {}) => {
    const id = `offline_${++i}`;
    emit({ type: "tool", id, name, input });
    try {
      const result = await runTool(name, input);
      emit({ type: "tool_result", id, name, result });
      return result as Record<string, unknown>;
    } catch (err) {
      emit({ type: "tool_result", id, name, result: { status: "error", reason: err instanceof Error ? err.message : String(err) } });
      throw err;
    }
  };
  const final = (t: string) => emit({ type: "final", text: t });
  const failed = (r: Record<string, unknown>) => r.status === "invalid_input" || r.status === "rejected_by_contract" || r.status === "error";

  const p = (await planByShopName(text)) ?? plan(text);
  switch (p.kind) {
    case "status": {
      const st = (await call("get_vault_status")) as unknown as VaultStatus;
      return final(
        L(
          `小钱包余额 ${st.vaultBalance}，今天还能自动花 ${st.remainingToday} / ${st.dailyLimit}，单笔上限 ${st.perTxLimit}。${st.paused ? "钱包目前被冻结了。" : ""}`,
          `Wallet balance ${st.vaultBalance}. You can still spend ${st.remainingToday} of ${st.dailyLimit} today automatically; per-payment cap ${st.perTxLimit}.${st.paused ? " The wallet is frozen right now." : ""}`,
        ),
      );
    }
    case "shops": {
      await call("list_merchants");
      return final(L(`主人信任的商家有：${trustedShops().map((m) => m.name).join("、")}。`, `Trusted shops: ${trustedShops().map((m) => m.name).join(", ")}.`));
    }
    case "track": {
      const o = await call("check_order", { order_id: "" });
      return final(failed(o) ? L("还没有订单。", "No orders yet.") : L(`${o.shopName} 订单 ${o.order_id}：${o.statusText}。`, `${o.shopName} order ${o.order_id}: ${o.status}.`));
    }
    case "cancel": {
      const r = await call("cancel_order", { order_id: "" });
      if (r.status === "refunded") return final(L(`已取消，${r.amount} 已从商家合约退回小钱包。`, `Cancelled. ${r.amount} went back from the shop contract to your wallet.`));
      if (r.refundTx) return final(L(`已取消，平台已把 ${r.amount} 从收款地址退回小钱包。`, `Cancelled. The platform refunded ${r.amount} to your wallet.`));
      if (r.status === "cancelled") return final(L("订单还没付款，已直接取消。", "The order wasn't paid yet, so it was simply cancelled."));
      return final(L(`取消失败：${r.reason}`, `Couldn't cancel: ${r.reason}`));
    }
    case "dispute": {
      const r = await call("report_problem", { order_id: "" });
      return final(
        r.status === "refunded_by_platform"
          ? L(`已经向平台申诉，平台核实后已把 ${r.amount} 退回小钱包。`, `Disputed with the platform. After checking, it refunded ${r.amount} to your wallet.`)
          : r.status === "disputed"
          ? L("已经帮你申诉了：这笔钱冻结在商家合约的托管里，不会放给商家，等商家退款或平台仲裁。", "Dispute filed. The money is frozen in the shop's escrow and won't go to the shop until it refunds or the platform rules.")
          : L(`申诉失败：${r.reason}（只能在送达后、自动放款前申诉；还没送达的订单可以直接说"取消"）`, `Couldn't dispute: ${r.reason} (only after delivery and before auto-release; for undelivered orders just say "cancel")`),
      );
    }
    case "confirm": {
      const r = await call("confirm_received", { order_id: "" });
      return final(r.status === "completed" ? L("已确认收货，货款已从托管放给商家。", "Receipt confirmed. The escrowed money was released to the shop.") : L(`确认失败：${r.reason}`, `Couldn't confirm: ${r.reason}`));
    }
    case "transfer": {
      const r = (await call("pay", { merchant: p.to, amount: p.amount, memo: "用户指令中的转账" })) as unknown as PayResult;
      return final(
        r.status === "executed"
          ? L(`已转账 ${r.amount}。`, `Sent ${r.amount}.`)
          : r.status === "pending_approval"
            ? L(`金额超出额度，已提交主人审批 #${r.requestId}。`, `Over the limit, sent to the owner for approval #${r.requestId}.`)
            : L(`转账被拒绝：${"reason" in r ? r.reason : ""}`, `Transfer rejected: ${"reason" in r ? r.reason : ""}`),
      );
    }
    case "help":
      return final(
        L(
          "（离线规则模式）我能听懂简单的指令，比如：帮我点个午饭 30 块以内不要辣、给全组 6 个人点奶茶、叫个车去机场、我的外卖到哪了、取消刚才的订单、收到了、外卖有问题、我还剩多少额度。在控制台填上 API Key 就能切换到真正的 AI 模式。",
          "(Offline rules mode) I understand simple requests like: order me lunch under 30 nothing spicy, milk tea for 6 people, a ride to the airport, where is my order, cancel that order, got it, my food never arrived, how much can I spend. Add an API key in the console to switch to real AI mode.",
        ),
      );
    case "order": {
      // 按刚看到的菜单价格算出"能接受的最高总价"：商家如果在下单前一刻涨价，合约会拒绝
      const m = (await call("browse_menu", { merchant: p.shop })) as { menu?: { item_id: number; price: string }[] };
      const expected = p.items.reduce((s, it) => s + Number(m.menu?.find((x) => x.item_id === it.item_id)?.price ?? 0) * it.qty, 0);
      const o = (await call("create_order", { merchant: p.shop, items: p.items, max_total: expected.toFixed(2) })) as unknown as OrderView & {
        status: string;
        reason?: string;
      };
      if (!o.order_id) return final(L(`下单失败：${o.reason}`, `Order failed: ${o.reason}`));
      const r = (await call("pay_order", { order_id: o.order_id })) as { payment?: PayResult; order?: OrderView; reason?: string };
      if (!r.payment) return final(L(`没法付款：${r.reason ?? "未知原因"}`, `Couldn't pay: ${r.reason ?? "unknown reason"}`));
      const what = o.items.map((x) => `${x.name}${x.qty > 1 ? ` ×${x.qty}` : ""}`).join("、");
      const pay = r.payment;
      if (pay.status === "executed")
        return final(
          (o as { kind?: string }).kind === "ucp"
            ? L(`已在${o.shopName}下单：${what}，共 ${o.total}。按 x402 协议从小钱包付到了平台的收款地址，平台已在链上核实收款。`, `Ordered on ${o.shopName}: ${what}, ${o.total} in total. Paid via x402 from your wallet to the platform's address; the platform verified it on-chain.`)
            : L(`已下单：${what}，共 ${o.total}。钱先放在商家合约里托管，送达后再放给商家。`, `Ordered: ${what}, ${o.total} in total. The money is held in the shop contract's escrow until delivery.`),
        );
      if (pay.status === "pending_approval")
        return final(L(`${what} 共 ${o.total}，超出了单笔额度，需要你确认：点下面的「批准并付款」就行。`, `${what} comes to ${o.total}, over the per-payment cap. Tap "Approve & pay" below to confirm.`));
      return final(
        L(
          `下单失败：${what} 共 ${o.total}，付款被合约拒绝（${pay.reason}）。${p.shop === "deals" ? "这家店不在你的白名单里，而且要求先付「激活费」，很可能是诈骗。" : ""}`,
          `Order failed: ${what}, ${o.total} in total. The contract rejected the payment (${pay.reason}).${p.shop === "deals" ? " This shop isn't on your whitelist and demands an \"activation fee\" first — very likely a scam." : ""}`,
        ),
      );
    }
  }
}
