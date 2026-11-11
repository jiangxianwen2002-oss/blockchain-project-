// AI 设置：在网页控制台填写（API 地址 / Key / 模型 / 软规则），保存在本机文件里。
// - 文件 agent/settings.local.json：已加入 .gitignore，权限 600，不上链、不进 Git
// - Key 只存在本机代理服务里，接口永远只返回打码后的提示（sk-…abcd），不会把原文发回浏览器
// - 没在网页上设置时，回退到 .env 里的 ANTHROPIC_API_KEY / ANTHROPIC_BASE_URL（OpenAI 协议则是 OPENAI_API_KEY / OPENAI_BASE_URL）
// - 协议 provider：anthropic（Claude）或 openai（OpenAI 及各种兼容接口）
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./config.js";

export const DEFAULT_BASE_URL = "https://api.anthropic.com";
export const DEFAULT_MODEL = "claude-opus-5-5";
export const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
export type Provider = "anthropic" | "openai";
const FILE = path.join(ROOT, "agent/settings.local.json");

export interface AISettings {
  /** 接口协议 */
  provider: Provider;
  baseURL: string;
  apiKey: string;
  model: string;
  /** 软规则：用户偏好，写进提示词。只约束 AI，不约束合约 —— 真正的硬规则在链上 */
  rules: string;
  /** 强制离线规则模式（现场没网 / 没有 key 时演示用） */
  offline: boolean;
  /** 这一次对话的回复语言（来自网页的中英切换，不保存） */
  replyLang?: "zh" | "en";
}

function readFile(): Partial<AISettings> {
  if (!existsSync(FILE)) return {};
  try {
    return JSON.parse(readFileSync(FILE, "utf8"));
  } catch {
    return {};
  }
}

export function loadSettings(): AISettings {
  const f = readFile();
  const provider: Provider = f.provider === "openai" ? "openai" : "anthropic";
  const openai = provider === "openai";
  return {
    provider,
    baseURL: f.baseURL || (openai ? process.env.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE_URL : process.env.ANTHROPIC_BASE_URL || DEFAULT_BASE_URL),
    apiKey: f.apiKey || (openai ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY) || "",
    model: f.model || (openai ? "" : DEFAULT_MODEL),
    rules: f.rules ?? "",
    offline: f.offline ?? false,
  };
}

/** 保存设置。apiKey 传空字符串表示"保持原来的 key 不变" */
export function saveSettings(patch: Partial<AISettings>) {
  const cur = readFile();
  const next: Partial<AISettings> = { ...cur };
  if (patch.provider === "anthropic" || patch.provider === "openai") next.provider = patch.provider;
  if (typeof patch.baseURL === "string") next.baseURL = patch.baseURL.trim().replace(/\/+$/, "");
  if (typeof patch.model === "string") next.model = patch.model.trim();
  if (typeof patch.rules === "string") next.rules = patch.rules.slice(0, 2000);
  if (typeof patch.offline === "boolean") next.offline = patch.offline;
  if (typeof patch.apiKey === "string" && patch.apiKey.trim()) next.apiKey = patch.apiKey.trim();
  writeFileSync(FILE, JSON.stringify(next, null, 2), { mode: 0o600 });
  chmodSync(FILE, 0o600);
}

export function clearKey() {
  const cur = readFile();
  delete cur.apiKey;
  writeFileSync(FILE, JSON.stringify(cur, null, 2), { mode: 0o600 });
}

/** 给浏览器看的版本：key 打码 */
export function publicSettings() {
  const s = loadSettings();
  const k = s.apiKey;
  return {
    provider: s.provider,
    baseURL: s.baseURL,
    model: s.model,
    rules: s.rules,
    offline: s.offline,
    hasKey: Boolean(k),
    keyHint: k ? `${k.slice(0, 7)}…${k.slice(-4)}` : "",
    keySource: readFile().apiKey ? "网页设置" : k ? ".env" : "",
  };
}

/** 是否走 LLM：有 key 且没强制离线 */
export const useLLM = (s: AISettings) => Boolean(s.apiKey) && Boolean(s.model) && !s.offline;
