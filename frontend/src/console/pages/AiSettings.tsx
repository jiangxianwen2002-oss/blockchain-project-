// AI 设置：API 地址 / Key / 模型 / 偏好。保存在本机 AI 服务里（agent/settings.local.json），不上链、不进 Git
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Check } from "lucide-react";
import { api } from "../../agentApi";
import { Badge } from "../../shared/ui";
import { t } from "../../i18n";

/** 界面上的选项。智谱走的是 OpenAI 协议（服务端只区分 anthropic / openai 两种协议），这里单独列出来方便填写 */
type Provider = "anthropic" | "openai" | "zhipu";
const protocolOf = (p: Provider) => (p === "anthropic" ? "anthropic" : "openai");
const PRESETS: Record<Provider, { label: string; baseURL: string; models: string[]; keyHint: string; note: string }> = {
  anthropic: {
    label: t("Anthropic 协议", "Anthropic API"),
    baseURL: "https://api.anthropic.com",
    models: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-fable-5-1"],
    keyHint: "sk-ant-…",
    note: t("Claude 官方接口，或兼容 Anthropic 协议的中转地址。", "The official Claude API, or any Anthropic-compatible endpoint."),
  },
  openai: {
    label: t("OpenAI 协议", "OpenAI-compatible"),
    baseURL: "https://api.openai.com/v1",
    models: ["gpt-4o", "deepseek-chat", "qwen-plus"],
    keyHint: "sk-…",
    note: t("OpenAI 以及各种兼容接口：DeepSeek（https://api.deepseek.com/v1）、通义千问、Kimi、本地 Ollama（http://localhost:11434/v1）等。地址填到 /v1 为止。", "OpenAI and compatible APIs: DeepSeek (https://api.deepseek.com/v1), Qwen, Kimi, local Ollama (http://localhost:11434/v1), etc. The URL ends at /v1."),
  },
  zhipu: {
    label: t("智谱 GLM", "Zhipu GLM"),
    baseURL: "https://open.bigmodel.cn/api/paas/v4",
    models: ["glm-5.1", "glm-4.6", "glm-4-flash"],
    keyHint: t("智谱开放平台的 API Key", "Zhipu Open Platform API key"),
    note: t("智谱开放平台（bigmodel.cn）的 OpenAI 兼容接口。模型名以智谱官网的模型列表为准；GLM Coding 套餐的 Key 要用 https://open.bigmodel.cn/api/coding/paas/v4。", "Zhipu Open Platform (bigmodel.cn), OpenAI-compatible. Check Zhipu's model list for names; GLM Coding Plan keys use https://open.bigmodel.cn/api/coding/paas/v4."),
  },
};
/** 已保存的配置 → 界面选项：OpenAI 协议 + 智谱地址 = 智谱 */
const fromSaved = (provider: "anthropic" | "openai", baseURL: string): Provider =>
  provider === "openai" && /bigmodel\.cn/.test(baseURL) ? "zhipu" : provider;

export function AiSettingsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["ai-settings"], queryFn: api.getSettings, retry: false });
  const [provider, setProvider] = useState<Provider>("anthropic");
  const [baseURL, setBaseURL] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [rules, setRules] = useState("");
  const [offline, setOffline] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (q.data && !loaded) {
      setProvider(fromSaved(q.data.provider ?? "anthropic", q.data.baseURL));
      setBaseURL(q.data.baseURL);
      setModel(q.data.model);
      setRules(q.data.rules);
      setOffline(q.data.offline);
      setLoaded(true);
    }
  }, [q.data, loaded]);

  async function run(fn: () => Promise<string>) {
    setBusy(true);
    setMsg(null);
    try {
      setMsg({ ok: true, text: await fn() });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
      qc.invalidateQueries({ queryKey: ["ai-settings"] });
    }
  }

  const save = () =>
    run(async () => {
      await api.saveSettings({ provider: protocolOf(provider), baseURL, apiKey, model, rules, offline });
      setApiKey("");
      return t("已保存，下一条指令生效", "Saved. Applies from the next message.");
    });

  const test = () =>
    run(async () => {
      if (apiKey || protocolOf(provider) !== q.data?.provider || baseURL !== q.data?.baseURL || model !== q.data?.model)
        await api.saveSettings({ provider: protocolOf(provider), baseURL, apiKey, model });
      setApiKey("");
      const r = await api.test();
      if (!r.ok) throw new Error(`${t("连接失败", "Connection failed")}：${r.error}`);
      return `${t("连接成功", "Connected")} · ${r.model} · ${r.ms} ms`;
    });

  const s = q.data;
  if (q.isError)
    return (
      <section className="panel panel-pad narrow">
        <p className="muted">{t("AI 服务没有启动。在终端运行", "The AI service isn't running. In a terminal run")} <code className="mono">cd agent && npm run server</code></p>
      </section>
    );

  return (
    <div className="stack narrow">
      <section className="panel panel-pad">
        <div className="panel-head flush">
          <h2>{t("模型接口", "Model API")}</h2>
          {s && (s.hasKey && !s.offline ? <Badge tone="ok">{t("AI 模式", "AI mode")}</Badge> : <Badge tone="warn">{t("离线规则模式", "Offline rules mode")}</Badge>)}
        </div>
        <div className="seg" role="radiogroup" aria-label={t("接口协议", "API protocol")}>
          {(Object.keys(PRESETS) as Provider[]).map((p) => (
            <button
              key={p}
              role="radio"
              aria-checked={provider === p}
              className={provider === p ? "on" : ""}
              onClick={() => {
                if (p === provider) return;
                // 换协议时：地址和模型如果还是另一种协议的默认值，就换成这种协议的默认值
                const prev = PRESETS[provider];
                if (!baseURL || baseURL === prev.baseURL) setBaseURL(PRESETS[p].baseURL);
                if (!model || prev.models.includes(model)) setModel(p === "openai" ? "" : PRESETS[p].models[0]);
                setProvider(p);
              }}
            >
              {PRESETS[p].label}
            </button>
          ))}
        </div>
        <p className="faint small">{PRESETS[provider].note}{t("换协议后需要填对应平台的 Key。", " After switching, enter that provider's key.")}</p>
        <div className="form-grid two-col">
          <label className="field">
            <span>{t("API 地址", "API URL")}</span>
            <input className="input" value={baseURL} onChange={(e) => setBaseURL(e.target.value)} placeholder={PRESETS[provider].baseURL} />
          </label>
          <label className="field">
            <span>{t("模型", "Model")}</span>
            <input className="input" value={model} onChange={(e) => setModel(e.target.value)} list="models" placeholder={PRESETS[provider].models.slice(0, 2).join(" / ")} />
            <datalist id="models">{PRESETS[provider].models.map((m) => <option key={m} value={m} />)}</datalist>
          </label>
          <label className="field span-2">
            <span>API Key</span>
            <input
              className="input"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={s?.hasKey ? t(`已保存 ${s.keyHint} · 留空不修改`, `Saved ${s.keyHint} · leave empty to keep`) : PRESETS[provider].keyHint}
              autoComplete="off"
            />
          </label>
        </div>
        <label className="check small muted">
          <input type="checkbox" checked={offline} onChange={(e) => setOffline(e.target.checked)} />
          {t("强制离线规则模式（没网或没有 Key 时用）", "Force offline rules mode (no network or no key)")}
        </label>
      </section>

      <section className="panel panel-pad">
        <div className="panel-head flush"><h2>{t("使用偏好", "Preferences")}</h2></div>
        <p className="muted small">{t("写给 AI 看的偏好，例如口味和预算。它只约束 AI；额度、白名单这些硬规则在合约里。", "Preferences for the AI, like taste and budget. They only guide the AI; hard rules such as limits and the whitelist live in the contract.")}</p>
        <textarea className="textarea" value={rules} onChange={(e) => setRules(e.target.value)} placeholder={t("不吃辣；午饭不超过 30；晚上 10 点以后不点外卖", "No spicy food; lunch under 30; no delivery after 10 pm")} />
      </section>

      <div className="btn-row">
        <button className="btn btn-primary" disabled={busy} onClick={save}>{t("保存", "Save")}</button>
        <button className="btn" disabled={busy} onClick={test}>{t("测试连接", "Test connection")}</button>
        {s?.keySource === "网页设置" && (
          <button
            className="btn btn-ghost btn-danger"
            disabled={busy}
            onClick={() => confirm(t("删除保存的 API Key？", "Delete the saved API key?")) && run(async () => (await api.saveSettings({ clearKey: true }), t("已删除 Key", "Key deleted")))}
          >
            {t("删除 Key", "Delete key")}
          </button>
        )}
      </div>
      {msg && (
        <div className={`toast ${msg.ok ? "toast-ok" : "toast-err"}`}>
          {msg.ok ? <Check /> : <AlertCircle />}
          <span className="grow">{msg.text}</span>
        </div>
      )}
    </div>
  );
}
