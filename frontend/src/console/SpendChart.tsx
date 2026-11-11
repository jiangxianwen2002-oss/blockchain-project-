// 近 7 天 AI 消费：每天一根柱（单一色相），悬停看明细；下面是按商家的占比
// 数据来自链上事件：PaymentExecuted（自动付款）+ RequestApproved（审批通过的付款）；退款单独列出
import { useMemo, useState } from "react";
import { labelOf } from "../config";
import { useActivity, useRequests, useVault } from "../hooks";
import { money } from "../shared/ui";
import { t } from "../i18n";

type Day = { key: string; label: string; spend: bigint; count: number; refund: bigint };

const dayKey = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

export function useSpending(days = 7) {
  const { data: events } = useActivity();
  const { nextRequestId } = useVault();
  const requests = useRequests(nextRequestId);
  return useMemo(() => {
    const now = new Date();
    const list: Day[] = Array.from({ length: days }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1 - i));
      return { key: dayKey(d.getTime()), label: `${d.getMonth() + 1}/${d.getDate()}`, spend: 0n, count: 0, refund: 0n };
    });
    const byKey = new Map(list.map((d) => [d.key, d]));
    const byMerchant = new Map<string, bigint>();
    const reqAmount = new Map(requests.map((r) => [r.id.toString(), r.req]));
    for (const e of events ?? []) {
      const d = byKey.get(dayKey(e.time));
      if (!d) continue;
      const a = e.args as Record<string, unknown>;
      let amount = 0n;
      let merchant = "";
      if (!e.shop && e.eventName === "PaymentExecuted") {
        amount = a.amount as bigint;
        merchant = a.merchant as string;
      } else if (!e.shop && e.eventName === "RequestApproved") {
        const r = reqAmount.get(String(a.requestId));
        if (r) [amount, merchant] = [r.amount, r.merchant];
      } else if (e.shop && e.eventName === "OrderRefunded") {
        d.refund += a.amount as bigint;
        continue;
      }
      if (amount > 0n) {
        d.spend += amount;
        d.count += 1;
        byMerchant.set(merchant, (byMerchant.get(merchant) ?? 0n) + amount);
      }
    }
    const merchants = [...byMerchant.entries()].map(([m, v]) => ({ name: labelOf(m), amount: v })).sort((a, b) => (a.amount < b.amount ? 1 : -1));
    return { days: list, merchants, loading: !events };
  }, [events, requests, days]);
}

export function SpendChart() {
  const { days, merchants, loading } = useSpending(7);
  const [hover, setHover] = useState<number | null>(null);
  const max = days.reduce((m, d) => (d.spend > m ? d.spend : m), 0n);
  const total = days.reduce((s, d) => s + d.spend, 0n);
  const top = max === 0n ? 1 : Number(max) / 1e6;
  const step = top <= 50 ? 10 : top <= 100 ? 25 : top <= 250 ? 50 : 100;
  const yMax = Math.max(step, Math.ceil(top / step) * step);
  const W = 560, H = 160, padL = 34, padB = 22, padT = 10;
  const bw = (W - padL) / days.length;
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / yMax);
  const ticks = [0, yMax / 2, yMax];
  const peak = days.findIndex((d) => d.spend === max && max > 0n);

  return (
    <div className="spend">
      <div className="spend-head">
        <div>
          <span className="stat-label">{t("近 7 天 AI 支出", "AI spending, last 7 days")}</span>
          <div className="spend-total num">{money(total)} <small>mUSDC</small></div>
        </div>
        <span className="faint small">{t("含审批通过的付款，不扣退款", "Includes approved payments; refunds not deducted")}</span>
      </div>
      {loading ? (
        <div className="spend-skeleton" />
      ) : (
        <div className="spend-chart" onMouseLeave={() => setHover(null)}>
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("近 7 天每日 AI 支出柱状图", "Daily AI spending over the last 7 days, bar chart")}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={padL} x2={W} y1={y(t)} y2={y(t)} className="grid" />
                <text x={padL - 8} y={y(t) + 4} className="axis" textAnchor="end">{t}</text>
              </g>
            ))}
            {days.map((d, i) => {
              const v = Number(d.spend) / 1e6;
              const x = padL + i * bw + bw * 0.25;
              const w = bw * 0.5;
              const h = Math.max(0, y(0) - y(v));
              const r = Math.min(4, w / 2, h);
              return (
                <g key={d.key} onMouseEnter={() => setHover(i)}>
                  <rect x={padL + i * bw} y={padT} width={bw} height={H - padT} fill="transparent" />
                  {h > 0 && (
                    <path
                      className={`bar ${hover === i ? "on" : ""}`}
                      d={`M${x},${y(0)} V${y(v) + r} Q${x},${y(v)} ${x + r},${y(v)} H${x + w - r} Q${x + w},${y(v)} ${x + w},${y(v) + r} V${y(0)} Z`}
                    />
                  )}
                  {i === peak && hover === null && (
                    <text x={x + w / 2} y={y(v) - 6} className="axis strong" textAnchor="middle">{money(d.spend, 0)}</text>
                  )}
                  <text x={x + w / 2} y={H - 6} className="axis" textAnchor="middle">{d.label}</text>
                </g>
              );
            })}
          </svg>
          {hover !== null && (
            <div className="tip" style={{ left: `${((padL + hover * bw + bw / 2) / W) * 100}%` }}>
              <strong>{days[hover].label}</strong>
              <span>{t("支出", "Spent")} <b className="num">{money(days[hover].spend)}</b></span>
              <span className="faint">{days[hover].count} {t("笔", "payments")}{days[hover].refund > 0n ? ` · ${t("退款", "refunds")} ${money(days[hover].refund)}` : ""}</span>
            </div>
          )}
          <table className="sr-only">
            <caption>{t("近 7 天每日 AI 支出", "Daily AI spending, last 7 days")}</caption>
            <tbody>
              {days.map((d) => <tr key={d.key}><th>{d.label}</th><td>{money(d.spend)}</td><td>{d.count} {t("笔", "payments")}</td></tr>)}
            </tbody>
          </table>
        </div>
      )}
      {merchants.length > 0 && (
        <ul className="by-merchant">
          {merchants.slice(0, 5).map((m) => (
            <li key={m.name}>
              <span className="bm-name">{m.name}</span>
              <span className="bm-bar"><i style={{ width: `${total > 0n ? Number((m.amount * 100n) / total) : 0}%` }} /></span>
              <span className="num bm-amt">{money(m.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
