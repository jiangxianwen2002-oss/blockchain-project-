// AI 的工作过程：默认折叠成一行（"查看菜单 · 下单 · 付款"），点开看每一步
import { useState } from "react";
import {
  AlertTriangle, ArrowRightLeft, BookOpen, Check, ChevronDown, CircleDollarSign, ClipboardList,
  Loader2, PackageCheck, RotateCcw, Search, Store, X,
} from "lucide-react";
import type { PayResult } from "../agentApi";
import { ExtLink } from "../shared/ui";
import { t, tn } from "../i18n";
import { orderLook } from "../shared/ui";

export type Step = { id: string; name: string; input: Record<string, unknown>; result?: unknown };

const META: Record<string, { label: string; icon: typeof Search }> = {
  get_vault_status: { label: t("查看额度", "Check limits"), icon: Search },
  list_merchants: { label: t("查看商家", "List shops"), icon: Store },
  browse_menu: { label: t("查看菜单", "Read menu"), icon: BookOpen },
  create_order: { label: t("下单", "Place order"), icon: ClipboardList },
  pay_order: { label: t("付款", "Pay"), icon: CircleDollarSign },
  check_order: { label: t("查询订单", "Check order"), icon: Search },
  cancel_order: { label: t("取消订单", "Cancel order"), icon: RotateCcw },
  confirm_received: { label: t("确认收货", "Confirm receipt"), icon: PackageCheck },
  report_problem: { label: t("申诉", "Dispute"), icon: AlertTriangle },
  pay: { label: t("转账", "Transfer"), icon: ArrowRightLeft },
};

type Res = Record<string, unknown> | undefined;
const failed = (r: Res) => {
  if (!r) return false;
  if (r.status === "invalid_input" || r.status === "rejected_by_contract" || r.status === "error") return true;
  const p = r.payment as PayResult | undefined;
  return p?.status === "rejected_by_contract";
};
const pending = (r: Res) => (r?.payment as PayResult | undefined)?.status === "pending_approval" || r?.status === "pending_approval";

function detail(step: Step): { text?: string; href?: string; tone?: "bad" | "warn" } {
  const r = step.result as Res;
  if (!r) return {};
  const pay = (r.payment ?? (step.name === "pay" ? r : undefined)) as PayResult | undefined;
  if (pay) {
    if (pay.status === "executed") return { text: t(`${pay.amount} 已付`, `${pay.amount} paid`), href: pay.explorer };
    if (pay.status === "pending_approval") return { text: t("超出额度，等你确认", "Over limit, needs your OK"), href: pay.explorer, tone: "warn" };
    if (pay.status === "rejected_by_contract") return { text: t("被合约拒绝", "Rejected by contract"), href: pay.explorer, tone: "bad" };
  }
  if (failed(r)) return { text: String(r.reason ?? t("失败", "Failed")), tone: "bad" };
  switch (step.name) {
    case "get_vault_status":
      return { text: t(`今日剩余 ${r.remainingToday}`, `${r.remainingToday} left today`) };
    case "browse_menu": {
      const name = (r.shop as { name?: string } | undefined)?.name;
      return { text: tn(name) };
    }
    case "create_order":
      return { text: `${r.order_id} · ${r.total}` };
    case "check_order":
      // 状态文字是 AI 服务给的中文；英文界面用状态码翻译
      return { text: t(String(r.statusText ?? ""), r.status ? orderLook({ status: r.status } as never).label : "") };
    case "cancel_order":
      return r.status === "refunded" ? { text: t(`退回 ${r.amount}`, `${r.amount} refunded`), href: String(r.explorer) } : { text: t("已取消", "Cancelled") };
    case "confirm_received":
      return { text: t("已放款给商家", "Released to shop"), href: String(r.explorer ?? "") || undefined };
    default:
      return {};
  }
}

/** 不在白名单里的店铺公告：单独提示出来（这是提示注入攻击的来源） */
function untrustedNotice(steps: Step[]) {
  for (const s of steps) {
    if (s.name !== "browse_menu") continue;
    const r = s.result as { notice?: string; whitelisted?: boolean } | undefined;
    if (r?.notice && r.whitelisted === false) return r.notice;
  }
  return undefined;
}

export function Steps({ steps, running }: { steps: Step[]; running: boolean }) {
  const problem = steps.some((s) => failed(s.result as Res) || pending(s.result as Res));
  const [open, setOpen] = useState<boolean | null>(null);
  const expanded = open ?? problem;
  if (steps.length === 0) return null;

  const notice = untrustedNotice(steps);
  const names = [...new Set(steps.map((s) => META[s.name]?.label ?? s.name))];
  const last = steps[steps.length - 1];
  const working = running && !last.result;

  return (
    <div className="steps-box">
      <button className="steps-summary" onClick={() => setOpen(!expanded)}>
        {working ? <Loader2 size={14} className="spin" /> : problem ? <AlertTriangle size={14} className="warn-ico" /> : <Check size={14} />}
        <span>{names.join(" · ")}</span>
        <ChevronDown size={14} style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
      </button>
      {expanded && (
        <ul className="steps-list">
          {steps.map((s) => {
            const m = META[s.name] ?? { label: s.name, icon: Search };
            const Icon = m.icon;
            const d = detail(s);
            return (
              <li key={s.id}>
                {!s.result ? <Loader2 size={14} className="spin faint" /> : d.tone === "bad" ? <X size={14} className="bad-ico" /> : <Icon size={14} className="faint" />}
                <span>{m.label}</span>
                <span className={`steps-detail ${d.tone ?? ""}`}>
                  {d.href ? <ExtLink href={d.href} className="">{d.text}</ExtLink> : d.text}
                </span>
              </li>
            );
          })}
          {notice && (
            <li className="steps-notice">
              <AlertTriangle size={14} />
              <span>
                {t("这家店不在白名单，店铺公告里有写给 AI 的指令：", "This shop is not whitelisted and its notice contains instructions aimed at the AI: ")}“{notice.length > 60 ? notice.slice(0, 60) + "…" : notice}”
              </span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
