import { AlertTriangle, ArrowRight } from "lucide-react";
import { useBalance } from "wagmi";
import { formatEther } from "viem";
import { dep } from "../../config";
import { useMerchants, useOrders, useRequests, useVault } from "../../hooks";
import { SpendChart } from "../SpendChart";
import { money } from "../../shared/ui";
import { Activity } from "../Activity";
import type { PageId } from "../ConsoleApp";
import { locale, t } from "../../i18n";

function Stat({ label, value, unit, sub, onClick, children }: {
  label: string; value: string; unit?: string; sub?: string; onClick?: () => void; children?: React.ReactNode;
}) {
  return (
    <button className="stat" onClick={onClick} disabled={!onClick}>
      <span className="stat-label">{label}</span>
      <span className="stat-value num">
        {value}
        {unit && <small>{unit}</small>}
      </span>
      {children}
      {sub && <span className="stat-sub faint">{sub}</span>}
    </button>
  );
}

export function Overview({ go }: { go: (p: PageId) => void }) {
  const { balance, policy, remaining, nextRequestId } = useVault();
  const requests = useRequests(nextRequestId);
  const orders = useOrders();
  const now = Date.now() / 1000;
  const pending = requests.filter((r) => r.req.status === 1 && Number(r.req.createdAt) + 86400 > now);
  const escrow = orders.filter((o) => o.status === "Paid" || o.status === "Delivered").reduce((s, o) => s + o.total, 0n);
  const spent = policy && remaining !== undefined ? policy.dailyLimit - remaining : undefined;
  const pct = policy && spent !== undefined && policy.dailyLimit > 0n ? Number((spent * 100n) / policy.dailyLimit) : 0;
  const active = policy?.active && Number(policy.expiresAt) > now;
  const whitelisted = useMerchants().filter((m) => m.allowed).length;
  // 运维提醒：AI 代理付款要花 gas；授权快到期时也要提前续
  const gas = useBalance({ address: dep.roles.agent, query: { refetchInterval: 30000 } }).data?.value;
  const lowGas = gas !== undefined && gas < 5_000_000_000_000_000n; // < 0.005 ETH
  const daysLeft = policy ? (Number(policy.expiresAt) - now) / 86400 : undefined;
  const expiring = active && daysLeft !== undefined && daysLeft < 3;

  return (
    <div className="stack">
      <div className="stats">
        <Stat label={t("钱包余额", "Wallet balance")} value={money(balance)} unit="mUSDC" sub={t("由金库合约托管", "Held by the vault contract")} onClick={() => go("funds")} />
        <Stat label={t("AI 今日已用", "AI spent today")} value={money(spent)} unit={`/ ${money(policy?.dailyLimit, 0)}`} onClick={() => go("rules")}>
          <div className={`meter ${pct >= 80 ? "hot" : ""}`}><i style={{ width: `${Math.min(pct, 100)}%` }} /></div>
        </Stat>
        <Stat label={t("待审批", "Pending approvals")} value={String(pending.length)} sub={pending.length ? t(`共 ${money(pending.reduce((s, r) => s + r.req.amount, 0n))}`, `${money(pending.reduce((s, r) => s + r.req.amount, 0n))} in total`) : t("没有待处理的请求", "Nothing to review")} onClick={() => go("approvals")} />
        <Stat label={t("托管中", "In escrow")} value={money(escrow)} unit="mUSDC" sub={t("已付款、未放款给商家", "Paid, not yet released to shops")} onClick={() => go("orders")} />
      </div>

      <div className="two">
        <div className="stack">
          <section className="panel panel-pad">
            <SpendChart />
          </section>
          <section className="panel">
            <div className="panel-head">
              <h2>{t("最近动态", "Recent activity")}</h2>
              <span className="faint small">{t("来自链上事件", "From on-chain events")}</span>
            </div>
            <Activity limit={8} />
          </section>
        </div>

        <section className="panel">
          <div className="panel-head">
            <h2>{t("AI 代理", "AI agent")}</h2>
            <span className={`badge ${active ? "badge-ok" : "badge-bad"}`}>{active ? t("已授权", "Authorized") : t("未授权", "Not authorized")}</span>
          </div>
          <dl className="kv">
            <div><dt>{t("单笔上限", "Per-payment cap")}</dt><dd className="num">{money(policy?.perTxLimit, 0)}</dd></div>
            <div><dt>{t("每日额度", "Daily limit")}</dt><dd className="num">{money(policy?.dailyLimit, 0)}</dd></div>
            <div><dt>{t("授权到期", "Expires")}</dt><dd>{policy ? new Date(Number(policy.expiresAt) * 1000).toLocaleDateString(locale) : "—"}</dd></div>
            <div><dt>{t("白名单商家", "Whitelisted payees")}</dt><dd>{whitelisted}</dd></div>
            <div><dt>{t("代理 gas 余额", "Agent gas balance")}</dt><dd className="num">{gas === undefined ? "—" : `${Number(formatEther(gas)).toFixed(4)} ETH`}</dd></div>
          </dl>
          {(lowGas || expiring || !active) && (
            <div className="warns">
              {!active && <p><AlertTriangle size={14} /> {t("AI 代理未授权，助手只能查询、不能付款", "The AI agent isn't authorized: it can look things up but can't pay")}</p>}
              {lowGas && <p><AlertTriangle size={14} /> {t("代理钱包的 gas 不足 0.005 ETH，下单和付款可能会失败，请给它转一点 SepoliaETH", "Agent wallet has under 0.005 ETH for gas; orders may fail. Send it some Sepolia ETH")}</p>}
              {expiring && <p><AlertTriangle size={14} /> {t(`授权将在 ${daysLeft!.toFixed(1)} 天后到期，到期后 AI 不能付款`, `Authorization expires in ${daysLeft!.toFixed(1)} days; after that the AI can't pay`)}</p>}
            </div>
          )}
          <button className="btn btn-ghost btn-sm panel-link" onClick={() => go("rules")}>
            {t("调整额度", "Adjust limits")} <ArrowRight />
          </button>
        </section>
      </div>
    </div>
  );
}
