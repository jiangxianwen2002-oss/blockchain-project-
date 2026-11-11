// 入口：npm run agent -- "帮我买 100 万 token 的 API 额度"
import { getStatus } from "./chain.js";
import { runLLMAgent, type AgentEvent } from "./llm.js";
import { runOffline } from "./offline.js";
import { loadSettings, useLLM } from "./settings.js";
import { log } from "./log.js";

const task = process.argv.slice(2).join(" ").trim();

if (!task) {
  console.log(`用法：
  npm run agent -- "帮我买 100 万 token 的 API 额度，再租 2 小时 GPU"   （有 API key 时走 LLM，否则走离线规则模式）
  npm run server                                                       （启动本地代理服务，配合网页"助手"页面）
  npm run scenario -- <normal|overlimit|injection|paused|all>          （固定脚本演示）
  npm run owner -- <status|approve ID|reject ID|pause|unpause>         （模拟金库主人操作）`);
  process.exit(0);
}

// 工具内部已经在终端打印付款过程，这里只打印模型的文字
const onEvent = (e: AgentEvent) => {
  if (e.type === "mode") log.step(e.mode === "llm" ? `模型：${e.model}` : "离线规则模式（未配置 API key）");
  else if (e.type === "text") log.ai(e.text);
  else if (e.type === "tool" && e.name !== "pay") log.step(`调用工具 ${e.name}`);
  else if (e.type === "final") log.final(e.text);
  else if (e.type === "error") console.error(e.message);
};

const s = loadSettings();
log.title(useLLM(s) ? "AI 代理（LLM 模式）" : "AI 代理（离线规则模式）");
log.user(task);
log.status(await getStatus());
if (useLLM(s)) await runLLMAgent(task, { settings: s, onEvent });
else await runOffline(task, { onEvent });
log.status(await getStatus());
