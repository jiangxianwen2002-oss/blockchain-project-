// OpenAI 协议（Chat Completions + function calling）的 agent 循环。
// 兼容所有"OpenAI 兼容"的接口：OpenAI、DeepSeek、智谱 GLM（open.bigmodel.cn/api/paas/v4）、通义千问、Kimi、本地 Ollama 等，
// 只要填 API 地址、Key、模型名。
// 和 Anthropic 版（llm.ts）用的是同一套工具、同一份系统提示词：换模型不影响安全性，钱的规则仍然在链上。
// 直接用 fetch 调用，不引入额外依赖；各家兼容接口只保证最基础的字段，所以这里也只发最基础的字段。
import { tools, runTool } from "./tools.js";
import type { AISettings } from "./settings.js";
import { MAX_TURNS, systemPrompt, type AgentEvent, type ChatTurn } from "./llm.js";

type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string | Record<string, unknown> } };
type Msg =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

/** 和 Anthropic SDK 报错的形状保持一致（status + message），server.ts 的错误提示可以共用 */
class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const openaiTools = tools.map((t) => ({
  type: "function" as const,
  function: { name: t.name, description: t.description ?? "", parameters: t.input_schema },
}));

async function complete(s: AISettings, body: Record<string, unknown>, signal?: AbortSignal) {
  const res = await fetch(`${s.baseURL.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.apiKey}` },
    body: JSON.stringify({ model: s.model, ...body }),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data?.error?.message ?? `HTTP ${res.status}`);
  return data as {
    model: string;
    choices: { finish_reason: string; message: { content: string | null; tool_calls?: ToolCall[]; refusal?: string | null } }[];
  };
}

export async function testOpenAI(s: AISettings) {
  const t0 = Date.now();
  const r = await complete(s, { messages: [{ role: "user", content: "回复两个字：在线" }], max_tokens: 32 });
  return { ok: true, model: r.model ?? s.model, reply: (r.choices[0]?.message.content ?? "").trim(), ms: Date.now() - t0 };
}

export async function runOpenAIAgent(
  task: string,
  opts: { history?: ChatTurn[]; onEvent?: (e: AgentEvent) => void; recordOnChain?: boolean; settings: AISettings; signal?: AbortSignal },
) {
  const s = opts.settings;
  const emit = opts.onEvent ?? (() => {});
  emit({ type: "mode", mode: "llm", model: s.model });

  const messages: Msg[] = [{ role: "system", content: systemPrompt(s) }];
  for (const t of (opts.history ?? []).slice(-10)) if (t.text.trim()) messages.push({ role: t.role, content: t.text } as Msg);
  messages.push({ role: "user", content: task });

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    if (opts.signal?.aborted) return emit({ type: "error", message: "已取消" });
    const r = await complete(s, { messages, tools: openaiTools, tool_choice: "auto" }, opts.signal);
    const choice = r.choices[0];
    if (!choice) return emit({ type: "error", message: "模型没有返回内容" });
    const msg = choice.message;
    if (msg.refusal || choice.finish_reason === "content_filter") return emit({ type: "final", text: "模型拒绝了这个请求。" });

    const calls = msg.tool_calls ?? [];
    if (!calls.length) return emit({ type: "final", text: (msg.content ?? "").trim() || "（无输出）" });

    if (msg.content?.trim()) emit({ type: "text", text: msg.content.trim() });
    messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: calls });

    for (const c of calls) {
      let input: Record<string, unknown>;
      try {
        // 标准是 JSON 字符串；个别兼容接口直接返回对象，两种都接受
        const a = c.function.arguments;
        input = !a ? {} : typeof a === "string" ? JSON.parse(a) : a;
      } catch {
        // 参数不是合法 JSON：不执行，把错误告诉模型让它重来
        messages.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify({ status: "invalid_input", reason: "参数不是合法的 JSON" }) });
        continue;
      }
      emit({ type: "tool", id: c.id, name: c.function.name, input });
      try {
        const out = await runTool(c.function.name, input, opts);
        emit({ type: "tool_result", id: c.id, name: c.function.name, result: out });
        messages.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(out) });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        emit({ type: "tool_result", id: c.id, name: c.function.name, result: { status: "error", reason: message } });
        messages.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify({ status: "error", reason: message }) });
      }
    }
  }
  emit({ type: "final", text: `已达到最大轮数 ${MAX_TURNS}，停止。` });
}
