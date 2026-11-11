// 外部平台（UCP 风格结账 + x402 付款）：前端经 Vite 代理 /ucp 访问本地模拟平台 CloudEats
import { useQuery } from "@tanstack/react-query";
import { Clock, Store } from "lucide-react";
import { Badge, ExtLink, orderLook, txLink } from "./ui";
import { ESCROW_LABEL, PENDING_LABEL } from "./ui";
import { locale, t, tn } from "../i18n";

export type PlatformOrder = {
  id: string;
  status: string;
  line_items: { id: string; name: string; restaurant: string; price: string; quantity: number }[];
  totals: { total: string };
  payment: { payTo: string; amount: string; memo: string };
  order?: { status: string; paid_tx?: string; refund_tx?: string; note?: string };
  created_at: number;
};

const STATUS: Record<string, string> = {
  ready_for_payment: "Created",
  canceled: "Cancelled",
  confirmed: "Paid",
  delivered: "Delivered",
  completed: "Completed",
  refunded: "Refunded",
};

export function usePlatformProfile() {
  return useQuery({
    queryKey: ["ucp-profile"],
    queryFn: async () => {
      const r = await fetch("/ucp/.well-known/ucp");
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<{ name: string; description: string; protocol: string; payment_handlers: { type: string; network: string; asset: string; payTo: string }[]; policies: { refund: string } }>;
    },
    retry: false,
    refetchInterval: 15000,
  });
}

export function usePlatformOrder(id: string) {
  return useQuery({
    queryKey: ["ucp-order", id],
    queryFn: async () => {
      const r = await fetch(`/ucp/checkout-sessions/${id}`);
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<PlatformOrder>;
    },
    refetchInterval: (q) => (["completed", "refunded"].includes(q.state.data?.order?.status ?? "") || q.state.data?.status === "canceled" ? false : 4000),
  });
}

/** 平台订单小票：数据来自平台接口；付款 / 退款交易可以在 Etherscan 上核对 */
export function PlatformTicket({ id, name, pendingApproval, actions }: { id: string; name: string; pendingApproval?: boolean; actions?: React.ReactNode }) {
  const { data: o, error } = usePlatformOrder(id);
  if (error) return <div className="ticket"><div className="ticket-note muted">{t("平台服务没有启动（cd agent && npm run cloudeats）", "Platform service not running (cd agent && npm run cloudeats)")}</div></div>;
  if (!o) return <div className="ticket ticket-loading" />;
  const status = STATUS[o.order?.status ?? o.status] ?? "None";
  const look = orderLook({ status } as never, { pendingApproval: pendingApproval && status === "Created" });
  const label = look.label === PENDING_LABEL ? t("待你确认", "Needs your OK") : look.label === ESCROW_LABEL ? t("已付款", "Paid") : look.label;
  const reached = { Created: 0, Paid: 1, Delivered: 2, Completed: 3 }[status] ?? -1;
  const when = new Date(o.created_at).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="ticket">
      <div className="ticket-head">
        <div className="ticket-icon"><Store size={18} /></div>
        <div className="ticket-title">
          <strong>{tn(name)}</strong>
          <span className="faint small">cloudeats-{o.id} · {when} · x402</span>
        </div>
        <Badge tone={look.tone} icon={status === "Created" && pendingApproval ? <Clock /> : look.icon}>{label}</Badge>
      </div>
      <div className="ticket-lines">
        {o.line_items.map((l) => (
          <div key={l.id}>
            <span>{tn(l.restaurant)}·{tn(l.name)}{l.quantity > 1 && <span className="faint"> × {l.quantity}</span>}</span>
            <span className="num muted">{(Number(l.price) * l.quantity).toFixed(2)}</span>
          </div>
        ))}
      </div>
      <div className="ticket-total">
        <span className="muted">{t("合计", "Total")}</span>
        <span className="num"><strong>{Number(o.totals.total).toFixed(2)}</strong> <span className="faint small">mUSDC</span></span>
      </div>
      {reached >= 0 && (
        <div className="steps">
          {[t("下单", "Ordered"), t("付款", "Paid"), t("送达", "Delivered"), t("完成", "Done")].map((s, i) => (
            <div key={s} className={i <= reached ? "on" : ""}><i /><span>{s}</span></div>
          ))}
        </div>
      )}
      {(o.order?.paid_tx || o.order?.refund_tx || o.order?.note) && (
        <div className="ticket-note muted">
          {t("外部平台订单：钱直接付到平台收款地址，没有链上托管。", "External platform order: paid straight to the platform's address, no on-chain escrow. ")}{o.order?.note}
          <div className="ticket-links">
            {o.order?.paid_tx && <ExtLink href={txLink(o.order.paid_tx)}>{t("付款交易", "Payment tx")}</ExtLink>}
            {o.order?.refund_tx && <ExtLink href={txLink(o.order.refund_tx)}>{t("退款交易", "Refund tx")}</ExtLink>}
          </div>
        </div>
      )}
      {actions && status === "Created" && <div className="ticket-foot"><span /><div className="ticket-actions">{actions}</div></div>}
    </div>
  );
}
