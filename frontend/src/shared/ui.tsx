// 两个应用共用的界面零件
import type { ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AlertCircle, ArrowUpRight, Ban, Check, CheckCheck, CircleDashed, Clock, Loader2, Lock, RotateCcw, ShieldAlert, Truck, X } from "lucide-react";
import { formatUnits } from "viem";
import { wagmiConfig, EXPLORER } from "../config";
import type { ChainOrder, TxState } from "../hooks";
import { locale, t } from "../i18n";

const queryClient = new QueryClient();

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}

/** 金额：保留 2 位小数，千分位 */
export const money = (v: bigint | undefined, digits = 2) =>
  v === undefined
    ? "—"
    : Number(formatUnits(v, 6)).toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const txLink = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const addrLink = (addr: string) => `${EXPLORER}/address/${addr}`;

export function ExtLink({ href, children, className = "link" }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a className={className} href={href} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
      {children}
      <ArrowUpRight size={12} />
    </a>
  );
}

// ─────────────── 订单状态 ───────────────

type Tone = "ok" | "warn" | "bad" | "accent" | "none";
/** 这两个标签会被别的组件拿来比较（换成"待你确认"/"已付款"），所以导出成常量 */
export const PENDING_LABEL = t("待审批", "Pending approval");
export const ESCROW_LABEL = t("托管中", "In escrow");
export type OrderLook = { label: string; tone: Tone; icon: ReactNode };

export function orderLook(o: Pick<ChainOrder, "status">, opts: { pendingApproval?: boolean; blocked?: boolean } = {}): OrderLook {
  if (opts.blocked && o.status === "Created") return { label: t("已拦截", "Blocked"), tone: "bad", icon: <ShieldAlert /> };
  switch (o.status) {
    case "Created":
      return opts.pendingApproval
        ? { label: PENDING_LABEL, tone: "warn", icon: <Clock /> }
        : { label: t("待付款", "Awaiting payment"), tone: "warn", icon: <CircleDashed /> };
    case "Paid":
      return { label: ESCROW_LABEL, tone: "accent", icon: <Lock /> };
    case "Delivered":
      return { label: t("已送达", "Delivered"), tone: "ok", icon: <Truck /> };
    case "Completed":
      return { label: t("已完成", "Completed"), tone: "ok", icon: <CheckCheck /> };
    case "Refunded":
      return { label: t("已退款", "Refunded"), tone: "none", icon: <RotateCcw /> };
    case "Cancelled":
      return { label: t("已取消", "Cancelled"), tone: "none", icon: <X /> };
    case "Disputed":
      return { label: t("申诉中", "In dispute"), tone: "warn", icon: <ShieldAlert /> };
    default:
      return { label: "—", tone: "none", icon: <CircleDashed /> };
  }
}

export function Badge({ tone = "none", icon, children }: { tone?: Tone; icon?: ReactNode; children: ReactNode }) {
  return (
    <span className={`badge ${tone === "none" ? "" : `badge-${tone}`}`}>
      {icon}
      {children}
    </span>
  );
}

// ─────────────── 交易状态提示 ───────────────

export function TxToast({ state, onClose }: { state: TxState; onClose: () => void }) {
  if (state.kind === "idle") return null;
  return (
    <div className={`toast toast-${state.kind}`}>
      {state.kind === "busy" && <Loader2 className="spin" />}
      {state.kind === "ok" && <Check />}
      {state.kind === "err" && <AlertCircle />}
      <span className="grow">
        {state.kind === "busy" && t(`${state.label}：请在 MetaMask 中确认`, `${state.label}: confirm in MetaMask`)}
        {state.kind === "ok" && t(`${state.label}成功`, `${state.label}: done`)}
        {state.kind === "err" && t(`${state.label}失败：${state.msg}`, `${state.label} failed: ${state.msg}`)}
      </span>
      {state.kind === "ok" && <ExtLink href={state.url}>{t("交易", "Tx")}</ExtLink>}
      {state.kind !== "busy" && (
        <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label={t("关闭", "Close")}>
          <X />
        </button>
      )}
    </div>
  );
}

export function Blocked({ reason }: { reason: string }) {
  return (
    <span className="badge badge-bad">
      <Ban />
      {reason}
    </span>
  );
}
