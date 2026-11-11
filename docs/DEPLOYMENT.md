# Sepolia 部署记录

## 两套环境
| 环境 | 用途 | 配置文件 | 启动方式 |
|---|---|---|---|
| **正式演示（stage）** | 只用于上台演示。全新部署，从干净的状态开始 | `deployments/stage.json` | 默认 |
| **练习（rehearsal）** | 开发、全部测试、练习演示。下面 v1～v3 的全部合约和测试记录都在这里；**报告里的链上证据（`docs/EVIDENCE.md`、`docs/E2E-RESULTS.md`）都来自这套** | `deployments/rehearsal.json` | 命令前加 `AV_ENV=rehearsal` |

两套环境共用同一个 MockUSDC 和同一批测试钱包（主人、AI 代理、商家、平台仲裁人、云间外卖收款地址），金库、工厂和商家合约各自独立。练习环境的标签标题会带"[练习]"。端到端测试脚本 `npm run e2e` 只允许在练习环境运行。

## 正式演示环境 v4（2026-11-09，`script/DeployStage.s.sol`，均已验证源码）
| 合约 | 地址 | 白名单 |
|---|---|---|
| AgentVault（金库） | [`0xDcB3853dbf1A9c0B53853d1C2EE84bceA53C1442`](https://sepolia.etherscan.io/address/0xDcB3853dbf1A9c0B53853d1C2EE84bceA53C1442#code) | — |
| ShopFactory（官方开店工厂） | [`0xBD10670313A082372Dc69B34b6c0d33d091cFfc2`](https://sepolia.etherscan.io/address/0xBD10670313A082372Dc69B34b6c0d33d091cFfc2#code) | — |
| 饭点到·家常小厨 | [`0xAbd934d535418dc79eC837236bd11F274d54d69D`](https://sepolia.etherscan.io/address/0xAbd934d535418dc79eC837236bd11F274d54d69D#code) | ✅ |
| 一点甜·奶茶咖啡 | [`0x1500CB21480c6c22B273de787758B20245625116`](https://sepolia.etherscan.io/address/0x1500CB21480c6c22B273de787758B20245625116#code) | ✅ |
| 快到·打车 | [`0xB08Bb122c6f6d535bEE78Dc49983160007074da8`](https://sepolia.etherscan.io/address/0xB08Bb122c6f6d535bEE78Dc49983160007074da8#code) | ✅ |
| 天天特价·首单1折（诈骗店） | [`0xB23891e2419A635594a59cAC7BF62dBb025a5298`](https://sepolia.etherscan.io/address/0xB23891e2419A635594a59cAC7BF62dBb025a5298#code) | ❌ |
| 小卖部·便利店 | [`0x96465E99Baf51BE72af31B0FF2eb812EdC1d9426`](https://sepolia.etherscan.io/address/0x96465E99Baf51BE72af31B0FF2eb812EdC1d9426#code) | ❌（留给演示时现场导入） |
| 云间外卖 CloudEats 收款地址（外部平台，x402） | `0x861A5564efB8CF5468A41696dDA537288B125bF4` | ✅ |
| MockUSDC（沿用） | [`0x18CaD1a9F7a97F73dA3EbA11779B37F045c8f42A`](https://sepolia.etherscan.io/address/0x18CaD1a9F7a97F73dA3EbA11779B37F045c8f42A#code) | — |

初始状态：金库存入 500 mUSDC；AI 额度每日 1000 / 单笔 30，有效 30 天；平台仲裁人 `0xA8193B2eA795Fa1254BE619d5b741daEbe5948D2`；确认期 3 分钟。部署区块 12098155。

---

# 练习环境（rehearsal）的部署历史

> **v3（2026-11-09）**：新增官方开店工厂，商家合约换成 v3（防涨价、申诉仲裁）。金库仍是 v2 `0x301ee5902258D0548A23Ac24899a3DC1EAE283b1`。
>
> | 合约 | 地址（均已验证源码） | 白名单 |
> |---|---|---|
> | ShopFactory | `0xEc1Fe188A67a9fc109a7deAb6402d29EFB4a2836` | — |
> | 饭点到·家常小厨 | `0x5AC252E353b5958853634D449F96Dd74D2277C54` | ✅ |
> | 一点甜·奶茶咖啡 | `0xda233B6DD30B9B81aaA281612201673fAa71EF25` | ✅ |
> | 快到·打车 | `0xFA59Fb53d58FdA38B4e267E5B2CF9CBca5626721` | ✅ |
> | 天天特价·首单1折（诈骗店） | `0x5d2D8BA46fb583a4942cf3A6c6f9A10b79055015` | ❌ |
> | 小卖部·便利店 | `0xbEb6F56491f80b9df5532342F2e5Ad2D43cd7c65` | ❌（留给演示时现场导入） |
>
> 平台仲裁人（测试钱包）：`0xA8193B2eA795Fa1254BE619d5b741daEbe5948D2`。复现：`script/DeployV3.s.sol`。下面 v2 的商家合约已停用。

> **当前版本：v2**（2026-11-08）。v2 新增商家托管合约 AgentShop，金库升级为"转账并通知"商家合约。
> 下面先列 v2，后面保留 v1 的记录（v1 金库已取空并收回代理授权，历史交易仍可在 Etherscan 查到）。

## v2 合约地址（全部已在 Etherscan 验证源码）
| 合约 | 地址 | 说明 |
|---|---|---|
| AgentVault v2 | [`0x301ee5902258D0548A23Ac24899a3DC1EAE283b1`](https://sepolia.etherscan.io/address/0x301ee5902258D0548A23Ac24899a3DC1EAE283b1#code) | 金库（支持付款回调商家合约） |
| MockUSDC | [`0x18CaD1a9F7a97F73dA3EbA11779B37F045c8f42A`](https://sepolia.etherscan.io/address/0x18CaD1a9F7a97F73dA3EbA11779B37F045c8f42A#code) | 测试稳定币（沿用 v1） |
| AgentShop 🍱 饭点到·家常小厨 | [`0x0124Af75BA693bb41d7E9b7EFA8e4Ba48b940A93`](https://sepolia.etherscan.io/address/0x0124Af75BA693bb41d7E9b7EFA8e4Ba48b940A93#code) | 外卖，✅ 白名单 |
| AgentShop 🧋 一点甜·奶茶咖啡 | [`0x1b19d4738F378856d3a7C81bbc584F9a7186cF56`](https://sepolia.etherscan.io/address/0x1b19d4738F378856d3a7C81bbc584F9a7186cF56#code) | 奶茶咖啡，✅ 白名单 |
| AgentShop 🚕 快到·打车 | [`0x10Ccb03A7B9f81F4cd3C65A4DC72d9845de58cF2`](https://sepolia.etherscan.io/address/0x10Ccb03A7B9f81F4cd3C65A4DC72d9845de58cF2#code) | 打车，✅ 白名单 |
| AgentShop 🔥 天天特价·首单1折 | [`0x28951119aC131017D998ec05c00a0e4465b4adb5`](https://sepolia.etherscan.io/address/0x28951119aC131017D998ec05c00a0e4465b4adb5#code) | 诈骗店（演示用），❌ 故意不加入白名单 |

部署区块：12089388。

**之后入驻的商家**（用 `script/DeployShop.s.sol` 部署，店主 = 商家钱包）：

| 合约 | 地址 | 白名单 |
|---|---|---|
| AgentShop 小卖部·便利店 | [`0x02D0D26091b6f0695337076c0524A0aBFab50D44`](https://sepolia.etherscan.io/address/0x02D0D26091b6f0695337076c0524A0aBFab50D44#code) | 测试时加入（[交易](https://sepolia.etherscan.io/tx/0xc7a6a25beb70ff2592cc2ea5b8d49eb30817c235351fbc738a5aa033fbd1f9f0)），完成一笔 14 mUSDC 的订单后移出（[交易](https://sepolia.etherscan.io/tx/0x3a759c6dfa10fb1bd31a8be3401339ad00dcb9d1edb090ea7aaca7c465adbe0f)），留给演示时现场导入 |
部署 + 初始化一共 14 笔交易，全部成功（`broadcast/DeployV2.s.sol/11155111/run-latest.json`）。

## v2 角色
| 角色 | 地址 | 作用 |
|---|---|---|
| Owner（金库主人） | `0x1Db001e481B4C3706F52455cFf39Fe05f1caC305` | 管金库：额度、白名单、审批、冻结；也可以替 AI 确认收货 / 取消退款 |
| Agent（AI 代理） | `0x9Da8FA6692614E0Aadc9CabC59292A0609Ef73D1` | 下单、付款（受金库规则限制） |
| Merchant（商家钱包） | `0x1Cb9CEB6B28866803E97C74a1c3055630D0143dc` | 4 家店合约的店主：发货、提现。测试钱包，私钥只在 `.env` |

## v2 初始状态（`script/DeployV2.s.sol` 一条命令完成）
| 项目 | 值 |
|---|---|
| 金库余额 | 781 mUSDC（从 v1 金库全部迁移过来） |
| 代理额度 | 每日 100 / 单笔 30 / 30 天有效 |
| 白名单 | 外卖、奶茶咖啡、打车 3 个商家合约 |
| 自动放款期 | 送达后 3 分钟（演示用，部署时可调） |
| 商家钱包 gas | 0.01 SepoliaETH（由 Owner 转入） |

复现命令：
```bash
set -a && source .env && set +a
USDC_ADDRESS=0x18CaD1a9F7a97F73dA3EbA11779B37F045c8f42A OLD_VAULT_ADDRESS=0x51f486f1393F61d2b05BFc9a1937e951b092502b \
  forge script script/DeployV2.s.sol --rpc-url sepolia --broadcast --verify --slow
```

## v2 演示交易（通过网页助手 / 命令行实际运行）
| 场景 | 动作 | 结果 | 交易 |
|---|---|---|---|
| 买入 | "帮我点个午饭，30 块以内，不要辣" → 订单 food-1，29 | ✅ 付款，钱进入外卖合约托管 | https://sepolia.etherscan.io/tx/0x74560f70da2ccc1e5046c8e4799fa8462442340e65014c650ef64bcaa79ce234 |
| 退款（卖出） | "取消刚才的订单"（送达前） | ↩️ 29 从外卖合约退回金库 | https://sepolia.etherscan.io/tx/0xee944220ea4b36765f5927198ccd01a6265f5dc454fcca1a43b6b81b62d7d848 |
| 诈骗店 | "天天特价首单 1 折"，照公告买了 50 元激活费，订单 deals-1，56 | ⛔ MerchantNotAllowed（节点模拟拒绝，钱没动） | — |
| 超额 | "给全组 6 个人点奶茶" → 订单 tea-1，90 | ⏳ 金库待审批 #1，订单仍是"未付款" | https://sepolia.etherscan.io/tx/0x0f3b65552e1ae54b44b24bd83c48a3441bde586807317a6c3b33ead9e504b5af |
| 超额 | 主人批准 #1 → 金库通知奶茶合约 → 订单变成已付款 | ✅ 90 进入奶茶合约托管 | https://sepolia.etherscan.io/tx/0xe1bed87edf03d2f6601cdce485c53a8fd09678d6f79acfb01dc0003d3df27015 |
| 送达 | 商家后台 markDelivered | 🛵 已送达 | https://sepolia.etherscan.io/tx/0xcd09313d793d9159d8588ae37f1912e4f8c0b56be4471a663e3723c403ec05ca |
| 放款 | "奶茶收到了" → AI 确认收货 | 🤝 90 从托管转为商家可提现 | https://sepolia.etherscan.io/tx/0xe33fcdc9ba07160bf20b9fa6b68702695e16ca1d03f58dc36fa625376768f7f5 |
| 买入 | 网页助手再点一次午饭 → 订单 food-2，29 | ✅ 托管 → 40 秒后送达 → 3 分钟无人确认自动放款 | https://sepolia.etherscan.io/tx/0xd3651e3221fa33a730f40328a3681c63c11da6a2caad4630e127d99e108581a2 |

---

# v1 记录（已停用）

- **网络**：Ethereum Sepolia（chain id 11155111）
- **部署日期**：2026-11-08
- **编译器**：solc 0.8.28，optimizer 开启（200 runs）
- **源码验证**：Etherscan ✅、Sourcify ✅

## v1 合约地址
| 合约 | 地址 | Etherscan（已验证源码） |
|---|---|---|
| AgentVault | `0x51f486f1393F61d2b05BFc9a1937e951b092502b` | https://sepolia.etherscan.io/address/0x51f486f1393f61d2b05bfc9a1937e951b092502b#code |
| MockUSDC | `0x18CaD1a9F7a97F73dA3EbA11779B37F045c8f42A` | https://sepolia.etherscan.io/address/0x18cad1a9f7a97f73da3eba11779b37f045c8f42a#code |

## 角色地址
| 角色 | 地址 |
|---|---|
| Owner（金库主人） | `0x1Db001e481B4C3706F52455cFf39Fe05f1caC305` |
| Agent（AI 代理） | `0x9Da8FA6692614E0Aadc9CabC59292A0609Ef73D1` |

## v1 演示环境初始状态（当时由 v1 初始化脚本设置；该脚本已从仓库删除，现在的一键部署见 `script/DeployStage.s.sol`）
| 项目 | 值 |
|---|---|
| 金库余额 | 1,000 mUSDC |
| 代理每日额度 | 100 mUSDC |
| 代理单笔上限 | 30 mUSDC |
| 代理授权有效期 | 30 天（至 2026-12-08 左右） |
| 代理 gas 余额 | 0.02 SepoliaETH |

## 白名单商家（v2：生活场景，2026-11-08 更新）
场景从"AI 买 API 额度 / GPU"改成了"AI 生活小钱包：点外卖、买奶茶、打车"。合约没有改动，只是主人用 `setMerchant` 更新了白名单。

| 商家 | 类别 | 地址 | 白名单 |
|---|---|---|---|
| 🍱 饭点到·家常小厨 | 外卖 | `0x20BDbfeb1c874388305A40c1165C706Ff7D10614` | ✅ |
| 🧋 一点甜·奶茶咖啡 | 奶茶咖啡 | `0xd886479Ec3089E9044AD20C2f3ddFA9B339dd535` | ✅ |
| 🚕 快到·打车 | 打车 | `0xdCA1EC6d943D6E4C58aec973bD0Fc99B6ab00DA1` | ✅ |
| 🔥 天天特价·首单1折 | 诈骗店（演示用） | `0x4625fc9CEfF1D6033F027A9763ee623a23b3444A` | ❌ 故意不加入 |

地址生成方式：`keccak256("agentvault.demo.merchant." + id)` 取后 20 字节，没有人持有这些地址的私钥，只用来收款演示。

白名单更新交易：
| 动作 | 交易 |
|---|---|
| 移除 OpenAPI Credits（旧） | https://sepolia.etherscan.io/tx/0x3d7c7f45ebddfbc447a25a7efda25280c9db9157680ebddb0c6126e186d3da76 |
| 移除 GPU Cloud（旧） | https://sepolia.etherscan.io/tx/0x30740e248606c455642266e792798337ef032dc97d469d37c441f78a5c614869 |
| 移除 Data Shop（旧） | https://sepolia.etherscan.io/tx/0x550c421e0c0cf4afa19ac4cb00eeae5bf68ee9a7f36e904ab90dd246e497d396 |
| 加入 🍱 外卖 | https://sepolia.etherscan.io/tx/0x17d82985c0ddd03a262f34674ea86efa44ffa2ff687f30592ccb2c93d8734b75 |
| 加入 🧋 奶茶咖啡 | https://sepolia.etherscan.io/tx/0x79a4660e2d1c995440e0077158513cc709b636b43b9717c171a94f3f90001ae8 |
| 加入 🚕 打车 | https://sepolia.etherscan.io/tx/0x518054701b85546859b0970d3224bd0c3eee9286f06f063b84e34f3c97deb8b8 |

<details><summary>v1 的旧商家（已移除，历史交易里还能看到）</summary>

| 名称 | 地址 |
|---|---|
| OpenAPI Credits | `0x589430fa58d649A0f9bdA1352334D04E1818AaC1` |
| GPU Cloud | `0xC4B19F5a50173826be47398c9A5b24D871b9BCaA` |
| Data Shop | `0xEe4f17E38faCb64004fEceBBEA8DA9CFf27E42a8` |
</details>

## 复现命令
```bash
set -a && source .env && set +a
forge script script/Deploy.s.sol --rpc-url sepolia --broadcast --verify
# v1 的初始化脚本已删除；要部署一套可以直接演示的新系统，用：
USDC_ADDRESS=<MockUSDC 地址> forge script script/DeployStage.s.sol --rpc-url sepolia --broadcast --verify --slow
```

## 演示交易记录 v1（2026-11-08，旧商家，实际运行 `npm run scenario -- all`）
| 场景 | 动作 | 结果 | 交易 |
|---|---|---|---|
| 1 正常付款 | AI 付 OpenAPI 20 | ✅ 已执行 | https://sepolia.etherscan.io/tx/0x3583d2cbac974bf9f4c6d4e6aa0184737533542388002f2b24ebb9b16ad72739 |
| 1 正常付款 | AI 付 Data Shop 15 | ✅ 已执行 | https://sepolia.etherscan.io/tx/0xe6b055e1246c33f28948396dda6cc4658e1cf359233555a5642e7d9ad41d4950 |
| 2 超额 | AI 付 GPU 45（单笔上限 30） | ⏳ 待审批 #1 | https://sepolia.etherscan.io/tx/0xf56c32a5c69ae9616d269acdf573e5a6f2a006f693795cd8235a1be86492ac92 |
| 2 超额 | 主人批准 #1 | ✅ GPU 收到 45 | https://sepolia.etherscan.io/tx/0x44b026f5b566014be963e0b3dd7ea1221a11263af2487bc26347844e236b41c4 |
| 3 攻击 | 被骗的 AI 付攻击者 500 | ⛔ MerchantNotAllowed（失败交易留档） | https://sepolia.etherscan.io/tx/0x9fcaed0f12d5f0ae91eaf540c3dcc82457535083515d3268818d865dd5463d87 |
| 3 攻击 | 付白名单商家 500 | ⏳ 待审批 #4 → 主人拒绝 | https://sepolia.etherscan.io/tx/0x976df1d41cab6163d26f6a01eb330b845e649bec925d11d2a538c0e55981bb72 |
| 3 攻击 | AI 调用 withdraw() | ⛔ OwnableUnauthorizedAccount（节点模拟拒绝，未上链） | — |
| 4 冻结 | 主人 pause() | 🔴 已冻结 | https://sepolia.etherscan.io/tx/0xbf43e43b9f45d60297d5bd5e25460149bb42ade00e5c5017e4e09718eda683a6 |
| 4 冻结 | AI 付 OpenAPI 5 | ⛔ EnforcedPause | — |
| 4 冻结 | 主人 unpause() | 🟢 恢复 | https://sepolia.etherscan.io/tx/0x6ebbd5083891c65b4aa251a1ea5f668af8bb64fdadeeb69fec9ebd9456c650e1 |

运行后状态：金库 920 mUSDC（1000 − 20 − 15 − 45），攻击者收到 **0**；人工批准的 45 不占用 AI 的每日额度（今日剩余 65/100）。
注：请求 #2、#3 是调试时重复运行场景 3 产生的，已被主人拒绝。

## 演示交易记录 v2（生活场景，通过网页助手下单）
| 场景 | 动作 | 结果 | 交易 |
|---|---|---|---|
| 超额点单 | "给全组 6 个人点奶茶"，订单 T1002，90（单笔上限 30） | ⏳ 待审批 #5 | https://sepolia.etherscan.io/tx/0xd8a7abc1b2f8abd1e3c0596dec20d5859b22ae35929b1be5e2b8094639f4318d |
| 超额点单 | 主人批准 #5 → 商家从链上看到 `RequestApproved`，自动接单 | ✅ 奶茶店收到 90 | https://sepolia.etherscan.io/tx/0xac1230338601adb2f5ca26e7e970dbd9ac60bf8cc096e7334176f0516fb9a762 |
| 正常点单 | "帮我点个午饭，30 块以内，不要辣"，订单 F1003：照烧鸡腿便当 + 冰红茶 | ✅ 自动付款 29，商家接单 | https://sepolia.etherscan.io/tx/0x772aada344900b2e17b87d48f863b774a5da0a52dd3b0573d04a47ace31b1e5f |
| 诈骗店 | "天天特价首单 1 折"，店家要求先付 50 元激活费，订单 D1004，56 | ⛔ MerchantNotAllowed（节点模拟拒绝，钱没动） | — |
