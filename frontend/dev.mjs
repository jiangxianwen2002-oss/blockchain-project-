// npm run dev：同时启动四个应用（助手 :5173、控制台 :5174、商家入驻 :5175、平台仲裁 :5176），Ctrl+C 一起退出
import { spawn } from "node:child_process";
const run = (app, color) => {
  const p = spawn("npx", ["vite"], { env: { ...process.env, APP: app }, stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" });
  const tag = `\x1b[${color}m[${app}]\x1b[0m `;
  for (const s of [p.stdout, p.stderr]) s.on("data", (d) => process.stdout.write(String(d).replace(/^(?=.)/gm, tag)));
  return p;
};
const ps = [run("assistant", 36), run("console", 35), run("merchant", 33), run("platform", 32)];
const stop = () => { for (const p of ps) p.kill(); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
