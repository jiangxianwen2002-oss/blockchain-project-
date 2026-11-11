// 本地代理服务：网页"助手"页面 ⇄ AI 代理 ⇄ 合约
// 为什么需要它：AI 代理的私钥绝不能放进浏览器（谁打开网页都能拿到），所以由本机的这个服务持有私钥、调模型、发交易，
// 网页只负责输入（文字 / 语音）和展示每一步。
//
// 安全措施：
// - 只监听 127.0.0.1，局域网其他机器访问不到
// - 只接受来自本地前端页面（localhost:5173）的请求，防止别的网站在你浏览器里偷偷调用它
// - API Key 只保存在本机，接口只返回打码提示
// - 同一时间只处理一条指令，避免代理钱包 nonce 冲突
// - 就算这个服务被攻破，攻击者能做的也只是"以 AI 代理的身份付款"，仍然受合约的额度和白名单限制
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { runLLMAgent, testConnection, type AgentEvent, type ChatTurn } from "./llm.js";
import { runOffline } from "./offline.js";
import { startMerchantBot } from "./merchant.js";
import { clearKey, loadSettings, publicSettings, saveSettings, useLLM } from "./settings.js";
import { AV_ENV, deployment } from "./config.js";

const PORT = Number(process.env.AGENT_PORT || 8787);
const ALLOWED = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

let busy = false;

function json(res: ServerResponse, code: number, body: unknown) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 100_000) throw new Error("请求太大");
  }
  return raw ? JSON.parse(raw) : {};
}

const errMsg = (err: unknown) => {
  const e = err as { status?: number; message?: string };
  if (e?.status === 401) return "API Key 无效（401）";
  if (e?.status === 404) return "接口地址或模型名称不对（404）";
  if (e?.status === 400) return `请求被拒绝（400）：${e.message ?? ""}`;
  return e?.message ?? String(err);
};

const server = createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (origin && !ALLOWED.test(origin)) return json(res, 403, { error: "只允许本地前端访问" });
  const url = new URL(req.url ?? "/", "http://localhost");

  try {
    if (url.pathname === "/api/health") return json(res, 200, { ok: true, busy, ...publicSettings() });

    if (url.pathname === "/api/settings" && req.method === "GET") return json(res, 200, publicSettings());

    if (url.pathname === "/api/settings" && req.method === "PUT") {
      const b = await readBody(req);
      if (b.clearKey === true) clearKey();
      saveSettings({
        provider: b.provider === "openai" || b.provider === "anthropic" ? b.provider : undefined,
        baseURL: typeof b.baseURL === "string" ? b.baseURL : undefined,
        apiKey: typeof b.apiKey === "string" ? b.apiKey : undefined,
        model: typeof b.model === "string" ? b.model : undefined,
        rules: typeof b.rules === "string" ? b.rules : undefined,
        offline: typeof b.offline === "boolean" ? b.offline : undefined,
      });
      return json(res, 200, publicSettings());
    }

    if (url.pathname === "/api/settings/test" && req.method === "POST") {
      const s = loadSettings();
      if (!s.apiKey) return json(res, 400, { ok: false, error: "还没有填写 API Key" });
      try {
        return json(res, 200, await testConnection(s));
      } catch (err) {
        return json(res, 200, { ok: false, error: errMsg(err) });
      }
    }

    if (url.pathname === "/api/chat" && req.method === "POST") {
      const b = await readBody(req);
      const message = String(b.message ?? "").trim().slice(0, 2000);
      const history = (Array.isArray(b.history) ? b.history : []) as ChatTurn[];
      const replyLang = b.lang === "en" ? "en" : "zh";
      if (!message) return json(res, 400, { error: "消息为空" });
      if (busy) return json(res, 409, { error: "上一条指令还在执行，请稍等" });

      busy = true;
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      const send = (e: AgentEvent | { type: "done" }) => res.write(`data: ${JSON.stringify(e)}\n\n`);
      const ac = new AbortController();
      res.on("close", () => ac.abort());
      const s = { ...loadSettings(), replyLang } as const;
      // 记录 AI 是否已经动过手（调用过工具）。还没动手就出错（Key 错、断网、额度用完）→ 自动换离线规则模式，演示不会卡住；
      // 已经付过款再出错就不重试，避免重复付款
      let acted = false;
      const track = (e: AgentEvent) => {
        if (e.type === "tool") acted = true;
        send(e);
      };
      try {
        if (useLLM(s)) await runLLMAgent(message, { settings: s, history, onEvent: track, signal: ac.signal });
        else await runOffline(message, { onEvent: send, lang: replyLang });
      } catch (err) {
        if (!acted && useLLM(s) && !ac.signal.aborted) {
          send({
            type: "text",
            text: replyLang === "en" ? `AI API error (${errMsg(err)}); using offline rules mode this time.` : `AI 接口出错（${errMsg(err)}），本次改用离线规则模式。`,
          });
          try {
            await runOffline(message, { onEvent: send, lang: replyLang });
          } catch (e2) {
            send({ type: "error", message: errMsg(e2) });
          }
        } else send({ type: "error", message: errMsg(err) });
      } finally {
        busy = false;
        send({ type: "done" });
        res.end();
      }
      return;
    }

    json(res, 404, { error: "not found" });
  } catch (err) {
    if (!res.headersSent) json(res, 500, { error: errMsg(err) });
  }
});

startMerchantBot();

server.listen(PORT, "127.0.0.1", () => {
  const s = loadSettings();
  console.log(`🛡️  AgentVault 本地代理服务已启动：http://127.0.0.1:${PORT}`);
  console.log(`   环境：${AV_ENV === "stage" ? "正式演示（stage）" : "练习（rehearsal）"} · 金库 ${deployment.contracts.AgentVault}`);
  console.log(`   模式：${useLLM(s) ? `LLM（${s.provider === "openai" ? "OpenAI 协议" : "Anthropic 协议"}，${s.model} @ ${s.baseURL}）` : "离线规则模式（可在网页控制台填写 API Key）"}`);
});
