import { Check, X } from "lucide-react";
import { agentVaultAbi } from "../../generated/abi";
import { allShops, labelOf, VAULT } from "../../config";
import { useIsOwner, useRequests, useTx, useVault } from "../../hooks";
import { Badge, money, TxToast } from "../../shared/ui";
import { t } from "../../i18n";

const TTL = 86400;

function orderOf(merchant: string, memo: string) {
  const shop = allShops.find((s) => s.address.toLowerCase() === merchant.toLowerCase());
  const m = memo.match(/^order:(\d+)$/);
  return shop && m ? `${shop.id}-${m[1]}` : memo || "—";
}

export function Approvals() {
  const { nextRequestId, paused } = useVault();
  const requests = useRequests(nextRequestId);
  const isOwner = useIsOwner();
  const tx = useTx();
  const busy = tx.state.kind === "busy";
  const now = Date.now() / 1000;
  const isPending = (r: (typeof requests)[number]) => r.req.status === 1 && Number(r.req.createdAt) + TTL > now;
  const pending = requests.filter(isPending);
  const history = requests.filter((r) => !isPending(r));
  const v = { address: VAULT, abi: agentVaultAbi } as const;

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-head">
          <h2>{t("待处理", "Pending")}</h2>
          <span className="faint small">{t("AI 超出额度的付款会停在这里，24 小时内有效", "AI payments over the limit wait here for 24 hours")}</span>
        </div>
        {pending.length === 0 && <div className="empty">{t("没有待处理的请求", "Nothing to review")}</div>}
        {pending.map(({ id, req, memo }) => (
          <div className="req" key={id.toString()}>
            <div className="req-main">
              <span className="req-amt num">{money(req.amount)}</span>
              <span className="muted">
                {labelOf(req.merchant)} · {t("订单", "Order")} {orderOf(req.merchant, memo)}
              </span>
              <span className="faint small">
                #{id.toString()} · {t("剩余", "")}{Math.max(0, (Number(req.createdAt) + TTL - now) / 3600).toFixed(1)}{t(" 小时", " h left")}
              </span>
            </div>
            {isOwner && (
              <div className="req-actions">
                <button className="btn" disabled={busy} onClick={() => tx.send(`${t("拒绝", "Reject")} #${id}`, { ...v, functionName: "rejectRequest", args: [id] })}>
                  <X /> {t("拒绝", "Reject")}
                </button>
                <button
                  className="btn btn-primary"
                  disabled={busy || paused}
                  title={paused ? t("冻结期间不能批准", "Can't approve while frozen") : ""}
                  onClick={() => tx.send(`${t("批准", "Approve")} #${id}`, { ...v, functionName: "approveRequest", args: [id] })}
                >
                  <Check /> {t("批准", "Approve")}
                </button>
              </div>
            )}
          </div>
        ))}
        <div className="panel-pad"><TxToast state={tx.state} onClose={tx.clear} /></div>
      </section>

      <section className="panel">
        <div className="panel-head"><h2>{t("历史", "History")}</h2></div>
        {history.length === 0 ? (
          <div className="empty">{t("暂无记录", "No records yet")}</div>
        ) : (
          <table className="table">
            <thead>
              <tr><th>#</th><th>{t("收款方", "Payee")}</th><th>{t("订单", "Order")}</th><th className="right">{t("金额", "Amount")}</th><th>{t("结果", "Result")}</th></tr>
            </thead>
            <tbody>
              {history.map(({ id, req, memo }) => (
                <tr key={id.toString()}>
                  <td className="faint">{id.toString()}</td>
                  <td>{labelOf(req.merchant)}</td>
                  <td className="mono">{orderOf(req.merchant, memo)}</td>
                  <td className="right num">{money(req.amount)}</td>
                  <td>
                    {req.status === 2 ? <Badge tone="ok">{t("已批准", "Approved")}</Badge> : req.status === 3 ? <Badge>{t("已拒绝", "Rejected")}</Badge> : <Badge>{t("已过期", "Expired")}</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
