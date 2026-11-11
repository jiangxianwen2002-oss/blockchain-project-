// 链上动态：把金库和商家合约的事件翻译成一句话
import {
  ArrowDownToLine, ArrowUpFromLine, BadgeCheck, Ban, CircleDollarSign, ClipboardList, Clock, Lock, Pause, Play,
  RotateCcw, Store, ThumbsDown, ThumbsUp, Truck, UserCheck, UserX, X,
} from "lucide-react";
import type { ReactNode } from "react";
import { labelOf, type Shop } from "../config";
import { useActivity } from "../hooks";
import { ExtLink, money, txLink } from "../shared/ui";
import { locale, t, tn } from "../i18n";

type Row = { icon: ReactNode; text: string; amount?: bigint; tone?: "ok" | "warn" | "bad" };

function describe(ev: { eventName?: string; args?: unknown; shop?: Shop }): Row | null {
  const a = (ev.args ?? {}) as Record<string, never>;
  if (ev.shop) {
    const o = `${tn(ev.shop.name)} ${ev.shop.id}-${String(a.orderId)}`;
    switch (ev.eventName) {
      case "OrderCreated": return { icon: <ClipboardList />, text: `${t("AI 下单", "AI placed order")} · ${o}`, amount: a.total };
      case "OrderPaid": return { icon: <Lock />, text: `${t("付款进入托管", "Paid into escrow")} · ${o}`, amount: a.amount };
      case "OrderDelivered": return { icon: <Truck />, text: `${t("商家送达", "Delivered")} · ${o}` };
      case "OrderCompleted": return { icon: <BadgeCheck />, text: `${t("确认收货，放款给商家", "Confirmed, released to shop")} · ${o}`, amount: a.amount, tone: "ok" };
      case "OrderRefunded": return { icon: <RotateCcw />, text: `${t("退款回钱包", "Refunded to wallet")} · ${o}`, amount: a.amount };
      case "OrderCancelled": return { icon: <X />, text: `${t("订单取消", "Order cancelled")} · ${o}` };
      case "Withdrawn": return { icon: <ArrowUpFromLine />, text: `${t("商家提现", "Shop withdrew")} · ${tn(ev.shop.name)}`, amount: a.amount };
      default: return null;
    }
  }
  switch (ev.eventName) {
    case "PaymentExecuted": return { icon: <CircleDollarSign />, text: `${t("AI 付款", "AI paid")} → ${labelOf(a.merchant)}`, amount: a.amount };
    case "PaymentRequested": return { icon: <Clock />, text: `${t("超额，提交审批", "Over limit, approval requested")} #${String(a.requestId)} → ${labelOf(a.merchant)}`, amount: a.amount, tone: "warn" };
    case "RequestApproved": return { icon: <ThumbsUp />, text: `${t("批准", "Approved")} #${String(a.requestId)}`, tone: "ok" };
    case "RequestRejected": return { icon: <ThumbsDown />, text: `${t("拒绝", "Rejected")} #${String(a.requestId)}` };
    case "Deposited": return { icon: <ArrowDownToLine />, text: `${t("存入", "Deposit")} · ${labelOf(a.from)}`, amount: a.amount };
    case "Withdrawn": return { icon: <ArrowUpFromLine />, text: t("管理员取出", "Admin withdrawal"), amount: a.amount };
    case "Paused": return { icon: <Pause />, text: t("钱包被冻结", "Wallet frozen"), tone: "bad" };
    case "Unpaused": return { icon: <Play />, text: t("解除冻结", "Wallet unfrozen") };
    case "AgentSet": return { icon: <UserCheck />, text: t(`设置 AI 额度：每日 ${money(a.dailyLimit, 0)} · 单笔 ${money(a.perTxLimit, 0)}`, `AI limits set: ${money(a.dailyLimit, 0)}/day · ${money(a.perTxLimit, 0)}/payment`) };
    case "AgentRevoked": return { icon: <UserX />, text: t("收回 AI 授权", "AI access revoked"), tone: "bad" };
    case "MerchantSet": return { icon: a.allowed ? <Store /> : <Ban />, text: `${a.allowed ? t("加入白名单", "Whitelisted") : t("移出白名单", "Removed from whitelist")} · ${labelOf(a.merchant)}` };
    default: return null;
  }
}

export function Activity({ limit }: { limit?: number }) {
  const { data, isLoading } = useActivity();
  const rows = (data ?? []).map((ev) => ({ ev, row: describe(ev) })).filter((x) => x.row).slice(0, limit);
  if (isLoading) return <div className="empty">{t("读取链上事件…", "Reading on-chain events…")}</div>;
  if (rows.length === 0) return <div className="empty">{t("还没有动态", "No activity yet")}</div>;
  return (
    <ul className="feed">
      {rows.map(({ ev, row }) => (
        <li key={`${ev.transactionHash}-${ev.logIndex}`} className={row!.tone ? `tone-${row!.tone}` : ""}>
          <span className="feed-ico">{row!.icon}</span>
          <span className="feed-text">{row!.text}</span>
          {row!.amount !== undefined && <span className="num feed-amt">{money(row!.amount)}</span>}
          <ExtLink href={txLink(ev.transactionHash)} className="feed-time faint">
            {new Date(ev.time).toLocaleString(locale, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </ExtLink>
        </li>
      ))}
    </ul>
  );
}
