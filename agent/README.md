# AI 代理（链下，TypeScript）

AI 负责"想"（买什么、付给谁、付多少），合约负责"管"（能不能付）。代理只持有自己的私钥，只能调用合约的 `pay()`。

## 安装
```bash
cd agent
npm install
```
需要项目根目录的 `.env` 已填写 `AGENT_PRIVATE_KEY`（演示场景 4 和 owner 命令还需要 `OWNER_PRIVATE_KEY`）。

## 三种用法

### 1. 演示场景（规则模式，不需要 API key，现场演示用这个）
```bash
npm run scenario -- normal      # 场景 1：限额内付款 → 自动执行
npm run scenario -- overlimit   # 场景 2：超出单笔上限 → 待审批
npm run scenario -- injection   # 场景 3：AI 被 prompt injection 攻破 → 合约拦截
npm run scenario -- paused      # 场景 4：一键冻结 → 付款全部失败
npm run scenario -- all         # 依次运行全部
```

### 2. 网页助手（推荐）：本地代理服务
```bash
npm run server      # 启动 AI 代理服务（8787）和商家后台机器人，然后打开前端 http://localhost:5173 → 💬 助手
```
API 地址 / Key / 模型 / 软规则在网页"控制台 → 🧠 AI 设置"里填写，保存在本机 `agent/settings.local.json`（已 gitignore）。
没有 Key 时自动使用离线规则模式。

### 2½. 模拟外部平台（UCP 结账 + x402 付款）
```bash
npm run cloudeats    # 云间外卖 CloudEats，127.0.0.1:8788。需要 .env 里的 CLOUDEATS_PRIVATE_KEY（平台收款钱包）
```
启动后 AI 会自动发现它（地址可用环境变量 UCP_PLATFORMS 修改）。平台的收款地址要先加入金库白名单。

### 2¾. 大模型接口测试
先在控制台 → AI 设置里填好 Key 和模型并保存，然后：
```bash
npm run llm-test             # 只读：连接 + 查额度和商家（不花钱）
npm run llm-test -- --order  # 再加一单真实下单（链上交易）
npm run llm-test -- --scam   # 再加诈骗店测试（钱不应该付出去）
npm run llm-test -- --all    # 全部
```
每一项显示 ✅ / ❌，不会打印 Key。

### 3. 命令行 LLM 模式
Key 可以在网页里设置，也可以在 `.env` 中填写 `ANTHROPIC_API_KEY`，然后：
```bash
npm run agent -- "帮我点个午饭，30 块以内，不要辣"
```
默认模型 `claude-opus-5-5`（官方接口下开启 adaptive thinking 和服务端 refusal fallback；第三方兼容接口只发送基础参数）。

### 4. 金库主人命令行
```bash
npm run owner -- status         # 余额、额度、商家收款、审批列表
npm run owner -- approve 1      # 批准请求 #1
npm run owner -- reject 2       # 拒绝请求 #2
npm run owner -- pause          # 紧急冻结
npm run owner -- unpause        # 解冻
```

## 文件
| 文件 | 作用 |
|---|---|
| `src/config.ts` | 读取 `.env` 和 `deployments/<环境>.json`（默认 stage，`AV_ENV=rehearsal` 为练习环境） |
| `src/chain.ts` | viem：读金库状态、发起付款、把合约错误翻译成中文 |
| `src/tools.ts` | 给 AI 的 3 个工具：`get_vault_status` / `list_merchants` / `pay` |
| `src/llm.ts` | Claude agent 循环（手写循环，每一步都作为事件推给终端 / 网页） |
| `src/server.ts` | 本地代理服务：设置接口 + 聊天接口（SSE 实时推送），只监听 127.0.0.1 |
| `src/settings.ts` | AI 设置的读写（Key 打码、文件权限 600） |
| `src/offline.ts` | 离线规则模式：关键词 → 看菜单 / 下单 / 付款 |
| `src/registry.ts` | 商家注册表：回放金库的 MerchantSet 事件得到白名单，再读取每家店合约的店名、店主；10 秒缓存，查商家时强制刷新 |
| `src/shop.ts` | 读写链上的商家合约 AgentShop：菜单、下单、订单状态、取消退款、确认收货 |
| `src/merchant.ts` | 商家后台机器人（商家钱包）：已付款的订单约 40 秒后标记送达，送达 3 分钟无人确认自动放款，放款后提现到商家钱包 |
| `src/llm-test.ts` | `npm run llm-test`：大模型接口测试脚本 |
| `src/openai.ts` | OpenAI 协议的 agent 循环（兼容 DeepSeek、通义千问、Ollama 等），在控制台 → AI 设置里切换 |
| `src/ucp.ts` | 外部平台驱动：UCP 风格结账 + x402 付款，AI 的工具按商家类型自动走这条通道 |
| `src/cloudeats.ts` | 模拟的外部外卖平台：402 付款要求、链上核实收款、退款 |
| `src/evidence.ts` | `npm run evidence`：从链上生成证据文档 `docs/EVIDENCE.md` |
| `src/scenarios.ts` | 4 个固定剧本 |
| `src/owner.ts` | 金库主人命令行 |
| `src/generated/abi.ts` | 由 `node scripts/export-abi.mjs` 从 Foundry 编译产物生成 |
