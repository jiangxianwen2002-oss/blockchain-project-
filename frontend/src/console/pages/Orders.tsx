// 订单：左边列表，右边选中订单的小票（含链上凭证和管理员操作）
import { useState } from "react";
import { agentShopAbi } from "../../generated/abi";
import { useIsOwner, useOrders, useShopItems, useTx, type ChainOrder } from "../../hooks";
import { Download } from "lucide-react";
import { OrderTicket, ShopIcon } from "../../shared/OrderTicket";
import { Badge, money, orderLook, TxToast } from "../../shared/ui";
import { useConfirm } from "../Dialog";
import { isEn, locale, t, tn } from "../../i18n";

function Actions({ o }: { o: ChainOrder }) {
  const isOwner = useIsOwner();
  const tx = useTx();
  const [confirmDialog, confirm] = useConfirm();
  if (!isOwner) return null;
  const call = { address: o.shop.address, abi: agentShopAbi } as const;
  const busy = tx.state.kind === "busy";
  return (
    <>
      {o.status === "Paid" && (
        <button
          className="btn btn-sm btn-danger"
          disabled={busy}
          onClick={async () =>
            (await confirm({
              title: t("取消这单并退款？", "Cancel and refund this order?"),
              body: t(`${money(o.total)} mUSDC 会从「${o.shop.name}」的合约原路退回钱包。注意：退款不会恢复 AI 当天的额度。`, `${money(o.total)} mUSDC goes back from ${tn(o.shop.name)}'s contract to the wallet. Refunds don't restore the AI's daily allowance.`),
              confirm: t("取消并退款", "Cancel & refund"),
              danger: true,
            })) && tx.send(t("取消并退款", "Cancel & refund"), { ...call, functionName: "refund", args: [o.id] })
          }
        >
          {t("取消并退款", "Cancel & refund")}
        </button>
      )}
      {o.status === "Delivered" && (
        <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => tx.send(t("确认收货", "Confirm receipt"), { ...call, functionName: "confirmReceived", args: [o.id] })}>
          {t("确认收货", "Confirm receipt")}
        </button>
      )}
      {tx.state.kind !== "idle" && (
        <div className="float-toast">
          <TxToast state={tx.state} onClose={tx.clear} />
        </div>
      )}
      {confirmDialog}
    </>
  );
}

const STATUS_CN: Record<string, string> = isEn
  ? { Created: "Unpaid", Paid: "In escrow", Delivered: "Delivered", Completed: "Completed", Refunded: "Refunded", Cancelled: "Cancelled", Disputed: "In dispute" }
  : { Created: "未付款", Paid: "托管中", Delivered: "已送达", Completed: "已完成", Refunded: "已退款", Cancelled: "已取消", Disputed: "申诉中" };
const fmtTime = (ts: number) => (ts ? new Date(ts * 1000).toLocaleString(locale, { hour12: false }) : "");

/** 导出 CSV（给财务对账用；Excel 能直接打开，带 BOM 防止中文乱码） */
function exportCsv(orders: ChainOrder[], menus: Map<string, { name: string; price: bigint }[]>) {
  const head = isEn
    ? ["Order", "Shop", "Shop contract", "Status", "Amount (mUSDC)", "Items", "Ordered at", "Paid at", "Delivered at"]
    : ["订单号", "商家", "商家合约", "状态", "金额(mUSDC)", "商品", "下单时间", "付款时间", "送达时间"];
  const rows = orders.map((o) => {
    const items = o.lines.map((l) => `${tn(menus.get(o.shop.id)?.[l.itemId]?.name) || `#${l.itemId}`}×${l.qty}`).join("; ");
    return [`${o.shop.id}-${o.id}`, tn(o.shop.name), o.shop.address, STATUS_CN[o.status] ?? o.status, money(o.total).replace(/,/g, ""), items, fmtTime(o.createdAt), fmtTime(o.paidAt), fmtTime(o.deliveredAt)];
  });
  const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `agentvault-orders-${new Date().toISOString().slice(0, 10)}.csv` });
  a.click();
  URL.revokeObjectURL(url);
}

export function Orders() {
  const all = useOrders();
  const menus = useShopItems();
  // 没付款的只是报价（包括诈骗店那单：付款被合约拒绝，永远停在未付款），默认不显示
  const [showQuotes, setShowQuotes] = useState(false);
  const orders = all.filter((o) => showQuotes || (o.status !== "Created" && o.status !== "Cancelled"));
  const [sel, setSel] = useState<string>();
  const selected = orders.find((o) => `${o.shop.id}-${o.id}` === sel) ?? orders[0];

  return (
    <div className="split">
      <section className="panel">
        <div className="panel-head">
          <h2>{t("全部订单", "All orders")}</h2>
          <div className="btn-row">
            <label className="check small muted">
              <input type="checkbox" checked={showQuotes} onChange={(e) => setShowQuotes(e.target.checked)} /> {t("显示未付款", "Show unpaid")}
            </label>
            <button className="btn btn-sm" disabled={orders.length === 0} onClick={() => exportCsv(orders, menus)}>
              <Download /> {t("导出 CSV", "Export CSV")}
            </button>
          </div>
        </div>
        {orders.length === 0 ? (
          <div className="empty">{t("还没有订单", "No orders yet")}</div>
        ) : (
          <table className="table">
            <thead>
              <tr><th>{t("订单", "Order")}</th><th>{t("商家", "Shop")}</th><th className="right">{t("金额", "Amount")}</th><th>{t("状态", "Status")}</th><th className="hide-sm">{t("时间", "Time")}</th></tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const key = `${o.shop.id}-${o.id}`;
                const look = orderLook(o);
                return (
                  <tr key={key} className={`clickable ${selected && key === `${selected.shop.id}-${selected.id}` ? "sel" : ""}`} onClick={() => setSel(key)}>
                    <td className="mono">{key}</td>
                    <td>
                      <span className="cell-shop"><ShopIcon id={o.shop.id} size={14} />{tn(o.shop.name)}</span>
                    </td>
                    <td className="right num">{money(o.total)}</td>
                    <td><Badge tone={look.tone} icon={look.icon}>{look.label}</Badge></td>
                    <td className="faint hide-sm">{new Date(o.createdAt * 1000).toLocaleString(locale, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
      <div className="split-side">
        {selected && <OrderTicket key={`${selected.shop.id}-${selected.id}`} shop={selected.shop} id={selected.id} actions={<Actions o={selected} />} />}
        <p className="faint small side-note">
          {t("付款后钱锁在商家合约里；送达后确认收货（或 3 分钟后自动确认）才放给商家；送达前可以取消，钱退回钱包。", "After payment the money is locked in the shop contract. It goes to the shop only after you confirm receipt (or automatically 3 minutes after delivery). Before delivery you can cancel and get it back.")}
        </p>
      </div>
    </div>
  );
}
