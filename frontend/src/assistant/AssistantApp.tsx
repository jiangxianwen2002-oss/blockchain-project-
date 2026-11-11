// 用户端：AI 生活助手。只能"说话"，没有任何管理功能（额度、审批、白名单都在独立的控制台里）
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUp, Car, CheckCircle2, Store, CupSoda, Mic, ShieldCheck, Square, UtensilsCrossed, Volume2, VolumeX, Wallet, XCircle } from "lucide-react";
import { useConnect, useConnection, useConnectors, useDisconnect } from "wagmi";
import { api, chat, type AgentEvent, type PayResult } from "../agentApi";
import { shopById } from "../config";
import { useIsOwner, useShops, useVault } from "../hooks";
import { ApproveBar } from "./ApproveBar";
import { speak, speechSupported, useSpeech } from "../speech";
import { OrderTicket } from "../shared/OrderTicket";
import { PlatformTicket } from "../shared/platform";
import { ExtLink, money } from "../shared/ui";
import { Steps, type Step } from "./Steps";
import { LangToggle, t } from "../i18n";

type Msg =
  | { role: "user"; text: string }
  | { role: "assistant"; steps: Step[]; text?: string; error?: string; notice?: string; done: boolean }
  /** 你在钱包里做的决定（批准 / 拒绝），显示成一条系统提示 */
  | { role: "note"; ok: boolean; text: string; url?: string };

const SCAM = t("朋友推荐了一家「天天特价」首单 1 折，帮我在那家点个午饭", "A friend recommended the shop 天天特价 (90% off your first order). Order me lunch there.");
const SUGGESTIONS = [
  { icon: UtensilsCrossed, text: t("帮我点个午饭，30 块以内，不要辣", "Order me lunch under 30, nothing spicy") },
  { icon: CupSoda, text: t("给全组 6 个人点奶茶", "Get milk tea for the 6 people on my team") },
  { icon: Car, text: t("帮我叫个车去机场", "Call me a ride to the airport") },
  { icon: Store, text: t("在云间外卖点个香辣鸡腿堡", "Order a spicy chicken burger on CloudEats"), label: t("外部平台：云间外卖（x402）", "External platform: CloudEats (x402)") },
  { icon: ShieldCheck, text: SCAM, label: t("试试诈骗店：首单 1 折", "Try the scam shop: 90% off") },
];

type Order = { order_id: string; shop: string; shopName: string; chainOrderId?: string; total: string; kind?: "ucp" };

/** 这条回复里下过的订单 + 付款结果 */
function ordersOf(steps: Step[]) {
  return steps
    .filter((s) => s.name === "create_order" && (s.result as Partial<Order> | undefined)?.order_id)
    .flatMap((s) => {
      const o = s.result as Order;
      const payment = (steps.find((p) => p.name === "pay_order" && p.input.order_id === o.order_id)?.result as { payment?: PayResult } | undefined)?.payment;
      // 外部平台的订单不在链上商家合约里：用平台小票
      const shop = o.kind === "ucp" ? undefined : shopById(o.shop);
      if (!shop && o.kind !== "ucp") return [];
      return [{
        o,
        shop,
        pending: payment?.status === "pending_approval",
        requestId: payment?.status === "pending_approval" ? BigInt(payment.requestId) : undefined,
        blocked: payment?.status === "rejected_by_contract" ? { reason: payment.reason.split(":")[0], tx: payment.explorer } : undefined,
      }];
    });
}

/** 顶栏的钱包按钮：自用场景下，连上主人钱包后就能在聊天里直接确认超额付款 */
function WalletDot() {
  const { address, isConnected } = useConnection();
  const connectors = useConnectors();
  const { mutate: connect } = useConnect();
  const { mutate: disconnect } = useDisconnect();
  const isOwner = useIsOwner();
  return (
    <button
      className={`icon-btn wallet-btn ${isConnected ? (isOwner ? "on" : "other") : ""}`}
      onClick={() => (isConnected ? disconnect() : connectors[0] && connect({ connector: connectors[0] }))}
      title={isConnected ? `${isOwner ? t("已连接主人钱包", "Owner wallet connected") : t("已连接（不是主人钱包）", "Connected (not the owner wallet)")} ${address?.slice(0, 6)}…${address?.slice(-4)} · ${t("点击断开", "click to disconnect")}` : t("连接钱包（用于确认超额付款）", "Connect wallet (to approve over-limit payments)")}
      aria-label={t("钱包", "Wallet")}
    >
      <Wallet size={17} />
    </button>
  );
}

export function AssistantApp() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [voiceReply, setVoiceReply] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const { policy, remaining, paused } = useVault();
  useShops(); // 从链上加载商家（管理员新导入的店也能显示）
  const settings = useQuery({ queryKey: ["ai-settings"], queryFn: api.getSettings, refetchInterval: 15000, retry: false });
  const speech = useSpeech(setInput, (t) => send(t));

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs]);

  function patchLast(fn: (m: Extract<Msg, { role: "assistant" }>) => void) {
    setMsgs((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last?.role !== "assistant") return prev;
      const copy = { ...last, steps: [...last.steps] };
      fn(copy);
      next[next.length - 1] = copy;
      return next;
    });
  }

  function onEvent(e: AgentEvent) {
    if (e.type === "tool") patchLast((m) => void m.steps.push({ id: e.id, name: e.name, input: e.input }));
    // 服务端的提示（比如"AI 接口出错，改用离线规则模式"）：显示成一行小字，方便知道为什么换了模式
    else if (e.type === "text" && /离线规则模式|offline rules mode/.test(e.text)) patchLast((m) => void (m.notice = e.text));
    else if (e.type === "tool_result") {
      patchLast((m) => void (m.steps = m.steps.map((s) => (s.id === e.id ? { ...s, result: e.result } : s))));
      qc.invalidateQueries();
    } else if (e.type === "final") {
      patchLast((m) => void (m.text = e.text));
      if (voiceReply) speak(e.text);
    } else if (e.type === "error") patchLast((m) => void (m.error = e.message));
    else if (e.type === "done") patchLast((m) => void (m.done = true));
  }

  async function send(text: string) {
    const msg = text.trim();
    if (!msg || running) return;
    const history = msgs.flatMap((m): { role: "user" | "assistant"; text: string }[] =>
      m.role === "user" ? [{ role: "user", text: m.text }] : m.text ? [{ role: "assistant", text: m.text }] : [],
    );
    setInput("");
    setRunning(true);
    setMsgs((p) => [...p, { role: "user", text: msg }, { role: "assistant", steps: [], done: false }]);
    try {
      await chat(msg, history, onEvent);
    } catch (err) {
      patchLast((m) => void (m.error = err instanceof Error ? err.message : String(err)));
    } finally {
      patchLast((m) => void (m.done = true));
      setRunning(false);
      qc.invalidateQueries();
    }
  }

  const s = settings.data;
  const mode = settings.isError ? "offline-server" : s?.hasKey && !s.offline ? "ai" : "rules";
  const daily = policy?.dailyLimit;
  const left = remaining;
  const pct = daily && daily > 0n && left !== undefined ? Number(((daily - left) * 100n) / daily) : 0;

  return (
    <div className="phone">
      <header className="bar">
        <div className="bar-brand">
          <ShieldCheck size={18} />
          <span>AgentVault</span>
        </div>
        <div className="bar-right">
          <LangToggle className="icon-btn lang-btn" />
          <WalletDot />
          <button className="icon-btn" onClick={() => setVoiceReply((v) => !v)} aria-label={t("朗读回复", "Read replies aloud")} title={voiceReply ? t("朗读回复：开", "Read aloud: on") : t("朗读回复：关", "Read aloud: off")}>
            {voiceReply ? <Volume2 size={17} /> : <VolumeX size={17} />}
          </button>
        </div>
      </header>

      <div className="wallet-strip">
        <div className="wallet-line">
          <Wallet size={15} className="faint" />
          <span className="muted">{t("今日可用", "Left today")}</span>
          <strong className="num">{money(left)}</strong>
          <span className="faint num">/ {money(daily, 0)}</span>
          <span className={`mode-dot mode-${mode}`} title={mode === "ai" ? `${t("AI 模式", "AI mode")} · ${s?.model}` : mode === "rules" ? t("离线规则模式", "Offline rules mode") : t("助手服务未启动", "Assistant service not running")} />
        </div>
        <div className={`meter ${pct >= 80 ? "hot" : ""}`}>
          <i style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
        {paused && <div className="paused-note">{t("钱包已冻结，暂时不能付款", "Wallet is frozen. No payments for now.")}</div>}
      </div>

      <main className="thread">
        {msgs.length === 0 && (
          <div className="hello">
            <h1>{t("今天想吃点什么？", "What would you like today?")}</h1>
            <p className="muted">{t("告诉我你要什么，我在额度内直接帮你下单付款；超出额度的，会先请你确认。", "Tell me what you need. I order and pay within your limits, and ask you first for anything over them.")}</p>
            <div className="suggest">
              {SUGGESTIONS.map(({ icon: Icon, text, label }) => (
                <button key={text} onClick={() => send(text)} disabled={running}>
                  <Icon size={16} />
                  <span>{label ?? text}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {msgs.map((m, i) =>
          m.role === "note" ? (
            <div key={i} className={`msg-note ${m.ok ? "ok" : ""}`}>
              {m.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
              <span>{m.text}</span>
              {m.url && <ExtLink href={m.url} className="faint">{t("交易", "Tx")}</ExtLink>}
            </div>
          ) : m.role === "user" ? (
            <div key={i} className="msg-user">{m.text}</div>
          ) : (
            <div key={i} className="msg-ai">
              {m.notice && <p className="faint small">{m.notice}</p>}
              <Steps steps={m.steps} running={!m.done} />
              {!m.text && !m.error && !m.done && m.steps.length === 0 && <div className="typing"><i /><i /><i /></div>}
              {m.text && <p className="msg-text">{m.text}</p>}
              {m.error && <p className="msg-error">{m.error}</p>}
              {ordersOf(m.steps).map(({ o, shop, pending, requestId, blocked }) => !shop ? (
                <PlatformTicket
                  key={o.order_id}
                  id={o.order_id.split("-").pop()!}
                  name={o.shopName}
                  pendingApproval={pending}
                  actions={
                    requestId !== undefined && (
                      <ApproveBar
                        requestId={requestId}
                        onResult={(r) =>
                          setMsgs((p) => [
                            ...p,
                            r === "approved"
                              ? { role: "note", ok: true, text: t(`你批准了这笔 ${o.total} 的付款，钱已付到「${o.shopName}」的收款地址，平台会自动确认收款。`, `You approved the ${o.total} payment. It went to ${o.shopName}'s payment address and the platform will confirm it automatically.`) }
                              : { role: "note", ok: false, text: t(`你拒绝了这笔 ${o.total} 的付款，钱没有付出。`, `You rejected the ${o.total} payment. No money was sent.`) },
                          ])
                        }
                      />
                    )
                  }
                />
              ) : (
                <OrderTicket
                  key={o.order_id}
                  shop={shop}
                  id={BigInt(o.chainOrderId!)}
                  pendingApproval={pending}
                  pendingLabel={t("待你确认", "Needs your OK")}
                  requestId={requestId}
                  blocked={blocked}
                  actions={
                    requestId !== undefined && (
                      <ApproveBar
                        requestId={requestId}
                        onResult={(r) =>
                          setMsgs((p) => [
                            ...p,
                            r === "approved"
                              ? { role: "note", ok: true, text: t(`你批准了这笔 ${o.total} 的付款，钱已进入「${shop.name}」的合约托管，送达后再放给商家。`, `You approved the ${o.total} payment. It is held in escrow by ${shop.name}'s contract until delivery.`) }
                              : { role: "note", ok: false, text: t(`你拒绝了这笔 ${o.total} 的付款，钱没有付出。`, `You rejected the ${o.total} payment. No money was sent.`) },
                          ])
                        }
                      />
                    )
                  }
                />
              ))}
            </div>
          ),
        )}
        <div ref={end} />
      </main>

      <footer className="composer-wrap">
        {msgs.length > 0 && !running && (
          <div className="quick">
            {[t("我的外卖到哪了？", "Where is my order?"), t("取消刚才的订单", "Cancel that order"), t("收到了", "Got it, thanks"), t("还剩多少额度？", "How much can I still spend?")].map((q) => (
              <button key={q} onClick={() => send(q)}>{q}</button>
            ))}
          </div>
        )}
        <form
          className={`composer ${speech.listening ? "listening" : ""}`}
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          {speechSupported && (
            <button type="button" className="mic" onClick={speech.toggle} disabled={running} aria-label={speech.listening ? t("停止", "Stop") : t("语音输入", "Voice input")}>
              {speech.listening ? <Square size={14} fill="currentColor" /> : <Mic size={18} />}
            </button>
          )}
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={speech.listening ? t("正在听…", "Listening…") : running ? t("处理中…", "Working…") : t("想要什么，直接说", "Just say what you need")}
            disabled={running}
          />
          <button type="submit" className="send" disabled={running || !input.trim()} aria-label={t("发送", "Send")}>
            <ArrowUp size={18} />
          </button>
        </form>
        {speech.error && <p className="composer-err">{speech.error}</p>}
      </footer>
    </div>
  );
}
