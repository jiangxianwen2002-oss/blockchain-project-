// 订单小票：两个应用共用。数据全部直接读自链上的商家合约；"链上凭证"从交易回执解码真实转账
import { useState, type ReactNode } from "react";
import { Car, ChevronDown, Clock, CupSoda, Store, UtensilsCrossed, X } from "lucide-react";
import { useReadContract } from "wagmi";
import { agentVaultAbi } from "../generated/abi";
import { dep, labelOf, VAULT, type Shop } from "../config";
import { useOrder, useOrderReceipts, useShopItems } from "../hooks";
import { Badge, ExtLink, money, orderLook, PENDING_LABEL, txLink } from "./ui";
import { locale, t, tn } from "../i18n";

export function ShopIcon({ id, size = 18 }: { id: string; size?: number }) {
  if (id === "food") return <UtensilsCrossed size={size} />;
  if (id === "tea") return <CupSoda size={size} />;
  if (id === "ride") return <Car size={size} />;
  return <Store size={size} />;
}

const STEP_LABEL: Record<string, string> = {
  OrderCreated: t("下单", "Order placed"),
  OrderPaid: t("付款，进入托管", "Paid into escrow"),
  OrderDelivered: t("商家送达", "Delivered by shop"),
  OrderCompleted: t("确认，放款给商家", "Confirmed, released to shop"),
  OrderRefunded: t("退款到钱包", "Refunded to wallet"),
  OrderCancelled: t("取消", "Cancelled"),
  Withdrawn: t("商家提现", "Shop withdrew"),
  OrderDisputed: t("买家申诉，钱冻结", "Buyer disputed, funds frozen"),
  DisputeResolved: t("平台仲裁", "Platform ruling"),
};

function Proof({ shop, id, statusKey }: { shop: Shop; id: bigint; statusKey: string }) {
  const q = useOrderReceipts(shop, id, statusKey, true);
  if (q.isLoading) return <div className="proof faint small">{t("正在读取链上交易…", "Reading on-chain transactions…")}</div>;
  if (q.error) return <div className="proof small" style={{ color: "var(--bad)" }}>{t("读取失败", "Failed to load")}</div>;
  return (
    <ol className="proof">
      {(q.data ?? []).map((r) => (
        <li key={r.txHash + r.event}>
          <div className="proof-row">
            <span>{STEP_LABEL[r.event] ?? r.event}</span>
            <ExtLink href={txLink(r.txHash)} className="faint mono">
              #{r.block.toString()}
            </ExtLink>
          </div>
          {r.transfers.map((t, i) => (
            <div key={i} className="proof-transfer">
              <span className="num">{money(t.amount)}</span>
              <span className="faint">
                {labelOf(t.from)} → {labelOf(t.to)}
              </span>
            </div>
          ))}
        </li>
      ))}
    </ol>
  );
}

export function OrderTicket({
  shop,
  id,
  pendingApproval,
  requestId,
  pendingLabel,
  blocked,
  actions,
}: {
  shop: Shop;
  id: bigint;
  pendingApproval?: boolean;
  /** 超额付款对应的金库审批请求：用来显示"已拒绝 / 已过期" */
  requestId?: bigint;
  /** 待审批时显示的文字（自用场景是"待你确认"，控制台是"待审批"） */
  pendingLabel?: string;
  /** 付款被合约拒绝：原因 + 失败交易链接 */
  blocked?: { reason: string; tx?: string };
  actions?: ReactNode;
}) {
  const o = useOrder(shop, id);
  const items = useShopItems().get(shop.id) ?? [];
  const [open, setOpen] = useState(false);
  const req = useReadContract({
    address: VAULT,
    abi: agentVaultAbi,
    functionName: "getRequest",
    args: requestId !== undefined ? [requestId] : undefined,
    query: { enabled: requestId !== undefined && o?.status === "Created", refetchInterval: 5000 },
  }).data as { status: number; createdAt: bigint } | undefined;
  if (!o) return <div className="ticket ticket-loading" />;

  // 审批请求的结果：1 待处理 / 2 已批准（订单会变成已付款）/ 3 已拒绝 / 超过 24 小时视为过期
  const reqState =
    o.status !== "Created" || !req ? undefined
      : req.status === 3 ? "rejected"
      : req.status === 4 || (req.status === 1 && Number(req.createdAt) + 86400 < Date.now() / 1000) ? "expired"
      : req.status === 1 ? "pending" : undefined;
  const look =
    reqState === "rejected" ? { label: t("已拒绝", "Rejected"), tone: "none" as const, icon: <X /> }
      : reqState === "expired" ? { label: t("已过期", "Expired"), tone: "none" as const, icon: <Clock /> }
      : (() => {
          const l = orderLook(o, { pendingApproval: pendingApproval || reqState === "pending", blocked: Boolean(blocked) });
          return pendingLabel && l.label === PENDING_LABEL ? { ...l, label: pendingLabel } : l;
        })();
  const closed = reqState === "rejected" || reqState === "expired";
  const steps = [t("下单", "Ordered"), t("付款", "Paid"), shop.category === "打车" ? t("到达", "Arrived") : t("送达", "Delivered"), t("完成", "Done")];
  const reached = { Created: 0, Paid: 1, Delivered: 2, Disputed: 2, Completed: 3 }[o.status as string] ?? -1;
  const when = new Date(o.createdAt * 1000).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });

  return (
    <div className={`ticket ${blocked && o.status === "Created" ? "ticket-bad" : ""}`}>
      <div className="ticket-head">
        <div className="ticket-icon">
          <ShopIcon id={shop.id} />
        </div>
        <div className="ticket-title">
          <strong>{tn(shop.name)}</strong>
          <span className="faint small">
            {shop.id}-{id.toString()} · {when}
          </span>
        </div>
        <Badge tone={look.tone} icon={look.icon}>
          {look.label}
        </Badge>
      </div>

      <div className="ticket-lines">
        {o.lines.map((l) => {
          const it = items[l.itemId];
          return (
            <div key={l.itemId}>
              <span>
                {it ? tn(it.name) : t(`商品 ${l.itemId}`, `Item ${l.itemId}`)}
                {l.qty > 1 && <span className="faint"> × {l.qty}</span>}
              </span>
              <span className="num muted">{it ? money(it.price * BigInt(l.qty)) : ""}</span>
            </div>
          );
        })}
      </div>
      <div className="ticket-total">
        <span className="muted">{t("合计", "Total")}</span>
        <span className="num">
          <strong>{money(o.total)}</strong> <span className="faint small">mUSDC</span>
        </span>
      </div>

      {blocked && o.status === "Created" ? (
        <div className="ticket-note">
          {t("付款被合约拒绝：", "Payment rejected by the contract: ")}{blocked.reason}{t("。钱没有离开钱包。", ". No money left the wallet.")}
          <div className="ticket-links">
            {blocked.tx && <ExtLink href={blocked.tx}>{t("失败交易", "Failed tx")}</ExtLink>}
            <ExtLink href={`https://sepolia.etherscan.io/token/${dep.contracts.MockUSDC}?a=${shop.address}`}>{t("这家店的收款记录", "This shop's incoming payments")}</ExtLink>
          </div>
        </div>
      ) : (
        reached >= 0 && !closed && (
          <div className="steps">
            {steps.map((s, i) => (
              <div key={s} className={i <= reached ? "on" : ""}>
                <i />
                <span>{s}</span>
              </div>
            ))}
          </div>
        )
      )}

      {closed && <div className="ticket-note muted">{reqState === "rejected" ? t("你拒绝了这笔付款，钱没有付出。", "You rejected this payment. No money was sent.") : t("审批请求已过期，钱没有付出。", "The approval request expired. No money was sent.")}</div>}
      {(o.status !== "Created" || (actions && !closed)) && (
        <div className="ticket-foot">
          {o.status !== "Created" ? (
            <button className="btn btn-ghost btn-sm proof-toggle" onClick={() => setOpen((v) => !v)}>
              {t("链上凭证", "On-chain proof")} <ChevronDown size={14} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
            </button>
          ) : (
            <span />
          )}
          <div className="ticket-actions">{!closed && actions}</div>
        </div>
      )}
      {open && <Proof shop={shop} id={id} statusKey={o.status} />}
    </div>
  );
}
