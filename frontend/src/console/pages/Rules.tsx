import { useEffect, useState } from "react";
import { agentVaultAbi } from "../../generated/abi";
import { dep, short, toUnits, VAULT } from "../../config";
import { useIsOwner, useTx, useVault } from "../../hooks";
import { ExtLink, addrLink, money, TxToast } from "../../shared/ui";
import { useConfirm } from "../Dialog";
import { locale, t } from "../../i18n";

export function Rules() {
  const { policy, remaining } = useVault();
  const isOwner = useIsOwner();
  const tx = useTx();
  const [daily, setDaily] = useState("");
  const [perTx, setPerTx] = useState("");
  const [days, setDays] = useState("30");
  const [confirmDialog, confirm] = useConfirm();
  const now = Date.now() / 1000;
  const active = Boolean(policy?.active) && Number(policy?.expiresAt ?? 0) > now;
  const agent = dep.roles.agent;
  const spent = policy && remaining !== undefined ? policy.dailyLimit - remaining : undefined;
  const pct = policy && spent !== undefined && policy.dailyLimit > 0n ? Number((spent * 100n) / policy.dailyLimit) : 0;
  const busy = tx.state.kind === "busy";
  const v = { address: VAULT, abi: agentVaultAbi } as const;

  useEffect(() => {
    if (policy && !daily) {
      setDaily(String(Number(policy.dailyLimit) / 1e6));
      setPerTx(String(Number(policy.perTxLimit) / 1e6));
    }
  }, [policy, daily]);

  return (
    <div className="stack narrow">
      <section className="panel panel-pad">
        <div className="panel-head flush">
          <h2>{t("AI 代理", "AI agent")}</h2>
          <span className={`badge ${active ? "badge-ok" : "badge-bad"}`}>{active ? t("已授权", "Authorized") : t("未授权", "Not authorized")}</span>
        </div>
        <p className="muted small">
          {t("代理钱包", "Agent wallet")} <ExtLink href={addrLink(agent)} className="mono">{short(agent)}</ExtLink>
          {policy && active && ` · ${t("到期", "expires")} ${new Date(Number(policy.expiresAt) * 1000).toLocaleDateString(locale)}`}
        </p>
        <div className="usage">
          <div className="usage-line">
            <span className="muted">{t("今日已用", "Spent today")}</span>
            <span className="num"><strong>{money(spent)}</strong> <span className="faint">/ {money(policy?.dailyLimit, 0)}</span></span>
          </div>
          <div className={`meter ${pct >= 80 ? "hot" : ""}`}><i style={{ width: `${Math.min(pct, 100)}%` }} /></div>
          <span className="faint small">{t("每天 UTC 0 点（北京时间 8 点）恢复。退款不会恢复当天额度。", "Resets daily at 00:00 UTC. Refunds don't restore that day's allowance.")}</span>
        </div>
      </section>

      <section className="panel panel-pad">
        <div className="panel-head flush"><h2>{t("额度规则", "Spending rules")}</h2></div>
        <p className="muted small">{t("在额度内的付款自动执行；超出单笔上限或当日额度的，进入审批。规则写在合约里，AI 改不了。", "Payments within the limits go through automatically; anything over the per-payment cap or daily limit needs approval. The rules live in the contract, so the AI can't change them.")}</p>
        <div className="form-grid">
          <label className="field"><span>{t("每日额度", "Daily limit")}</span><input className="input num" value={daily} onChange={(e) => setDaily(e.target.value)} disabled={!isOwner} /></label>
          <label className="field"><span>{t("单笔上限", "Per-payment cap")}</span><input className="input num" value={perTx} onChange={(e) => setPerTx(e.target.value)} disabled={!isOwner} /></label>
          <label className="field"><span>{t("有效天数", "Valid for (days)")}</span><input className="input num" value={days} onChange={(e) => setDays(e.target.value)} disabled={!isOwner} /></label>
        </div>
        {isOwner && !(Number(perTx) > 0 && Number(perTx) <= Number(daily) && Number(days) > 0) && (
          <p className="small" style={{ color: "var(--bad)", marginBottom: 10 }}>{t("单笔上限必须大于 0 且不超过每日额度，有效天数必须大于 0", "The per-payment cap must be above 0 and no more than the daily limit; days must be above 0")}</p>
        )}
        {isOwner && (
          <div className="btn-row">
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() =>
                Number(perTx) > 0 && Number(perTx) <= Number(daily) && Number(days) > 0 &&
                tx.send(t("保存额度", "Save limits"), {
                  ...v,
                  functionName: "setAgent",
                  args: [agent, toUnits(daily), toUnits(perTx), BigInt(Math.floor(now + Number(days) * 86400))],
                })
              }
            >
              {t("保存到链上", "Save on-chain")}
            </button>
            {active && (
              <button
                className="btn btn-danger"
                disabled={busy}
                onClick={async () =>
                  (await confirm({
                    title: t("收回 AI 授权？", "Revoke the AI's access?"),
                    body: t("收回后 AI 立刻不能再付款，助手只能查询。之后可以重新保存额度来恢复授权。", "The AI immediately loses the ability to pay; the assistant can only look things up. Save limits again to restore it."),
                    confirm: t("收回授权", "Revoke"),
                    danger: true,
                  })) && tx.send(t("收回授权", "Revoke"), { ...v, functionName: "revokeAgent", args: [agent] })
                }
              >
                {t("收回 AI 授权", "Revoke AI access")}
              </button>
            )}
          </div>
        )}
        <TxToast state={tx.state} onClose={tx.clear} />
      </section>
      {confirmDialog}
    </div>
  );
}
