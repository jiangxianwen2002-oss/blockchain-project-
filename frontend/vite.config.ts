import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// 同一套代码，两个独立的应用：
//   APP=assistant → 用户端（AI 助手），端口 5173
//   APP=console   → 管理端（控制台），端口 5174
//   APP=merchant  → 商家端（入驻开店），端口 5175
//   APP=platform  → 平台方（申诉仲裁），端口 5176
const APPS = { assistant: 5173, console: 5174, merchant: 5175, platform: 5176 } as const;
const app = (process.env.APP && process.env.APP in APPS ? process.env.APP : "assistant") as keyof typeof APPS;
const port = APPS[app];
// 两套链上环境：stage（正式演示，默认）/ rehearsal（练习）。AV_ENV=rehearsal npm run dev
const avEnv = process.env.AV_ENV === "rehearsal" ? "rehearsal" : "stage";
const deploymentFile = fileURLToPath(new URL(`../deployments/${avEnv}.json`, import.meta.url));

/** 开发时把 "/" 指到对应应用的 html */
function entry(): Plugin {
  return {
    name: "agentvault-entry",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === "/" || req.url?.startsWith("/?")) req.url = `/${app}.html`;
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), entry()],
  resolve: { alias: { "@deployment": deploymentFile } },
  server: {
    port,
    strictPort: true,
    fs: { allow: [".."] }, // 允许读取上级目录的 deployments/<环境>.json
    proxy: {
      "/api": { target: "http://127.0.0.1:8787" }, // 本机 AI 代理服务
      "/ucp": { target: "http://127.0.0.1:8788" }, // 模拟的外部平台 CloudEats（UCP 风格结账 + x402）
    },
  },
  build: {
    rollupOptions: {
      input: {
        assistant: fileURLToPath(new URL("./assistant.html", import.meta.url)),
        console: fileURLToPath(new URL("./console.html", import.meta.url)),
        merchant: fileURLToPath(new URL("./merchant.html", import.meta.url)),
        platform: fileURLToPath(new URL("./platform.html", import.meta.url)),
      },
    },
  },
});
