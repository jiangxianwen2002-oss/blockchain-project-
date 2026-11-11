# 端到端测试结果（Sepolia）

运行时间：2026-11-09T13:50:12.461Z　结果：**39/39 通过**（首次 38/39，1 项修复后复测通过）

控制台、商家入驻、平台仲裁页面上需要 MetaMask 签名的操作，由脚本用对应角色的测试钱包发出完全相同的合约调用；AI 一侧用离线规则模式（不调用大模型）。脚本：`agent/src/e2e.ts`（`npm run e2e`）。


## 控制台 · 额度规则

| 结果 | 检查 | 说明 | 交易 |
|---|---|---|---|
| ✅ | 保存额度（单笔改成 20） | 单笔上限 = 20 | [查看](https://sepolia.etherscan.io/tx/0xb38e05491e06d04d8147b538c76a6caa5ce5e5ae32e74e499bdb67c6c53fcd16) |
| ✅ | 恢复原额度 | 单笔上限 = 30 | [查看](https://sepolia.etherscan.io/tx/0x5bb7372a9650f48da08ed658cba3ed4c07be27a3f830e2896353e083b558f6ec) |
| ✅ | 单笔大于每日额度会被拒绝 | InvalidLimits |  |

## 控制台 · 紧急冻结

| 结果 | 检查 | 说明 | 交易 |
|---|---|---|---|
| ✅ | 冻结 |  | [查看](https://sepolia.etherscan.io/tx/0x3247d0ea098dfce207f6b41f8988a2222496662980f86100291bd1a35c9e2b40) |
| ✅ | 冻结期间 AI 付款被拒绝 | EnforcedPause |  |
| ✅ | 解冻 |  | [查看](https://sepolia.etherscan.io/tx/0xef446667e4af64cefa5d5c751fd8dbacb118d23199eb7bc7bf98a3d0d57678a6) |

## 助手 / 控制台 · 超额付款审批

| 结果 | 检查 | 说明 | 交易 |
|---|---|---|---|
| ✅ | 超额付款进入待审批 | 请求 #6，金额 90 | [查看](https://sepolia.etherscan.io/tx/0x200336017c468633332ff824a25b9d4dc894da9f301388a912d97d4b2e95746c) |
| ✅ | 批准后订单变成已付款（托管中） | tea-2：已付款（钱在商家合约托管），商家备货中 | [查看](https://sepolia.etherscan.io/tx/0x8e2de6c9c8d00d282a1cfa9b35f6df28b149885574315413e159db98f5ab53fd) |
| ✅ | 第二笔超额也进入待审批 | 请求 #7，金额 45 | [查看](https://sepolia.etherscan.io/tx/0x7e4d093496b432fbfcae8be2ea04fc640823250e3eba971405eb1383c9f07b8d) |
| ✅ | 拒绝后钱没有付出（请求状态 = 已拒绝） |  | [查看](https://sepolia.etherscan.io/tx/0xe2c3b08d51447b3441bf0df33a87bb617b59698d45de89e9d3c0a11019a28961) |
| ✅ | 已拒绝的请求不能再批准 | RequestNotPending |  |

## 控制台 · 商家白名单（导入 / 移出）

| 结果 | 检查 | 说明 | 交易 |
|---|---|---|---|
| ✅ | 导入「小卖部·便利店」 |  | [查看](https://sepolia.etherscan.io/tx/0xa1e1f2422ec2d30247d45d6c12a35b0731762bddbe1ac8d3a85f1826284b53d9) |
| ✅ | 导入后 AI 马上能在这家店下单付款 | store-1 付款 4.5 | [查看](https://sepolia.etherscan.io/tx/0xa6b893af596dfb12711687a199be0dd0612f069b06ff5ad3f5a1f34e873465aa) |
| ✅ | 移出白名单（恢复演示前的状态） |  | [查看](https://sepolia.etherscan.io/tx/0x151aad8cc4555fcdc7887f867c9836b0a503bb1f94b21804f1db3847f4497ab1) |
| ✅ | 移出后 AI 付款被合约拒绝 | MerchantNotAllowed |  |

## 控制台 · 外部平台（CloudEats，x402）

| 结果 | 检查 | 说明 | 交易 |
|---|---|---|---|
| ✅ | 移出平台收款地址 |  | [查看](https://sepolia.etherscan.io/tx/0xb08fc62e0a8c68ca28332ac187e980d4c2a5351f4e38abfc6605645d8eb297f6) |
| ✅ | 移出后 x402 付款被合约拒绝 | MerchantNotAllowed |  |
| ✅ | 加回白名单 |  | [查看](https://sepolia.etherscan.io/tx/0xc6df129db895eb2a4b9d251dae2f99bc23ea2677f547806a245a6366fb292e17) |
| ✅ | 加回后 402 → 金库付款 → 平台核实，订单确认 | 首次运行 ❌：平台后台扫描先在链上确认了订单（cloudeats-4），再收到付款凭证时没有返回 x402 回执。已修复 `cloudeats.ts`，复测 cloudeats-5、cloudeats-6 均通过 | [查看](https://sepolia.etherscan.io/tx/0x77fdd5cdc426d1bc7dfbc6379361eb3fe089e830021ca0ca00cc96f21daa781c) |

## 控制台 · 普通地址（转账）

| 结果 | 检查 | 说明 | 交易 |
|---|---|---|---|
| ✅ | 加入一个普通钱包地址 | 0x70F38DF5110DAc2997988Dbef5790e7e658448A6 | [查看](https://sepolia.etherscan.io/tx/0xda89805afa42388785f077ec549a7b6b033490c9e77cbccbb63ab131eb87aa86) |
| ✅ | AI 向普通地址转账成功（没有订单和托管） | 1 mUSDC | [查看](https://sepolia.etherscan.io/tx/0x2e57a9ef3a6f2f31f7d7c69e419045cf46db64c10b711258edcac040f81fcef8) |
| ✅ | 移出这个地址 |  | [查看](https://sepolia.etherscan.io/tx/0x1d98f4cd0a82b8d3b759d4e8f40b3651e77d5953b2c4159b0f2ac0d70f42b0f7) |
| ✅ | 移出后再转账被拒绝 | MerchantNotAllowed |  |

## 平台仲裁页

| 结果 | 检查 | 说明 | 交易 |
|---|---|---|---|
| ✅ | 不是仲裁人（金库主人）不能裁决 | NotArbiter |  |
| ✅ | 仲裁人裁决退款：food-2 变成已退款，钱回到金库 | 金库 +25 | [查看](https://sepolia.etherscan.io/tx/0xdd96584ddb394d04cb4040478bed2704585375b424d26312ecec7a912cbd1042) |
| ✅ | 同一单不能再裁决一次 | WrongStatus |  |

## 控制台 · 资金

| 结果 | 检查 | 说明 | 交易 |
|---|---|---|---|
| ✅ | 领取测试币 |  | [查看](https://sepolia.etherscan.io/tx/0x657609f3ef295e56027f1854841472eaf86fb546bce3aff3edcffbc90bdf845e) |
| ✅ | 授权金库使用 10 mUSDC |  | [查看](https://sepolia.etherscan.io/tx/0x2c967907b862cfa3fd75ee3b928f74ca09ce40addf697a87dc7707f59cffa707) |
| ✅ | 存入 10 |  | [查看](https://sepolia.etherscan.io/tx/0xa2d2561cd938f769b2862f37c3e073ec55f0b2494bcefd68668a6f22fb330a57) |
| ✅ | 取出 10 到主人钱包 |  | [查看](https://sepolia.etherscan.io/tx/0x5d8a99a7228712d5b082da8d1d09e9b143b5c9a1bc9a73a602dafd682a769db0) |
| ✅ | AI 钱包不能取款 | OwnableUnauthorizedAccount |  |

## 商家入驻页

| 结果 | 检查 | 说明 | 交易 |
|---|---|---|---|
| ✅ | 确认期短于平台下限会被拒绝 | WindowTooShort |  |
| ✅ | 开店成功，工厂多了一家店 | 0x90F63fa4a7a5d549E92f2D382BA446AA605C37eB | [查看](https://sepolia.etherscan.io/tx/0xae0dd0a68d35072b5e27282884cdafc02b6cb59c5312fe6e07439a80f34bec30) |
| ✅ | 新店是官方模板（isShop = true），店主是商家钱包，菜单 2 项 |  |  |
| ✅ | 新店默认不在用户白名单里（要用户自己导入） |  |  |

## 收尾检查

| 结果 | 检查 | 说明 | 交易 |
|---|---|---|---|
| ✅ | 额度和开始时一样 |  |  |
| ✅ | 金库没有冻结 |  |  |
| ✅ | 便利店仍不在白名单（留给现场演示导入） |  |  |
| ✅ | 云间外卖仍在白名单 |  |  |
