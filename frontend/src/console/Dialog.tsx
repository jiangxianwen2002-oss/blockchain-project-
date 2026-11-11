// 弹窗 + 危险操作二次确认
import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { t } from "../i18n";

export function Modal({ open, onClose, title, children, width = 480 }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; width?: number;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      // showModal 默认把焦点给第一个按钮（关闭）；改成给标了 data-autofocus 的输入框
      requestAnimationFrame(() => d.querySelector<HTMLElement>("[data-autofocus]")?.focus());
    }
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="modal" style={{ width: `min(${width}px, calc(100vw - 32px))` }} onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label={t("关闭", "Close")}><X /></button>
      </div>
      <div className="modal-body">{open && children}</div>
    </dialog>
  );
}

type ConfirmOpts = { title: string; body: ReactNode; confirm: string; danger?: boolean };

/** const [dialog, confirm] = useConfirm();  if (await confirm({...})) doIt(); */
export function useConfirm(): [ReactNode, (o: ConfirmOpts) => Promise<boolean>] {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  const dialog = (
    <Modal open={Boolean(state)} onClose={() => close(false)} title={state?.title ?? ""} width={420}>
      <div className="confirm-body">{state?.body}</div>
      <div className="modal-foot">
        <button className="btn" onClick={() => close(false)}>{t("取消", "Cancel")}</button>
        <button className={`btn ${state?.danger ? "btn-danger-solid" : "btn-primary"}`} onClick={() => close(true)} autoFocus>
          {state?.confirm}
        </button>
      </div>
    </Modal>
  );
  return [dialog, (o) => new Promise((resolve) => setState({ ...o, resolve }))];
}
