// 管理端：金库主人（家长 / 公司财务）用的控制台。左侧导航，每页只做一件事
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useChainId, useConnect, useConnection, useConnectors, useDisconnect, useSwitchChain } from "wagmi";
import { sepolia } from "wagmi/chains";
import {
  Bell, BellRing, Inbox, LayoutGrid, LogOut, Pause, Play, Receipt, Scale, Settings, ShieldCheck, SlidersHorizontal, Store, Wallet, X,
} from "lucide-react";
import { agentVaultAbi } from "../generated/abi";
import { dep, labelOf, short, VAULT } from "../config";
import { useIsOwner, useOrders, useRequests, useTx, useVault } from "../hooks";
import { money, TxToast } from "../shared/ui";
import { envTag, LangToggle, t } from "../i18n";
import { Overview } from "./pages/Overview";
import { Approvals } from "./pages/Approvals";
import { Orders } from "./pages/Orders";
import { Funds } from "./pages/Funds";
import { Rules } from "./pages/Rules";
import { Merchants } from "./pages/Merchants";
import { Ledger } from "./pages/Ledger";
import { AiSettingsPage } from "./pages/AiSettings";

const PAGES = [
  { id: "overview", label: t("概览", "Overview"), icon: LayoutGrid },
  { id: "approvals", label: t("审批", "Approvals"), icon: Inbox },
  { id: "orders", label: t("订单", "Orders"), icon: Receipt },
  { id: "funds", label: t("资金", "Funds"), icon: Wallet },
  { id: "rules", label: t("额度规则", "Spending rules"), icon: SlidersHorizontal },
  { id: "merchants", label: t("商家白名单", "Whitelist"), icon: Store },
  { id: "ledger", label: t("链上对账", "On-chain audit"), icon: Scale },
  { id: "settings", label: t("AI 设置", "AI settings"), icon: Settings },
] as const;
export type PageId = (typeof PAGES)[number]["id"];

function usePage(): [PageId, (p: PageId) => void] {
  const read = () => {
    const h = location.hash.replace(/^#\/?/, "") as PageId;
    return PAGES.some((p) => p.id === h) ? h : "overview";
  };
  const [page, setPage] = useState<PageId>(read);
  useEffect(() => {
    const on = () => setPage(read());
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return [page, (p) => (location.hash = `/${p}`)];
}

function WalletButton() {
  const { address, isConnected } = useConnection();
  const chainId = useChainId();
  const connectors = useConnectors();
  const { mutate: connect } = useConnect();
  const { mutate: disconnect } = useDisconnect();
  const { mutate: switchChain } = useSwitchChain();
  const isOwner = useIsOwner();

  if (!isConnected)
    return (
      <button className="btn btn-primary" onClick={() => connectors[0] && connect({ connector: connectors[0] })}>
        {t("连接钱包", "Connect wallet")}
      </button>
    );
  if (chainId !== sepolia.id)
    return (
      <button className="btn btn-danger" onClick={() => switchChain({ chainId: sepolia.id })}>
        {t("切换到 Sepolia", "Switch to Sepolia")}
      </button>
    );
  return (
    <div className="wallet-chip">
      <span className={`role-dot ${isOwner ? "on" : ""}`} />
      <span>{isOwner ? t("管理员", "Admin") : t("只读", "Read-only")}</span>
      <span className="mono faint">{short(address!)}</span>
      <button className="btn btn-ghost btn-sm" onClick={() => disconnect()} aria-label={t("断开", "Disconnect")}>
        <LogOut />
      </button>
    </div>
  );
}

function FreezeButton() {
  const { paused } = useVault();
  const isOwner = useIsOwner();
  const tx = useTx();
  if (!isOwner) return null;
  const busy = tx.state.kind === "busy";
  return (
    <>
      <button
        className={paused ? "btn" : "btn btn-danger"}
        disabled={busy}
        onClick={() => tx.send(paused ? t("解除冻结", "Unfreeze") : t("紧急冻结", "Emergency freeze"), { address: VAULT, abi: agentVaultAbi, functionName: paused ? "unpause" : "pause" })}
      >
        {paused ? <Play /> : <Pause />}
        {paused ? t("解除冻结", "Unfreeze") : t("紧急冻结", "Emergency freeze")}
      </button>
      {tx.state.kind !== "idle" && (
        <div className="float-toast">
          <TxToast state={tx.state} onClose={tx.clear} />
        </div>
      )}
    </>
  );
}

/** 轻提示音（不依赖音频文件） */
function beep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.4);
  } catch {
    /* 浏览器不允许自动播放时忽略 */
  }
}

type Alert = { id: bigint; text: string; amount: bigint };

/** 新的审批请求：页面右下角提醒 + 提示音 + 系统通知（如果开启）+ 标签页标题显示数量 */
function useApprovalAlerts(pending: { id: bigint; req: { merchant: string; amount: bigint } }[], loaded: boolean) {
  const seen = useRef<Set<string> | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [perm, setPerm] = useState(typeof Notification === "undefined" ? "unsupported" : Notification.permission);

  useEffect(() => {
    const base = envTag(dep.environment === "rehearsal") + t("AgentVault 控制台", "AgentVault Console");
    document.title = pending.length ? `(${pending.length}) ${t("待审批", "pending")} · ${base}` : base;
    if (!loaded) return;
    if (!seen.current) {
      seen.current = new Set(pending.map((p) => p.id.toString())); // 第一次加载：已有的请求不算"新"
      return;
    }
    const fresh = pending.filter((p) => !seen.current!.has(p.id.toString()));
    if (!fresh.length) return;
    for (const p of fresh) seen.current.add(p.id.toString());
    const items = fresh.map((p) => ({ id: p.id, text: t(`${labelOf(p.req.merchant)} 申请 ${money(p.req.amount)} mUSDC`, `${labelOf(p.req.merchant)} requests ${money(p.req.amount)} mUSDC`), amount: p.req.amount }));
    setAlerts((a) => [...items, ...a].slice(0, 3));
    beep();
    if (perm === "granted") for (const it of items) new Notification(t(`新的审批请求 #${it.id}`, `New approval request #${it.id}`), { body: it.text, tag: `req-${it.id}` });
  }, [pending, loaded, perm]);

  const enable = async () => {
    if (typeof Notification === "undefined") return;
    setPerm(await Notification.requestPermission());
  };
  return { alerts, dismiss: (id: bigint) => setAlerts((a) => a.filter((x) => x.id !== id)), perm, enable };
}

export function ConsoleApp() {
  const [page, go] = usePage();
  const { paused, nextRequestId } = useVault();
  const requests = useRequests(nextRequestId);
  const now = Date.now() / 1000;
  const pendingList = requests.filter((r) => r.req.status === 1 && Number(r.req.createdAt) + 86400 > now);
  const pendingCount = pendingList.length;
  const loaded = nextRequestId !== undefined && requests.length === Number(nextRequestId) - 1;
  const { alerts, dismiss, perm, enable } = useApprovalAlerts(pendingList, loaded);
  const isOwner = useIsOwner();
  useOrders(); // 预热订单数据
  const current = PAGES.find((p) => p.id === page)!;

  const body: Record<PageId, ReactNode> = {
    overview: <Overview go={go} />,
    approvals: <Approvals />,
    orders: <Orders />,
    funds: <Funds />,
    rules: <Rules />,
    merchants: <Merchants />,
    ledger: <Ledger />,
    settings: <AiSettingsPage />,
  };

  return (
    <div className="shell">
      <aside className="side">
        <div className="side-brand">
          <ShieldCheck size={18} />
          <span>AgentVault</span>
          <span className="faint small">{t("控制台", "Console")}</span>
        </div>
        <nav>
          {PAGES.map(({ id, label, icon: Icon }) => (
            <a key={id} href={`#/${id}`} className={page === id ? "on" : ""}>
              <Icon size={16} />
              <span>{label}</span>
              {id === "approvals" && pendingCount > 0 && <em>{pendingCount}</em>}
            </a>
          ))}
        </nav>
        <div className="side-foot faint small">{t("网络：Sepolia", "Network: Sepolia")}{dep.environment === "rehearsal" ? t(" · 练习环境", " · rehearsal") : ""}</div>
      </aside>

      <div className="main">
        <header className="top">
          <h1>{current.label}</h1>
          <div className="top-right">
            {perm !== "unsupported" && (
              <button
                className="btn btn-ghost"
                onClick={enable}
                disabled={perm === "granted" || perm === "denied"}
                title={perm === "granted" ? t("审批提醒已开启", "Approval alerts on") : perm === "denied" ? t("浏览器已禁止通知", "Notifications blocked by browser") : t("开启审批提醒", "Turn on approval alerts")}
              >
                {perm === "granted" ? <BellRing /> : <Bell />}
                <span className="hide-sm">{perm === "granted" ? t("提醒已开", "Alerts on") : t("开启提醒", "Alerts")}</span>
              </button>
            )}
            <LangToggle className="btn btn-ghost" />
            <FreezeButton />
            <WalletButton />
          </div>
        </header>
        {paused && <div className="banner">{t("钱包已冻结：AI 的付款和审批全部暂停，管理员仍可取款", "Wallet frozen: AI payments and approvals are paused; the admin can still withdraw")}</div>}
        {!isOwner && <div className="banner banner-soft">{t("只读模式：用管理员钱包连接后才能操作", "Read-only: connect the admin wallet to make changes")}</div>}
        <div className="page">{body[page]}</div>
        {alerts.length > 0 && (
          <div className="alerts">
            {alerts.map((a) => (
              <div className="alert" key={a.id.toString()}>
                <Inbox size={16} />
                <div className="alert-text">
                  <strong>{t("新的审批请求", "New approval request")} #{a.id.toString()}</strong>
                  <span className="muted small">{a.text}</span>
                </div>
                <button className="btn btn-sm btn-primary" onClick={() => { dismiss(a.id); go("approvals"); }}>{t("去处理", "Review")}</button>
                <button className="btn btn-ghost btn-sm" onClick={() => dismiss(a.id)} aria-label={t("关闭", "Close")}><X /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
