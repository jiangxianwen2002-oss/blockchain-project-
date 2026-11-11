# 前端：四个独立的应用（React + Vite + wagmi）

同一套代码，打包成两个应用，对应两种角色：

| 应用 | 地址 | 给谁用 | 能做什么 |
|---|---|---|---|
| **助手** | http://localhost:5173 | 花钱的人（员工 / 孩子 / 你自己的手机） | 打字或语音告诉 AI 要什么；看订单和链上凭证。**没有任何管理功能** |
| **控制台** | http://localhost:5174 | 金库主人（公司财务 / 家长） | 概览（消费统计、运维提醒）、审批（新请求提醒）、订单（导出 CSV）、资金、额度规则、商家白名单（按合约地址导入，链上检查）、链上对账、AI 设置 |

## 运行
```bash
cd agent && npm run server        # AI 服务 + 商家后台（另开一个终端）
cd frontend && npm install && npm run dev   # 同时启动四个应用：助手 :5173、控制台 :5174、商家入驻 :5175、平台仲裁 :5176
```
单独启动其中一个：`npm run dev:assistant`、`npm run dev:console`、`npm run dev:merchant` 或 `npm run dev:platform`。

控制台的管理操作（审批、冻结、改额度、退款）需要用**装了 MetaMask 的 Chrome**，并连接 Owner 账户（Sepolia）。
只是查看的话不用连钱包：所有数据都由浏览器直接从链上读取。

## 中英文切换
顶栏的"中文 / EN"按钮，或在地址后加 `?lang=en`，例如 http://localhost:5173/?lang=en。界面文字写成 `t("中文", "English")`，见 `src/i18n.tsx`。

## 为什么分成两个应用
- **角色不同**：助手给"花钱的人"日常使用，控制台给"定规则、批钱、对账的人"使用。助手端从界面上就碰不到额度、审批、白名单这些功能。
- **安全**：真正的权限仍然在合约里（管理操作必须由 Owner 钱包签名）。分开之后，界面和权限是一致的。
- **演示**：投影时左右并排两个窗口，台下能同时看到"员工说了一句话"和"管理员那边审批、对账实时变化"。

## 目录
| 路径 | 内容 |
|---|---|
| `assistant.html`、`src/assistant/` | 助手：聊天、AI 工作过程（默认折叠）、语音输入 / 朗读 |
| `console.html`、`src/console/` | 控制台：外壳（侧边导航、钱包、紧急冻结）和 `pages/` 下的 8 个页面 |
| `src/shared/` | 设计规范（`theme.css`）、订单小票和链上凭证（`OrderTicket.tsx`）、通用零件 |
| `src/hooks.ts` | 读链上状态、订单、对账、交易回执；统一的发交易流程（模拟 → 签名 → 等上链 → 刷新） |
| `src/config.ts` | wagmi 配置、读取当前环境的部署信息（`@deployment` → `deployments/stage.json` 或 `rehearsal.json`）、地址 → 名称 |
| `src/agentApi.ts`、`src/speech.ts` | 和本机 AI 服务通信（经 Vite 代理到 `/api`）；浏览器语音识别 |
| `src/generated/abi.ts` | 由 `node scripts/export-abi.mjs` 从 Foundry 编译产物生成 |

## 设计规范
- 只用黑白灰加一个强调色；状态色只有 成功 / 等待 / 失败 三种，并且总是同时带图标和文字。
- 图标统一使用 Lucide，界面里不用 emoji。
- 金额用等宽数字，保留两位小数。
- 解释性文字放在文档里，界面上只保留必要的一句。
- 支持浅色和深色（跟随系统），手机宽度下没有横向滚动。
