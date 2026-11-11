import { lang, t } from "./i18n";
// 和本地代理服务（agent/src/server.ts，经 Vite 代理到 /api）通信
export type PublicSettings = {
  /** 接口协议：anthropic（Claude）或 openai（OpenAI 及兼容接口：DeepSeek、通义千问、Ollama 等） */
  provider: "anthropic" | "openai";
  baseURL: string;
  model: string;
  rules: string;
  offline: boolean;
  hasKey: boolean;
  keyHint: string;
  keySource: string;
};

export type PayResult =
  | { status: "executed"; amount: string; txHash: string; explorer: string }
  | { status: "pending_approval"; requestId: string; amount: string; txHash: string; explorer: string; why: string }
  | { status: "rejected_by_contract"; reason: string; txHash?: string; explorer?: string }
  | { status: "invalid_input" | "error"; reason?: string };

export type AgentEvent =
  | { type: "mode"; mode: "llm" | "offline"; model?: string }
  | { type: "text"; text: string }
  | { type: "tool"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; id: string; name: string; result: unknown }
  | { type: "final"; text: string }
  | { type: "error"; message: string }
  | { type: "done" };

export const SERVER_DOWN = t("本地代理服务没有启动。请在终端运行：cd agent && npm run server", "The local agent service is not running. Run: cd agent && npm run server");

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let r: Response;
  try {
    r = await fetch(path, { ...init, headers: { "Content-Type": "application/json" } });
  } catch {
    throw new Error(SERVER_DOWN);
  }
  if (r.status === 502 || r.status === 504) throw new Error(SERVER_DOWN);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
  return body as T;
}

export const api = {
  getSettings: () => call<PublicSettings>("/api/settings"),
  saveSettings: (s: Partial<PublicSettings> & { apiKey?: string; clearKey?: boolean }) =>
    call<PublicSettings>("/api/settings", { method: "PUT", body: JSON.stringify(s) }),
  test: () => call<{ ok: boolean; model?: string; reply?: string; ms?: number; error?: string }>("/api/settings/test", { method: "POST" }),
};

/** 发一条指令，逐条收到 AI 的每一步（Server-Sent Events） */
export async function chat(
  message: string,
  history: { role: "user" | "assistant"; text: string }[],
  onEvent: (e: AgentEvent) => void,
) {
  let r: Response;
  try {
    r = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history, lang }),
    });
  } catch {
    throw new Error(SERVER_DOWN);
  }
  if (r.status === 502 || r.status === 504) throw new Error(SERVER_DOWN);
  if (!r.ok || !r.body) {
    const b = await r.json().catch(() => ({}));
    throw new Error(b.error ?? `HTTP ${r.status}`);
  }
  const reader = r.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const line = chunk.split("\n").find((l) => l.startsWith("data: "));
      if (line) onEvent(JSON.parse(line.slice(6)));
    }
  }
}

