// 语音：用浏览器自带的语音识别（Chrome 的 Web Speech API），不需要任何 API key
import { useEffect, useRef, useState } from "react";
import { isEn, t } from "./i18n";

type Rec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

const Ctor = (globalThis as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec })
  .SpeechRecognition ?? (globalThis as unknown as { webkitSpeechRecognition?: new () => Rec }).webkitSpeechRecognition;

export const speechSupported = Boolean(Ctor);

/**
 * 点一下开始听，再点一下（或停顿）结束。
 * onText 实时收到识别中的文字；onDone 在说完后收到最终文字（用来自动发送）。
 */
export function useSpeech(onText: (t: string) => void, onDone: (t: string) => void) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const rec = useRef<Rec | null>(null);
  const text = useRef("");
  const cb = useRef({ onText, onDone });
  cb.current = { onText, onDone };

  useEffect(() => () => rec.current?.stop(), []);

  function start() {
    if (!Ctor) return;
    setError("");
    const r = new Ctor();
    r.lang = isEn ? "en-US" : "zh-CN";
    r.interimResults = true;
    r.continuous = false;
    text.current = "";
    r.onresult = (e) => {
      let t = "";
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      text.current = t;
      cb.current.onText(t);
    };
    r.onerror = (e) => {
      setError(
        e.error === "not-allowed"
          ? t("麦克风权限被拒绝，请在地址栏左侧允许麦克风", "Microphone blocked. Allow it from the left side of the address bar.")
          : e.error === "no-speech"
            ? t("没有听到声音", "Didn't hear anything")
            : `${t("语音识别出错", "Speech recognition error")}：${e.error}`,
      );
    };
    r.onend = () => {
      setListening(false);
      rec.current = null;
      if (text.current.trim()) cb.current.onDone(text.current.trim());
    };
    rec.current = r;
    r.start();
    setListening(true);
  }

  return { listening, error, toggle: () => (listening ? rec.current?.stop() : start()) };
}

/** 朗读 AI 的回复 */
export function speak(text: string) {
  if (!("speechSynthesis" in globalThis)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/[✅⏳⛔⚠️☠️🤖]/gu, ""));
  u.lang = isEn ? "en-US" : "zh-CN";
  speechSynthesis.speak(u);
}
