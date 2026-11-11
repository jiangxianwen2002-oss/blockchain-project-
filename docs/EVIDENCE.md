# 链上证据报告（自动生成）

> 由 `npm run evidence` 在 2026-11-11T03:24:46.803Z 生成，读取的是 Sepolia **区块 #12109063** 时的链上状态。
> 部署：练习环境（开发和测试用，包含全部测试交易），金库 `0x301ee5902258D0548A23Ac24899a3DC1EAE283b1`。
> 所有数据都直接来自链上（合约状态、事件、交易回执），不依赖本地记录。每个地址和交易都附 Etherscan 链接，可以逐条核对。

## 1. 合约地址（已在 Etherscan 验证源码）

| 合约 | 地址 | 源码 |
|---|---|---|
| AgentVault（金库） | `0x301ee5902258D0548A23Ac24899a3DC1EAE283b1` | [查看已验证源码](https://sepolia.etherscan.io/address/0x301ee5902258D0548A23Ac24899a3DC1EAE283b1#code) |
| MockUSDC（测试稳定币） | `0x18CaD1a9F7a97F73dA3EbA11779B37F045c8f42A` | [查看已验证源码](https://sepolia.etherscan.io/address/0x18CaD1a9F7a97F73dA3EbA11779B37F045c8f42A#code) |
| AgentShop 🍱 饭点到·家常小厨（白名单：✅） | `0x5AC252E353b5958853634D449F96Dd74D2277C54` | [查看已验证源码](https://sepolia.etherscan.io/address/0x5AC252E353b5958853634D449F96Dd74D2277C54#code) |
| AgentShop 🧋 一点甜·奶茶咖啡（白名单：✅） | `0xda233B6DD30B9B81aaA281612201673fAa71EF25` | [查看已验证源码](https://sepolia.etherscan.io/address/0xda233B6DD30B9B81aaA281612201673fAa71EF25#code) |
| AgentShop 🚕 快到·打车（白名单：✅） | `0xFA59Fb53d58FdA38B4e267E5B2CF9CBca5626721` | [查看已验证源码](https://sepolia.etherscan.io/address/0xFA59Fb53d58FdA38B4e267E5B2CF9CBca5626721#code) |
| AgentShop 🔥 天天特价·首单1折（白名单：❌） | `0x5d2D8BA46fb583a4942cf3A6c6f9A10b79055015` | [查看已验证源码](https://sepolia.etherscan.io/address/0x5d2D8BA46fb583a4942cf3A6c6f9A10b79055015#code) |
| AgentShop  小卖部·便利店（白名单：❌） | `0xbEb6F56491f80b9df5532342F2e5Ad2D43cd7c65` | [查看已验证源码](https://sepolia.etherscan.io/address/0xbEb6F56491f80b9df5532342F2e5Ad2D43cd7c65#code) |
| AgentShop 🍱 饭点到·家常小厨（白名单：❌） | `0x0124Af75BA693bb41d7E9b7EFA8e4Ba48b940A93` | [查看已验证源码](https://sepolia.etherscan.io/address/0x0124Af75BA693bb41d7E9b7EFA8e4Ba48b940A93#code) |
| AgentShop 🧋 一点甜·奶茶咖啡（白名单：❌） | `0x1b19d4738F378856d3a7C81bbc584F9a7186cF56` | [查看已验证源码](https://sepolia.etherscan.io/address/0x1b19d4738F378856d3a7C81bbc584F9a7186cF56#code) |
| AgentShop 🚕 快到·打车（白名单：❌） | `0x10Ccb03A7B9f81F4cd3C65A4DC72d9845de58cF2` | [查看已验证源码](https://sepolia.etherscan.io/address/0x10Ccb03A7B9f81F4cd3C65A4DC72d9845de58cF2#code) |
| AgentShop 🔥 天天特价·首单1折（白名单：❌） | `0x28951119aC131017D998ec05c00a0e4465b4adb5` | [查看已验证源码](https://sepolia.etherscan.io/address/0x28951119aC131017D998ec05c00a0e4465b4adb5#code) |
| AgentShop  小卖部·便利店（白名单：❌） | `0x02D0D26091b6f0695337076c0524A0aBFab50D44` | [查看已验证源码](https://sepolia.etherscan.io/address/0x02D0D26091b6f0695337076c0524A0aBFab50D44#code) |

## 2. 余额对账：钱现在在哪里

| 地址 | 链上 mUSDC 余额 | 托管中 | 可提现 | 校验 |
|---|---|---|---|---|
| [小钱包（金库）](https://sepolia.etherscan.io/token/0x18CaD1a9F7a97F73dA3EbA11779B37F045c8f42A?a=0x301ee5902258D0548A23Ac24899a3DC1EAE283b1) | **185.5** | — | — | AI 能动用的钱 |
| [🍱 饭点到·家常小厨](https://sepolia.etherscan.io/token/0x18CaD1a9F7a97F73dA3EbA11779B37F045c8f42A?a=0x5AC252E353b5958853634D449F96Dd74D2277C54) | **0** | 0 | 0 | ✅ 余额 = 托管 + 可提现 |
| [🧋 一点甜·奶茶咖啡](https://sepolia.etherscan.io/token/0x18CaD1a9F7a97F73dA3EbA11779B37F045c8f42A?a=0xda233B6DD30B9B81aaA281612201673fAa71EF25) | **0** | 0 | 0 | ✅ 余额 = 托管 + 可提现 |
| [🚕 快到·打车](https://sepolia.etherscan.io/token/0x18CaD1a9F7a97F73dA3EbA11779B37F045c8f42A?a=0xFA59Fb53d58FdA38B4e267E5B2CF9CBca5626721) | **0** | 0 | 0 | ✅ 余额 = 托管 + 可提现 |
| [🔥 天天特价·首单1折](https://sepolia.etherscan.io/token/0x18CaD1a9F7a97F73dA3EbA11779B37F045c8f42A?a=0x5d2D8BA46fb583a4942cf3A6c6f9A10b79055015) | **0** | 0 | 0 | ✅ 余额 = 托管 + 可提现 |
| [ 小卖部·便利店](https://sepolia.etherscan.io/token/0x18CaD1a9F7a97F73dA3EbA11779B37F045c8f42A?a=0xbEb6F56491f80b9df5532342F2e5Ad2D43cd7c65) | **0** | 0 | 0 | ✅ 余额 = 托管 + 可提现 |
| [🍱 饭点到·家常小厨](https://sepolia.etherscan.io/token/0x18CaD1a9F7a97F73dA3EbA11779B37F045c8f42A?a=0x0124Af75BA693bb41d7E9b7EFA8e4Ba48b940A93) | **0** | 0 | 0 | ✅ 余额 = 托管 + 可提现 |
| [🧋 一点甜·奶茶咖啡](https://sepolia.etherscan.io/token/0x18CaD1a9F7a97F73dA3EbA11779B37F045c8f42A?a=0x1b19d4738F378856d3a7C81bbc584F9a7186cF56) | **0** | 0 | 0 | ✅ 余额 = 托管 + 可提现 |
| [🚕 快到·打车](https://sepolia.etherscan.io/token/0x18CaD1a9F7a97F73dA3EbA11779B37F045c8f42A?a=0x10Ccb03A7B9f81F4cd3C65A4DC72d9845de58cF2) | **0** | 0 | 0 | ✅ 余额 = 托管 + 可提现 |
| [🔥 天天特价·首单1折](https://sepolia.etherscan.io/token/0x18CaD1a9F7a97F73dA3EbA11779B37F045c8f42A?a=0x28951119aC131017D998ec05c00a0e4465b4adb5) | **0** | 0 | 0 | ✅ 余额 = 托管 + 可提现 |
| [ 小卖部·便利店](https://sepolia.etherscan.io/token/0x18CaD1a9F7a97F73dA3EbA11779B37F045c8f42A?a=0x02D0D26091b6f0695337076c0524A0aBFab50D44) | **0** | 0 | 0 | ✅ 余额 = 托管 + 可提现 |
| [商家钱包](https://sepolia.etherscan.io/token/0x18CaD1a9F7a97F73dA3EbA11779B37F045c8f42A?a=0x1Cb9CEB6B28866803E97C74a1c3055630D0143dc) | **508.5** | — | — | 从本环境商家合约提现的总额 |
| [云间外卖 CloudEats（外部平台收款地址）](https://sepolia.etherscan.io/token/0x18CaD1a9F7a97F73dA3EbA11779B37F045c8f42A?a=0x861A5564efB8CF5468A41696dDA537288B125bF4) | **86** | — | — | 金库付给平台的 − 平台退回的（x402） |
| [普通地址（转账）](https://sepolia.etherscan.io/token/0x18CaD1a9F7a97F73dA3EbA11779B37F045c8f42A?a=0x70F38DF5110DAc2997988Dbef5790e7e658448A6) `0x70F38DF5…` | **1** | — | — | AI 直接转账（没有订单和托管） |
| [攻击者地址](https://sepolia.etherscan.io/token/0x18CaD1a9F7a97F73dA3EbA11779B37F045c8f42A?a=0xBAd0000000000000000000000000000000000Bad) | **0** | — | — | ✅ 一分没收到 |
| **合计**（金库 + 商家合约 + 商家钱包 + 外部平台 + 普通地址） | **781** | | | 付款 / 退款 / 放款 / 提现只在这些地址之间移动 |

**资金守恒检查**：金库累计存入 791 − 主人取出 10 = 781；当前合计 781 → ✅ 一分不差

**商家合约账本检查**：✅ 每个商家合约的 mUSDC 余额都等于 托管中 + 可提现

## 3. 每个订单的链上记录

每一行是一笔真实的链上交易；“实际转账”一列是从交易回执里解码出来的 mUSDC Transfer 事件。

### 🍱 饭点到·家常小厨 · 订单 food-1（29 mUSDC，当前状态：Refunded）

| 步骤 | 区块 | 交易 | 实际转账 |
|---|---|---|---|
| 下单 | 12091596 | [`0x504863a2…`](https://sepolia.etherscan.io/tx/0x504863a28e1be9d892ce53b5ed88dca3254a077c24282e24d49e963312887cc3) | （无转账，只改合约账本） |
| 付款进托管 | 12091598 | [`0x7b3b3d14…`](https://sepolia.etherscan.io/tx/0x7b3b3d14f36170cf9d10eaea310657d0a79b86fdead173cb88fa851eba1fa2c4) | 29：小钱包（金库） → 🍱 饭点到·家常小厨 |
| 送达 | 12091609 | [`0x2858761a…`](https://sepolia.etherscan.io/tx/0x2858761ab9a52c3fd2ac76c126d25ea6034f699dd0fef0d30e6a2c9b7671b5ac) | （无转账，只改合约账本） |
| OrderDisputed | 12091612 | [`0x413a6723…`](https://sepolia.etherscan.io/tx/0x413a672329f9d4d57554da115cfff655e44e4e30c77c46d26cb8acf826fe0cc6) | （无转账，只改合约账本） |
| DisputeResolved | 12091625 | [`0xae06191c…`](https://sepolia.etherscan.io/tx/0xae06191c0fbbe419c0115c1890407a40c01e9836d858c0b5e438a8b7a913d43e) | 29：🍱 饭点到·家常小厨 → 小钱包（金库） |
| 退款回金库 | 12091625 | [`0xae06191c…`](https://sepolia.etherscan.io/tx/0xae06191c0fbbe419c0115c1890407a40c01e9836d858c0b5e438a8b7a913d43e) | 29：🍱 饭点到·家常小厨 → 小钱包（金库） |

### 🍱 饭点到·家常小厨 · 订单 food-2（25 mUSDC，当前状态：Refunded）

| 步骤 | 区块 | 交易 | 实际转账 |
|---|---|---|---|
| 下单 | 12095214 | [`0x5008fec2…`](https://sepolia.etherscan.io/tx/0x5008fec2f652e94334e3ecc101220b92681c9a15450da004d3983799aad647a4) | （无转账，只改合约账本） |
| 付款进托管 | 12095216 | [`0x4004ec09…`](https://sepolia.etherscan.io/tx/0x4004ec09820167ecc3767c9b156f668c0c795b056bd3afc4965b9cd6edd2b6a8) | 25：小钱包（金库） → 🍱 饭点到·家常小厨 |
| 送达 | 12095221 | [`0xb5afdc81…`](https://sepolia.etherscan.io/tx/0xb5afdc814353de72f80ce082ee54f2852df132b5fad74b415ae23b0f77a2e9c1) | （无转账，只改合约账本） |
| OrderDisputed | 12095222 | [`0xeb1c690f…`](https://sepolia.etherscan.io/tx/0xeb1c690fd8e52098c68a2b33665993bd4b178450243a22b801c090d37566cc75) | （无转账，只改合约账本） |
| DisputeResolved | 12097916 | [`0xdd96584d…`](https://sepolia.etherscan.io/tx/0xdd96584ddb394d04cb4040478bed2704585375b424d26312ecec7a912cbd1042) | 25：🍱 饭点到·家常小厨 → 小钱包（金库） |
| 退款回金库 | 12097916 | [`0xdd96584d…`](https://sepolia.etherscan.io/tx/0xdd96584ddb394d04cb4040478bed2704585375b424d26312ecec7a912cbd1042) | 25：🍱 饭点到·家常小厨 → 小钱包（金库） |

### 🍱 饭点到·家常小厨 · 订单 food-3（25 mUSDC，当前状态：Completed）

| 步骤 | 区块 | 交易 | 实际转账 |
|---|---|---|---|
| 下单 | 12096431 | [`0xc50fb63f…`](https://sepolia.etherscan.io/tx/0xc50fb63f6d5ef2477ce419a5ae94faf6ed4e836dc3dd1e109b99f1756fe5e2ad) | （无转账，只改合约账本） |
| 付款进托管 | 12096434 | [`0x6850e81b…`](https://sepolia.etherscan.io/tx/0x6850e81bc885bb32f86cb0b3280823abdab5ba328d94a980817e4e769294f0dc) | 25：小钱包（金库） → 🍱 饭点到·家常小厨 |
| 送达 | 12096443 | [`0xfd39273b…`](https://sepolia.etherscan.io/tx/0xfd39273b5290899d55309fefe38b6ba68820f104c3b7c1297d3e8f62dd09eff0) | （无转账，只改合约账本） |
| 放款（托管 → 可提现） | 12096463 | [`0xd3253f9a…`](https://sepolia.etherscan.io/tx/0xd3253f9ab7e5a7af99043f8843f89e99d5d9cc10a0834a74f41a88883fd3c00b) | （无转账，只改合约账本） |
| 商家提现 | 12096464 | [`0x0a0934a1…`](https://sepolia.etherscan.io/tx/0x0a0934a146529f2fffbaa94e8a9e9ae92339fb1489776945e1daacd4f05ba229) | 25：🍱 饭点到·家常小厨 → 商家钱包 |

### 🍱 饭点到·家常小厨 · 订单 food-4（25 mUSDC，当前状态：Completed）

| 步骤 | 区块 | 交易 | 实际转账 |
|---|---|---|---|
| 下单 | 12096448 | [`0x42afee5a…`](https://sepolia.etherscan.io/tx/0x42afee5a2ca1e31ef504c1c42f4f0cc79a51be70ba51ab98cb86746a04e4141b) | （无转账，只改合约账本） |
| 付款进托管 | 12096452 | [`0x8c2f0d4d…`](https://sepolia.etherscan.io/tx/0x8c2f0d4d6cbd8c0eea7354278a321f960e075ecc6a795417d3e9cd0a8c0d1f6a) | 25：小钱包（金库） → 🍱 饭点到·家常小厨 |
| 送达 | 12096459 | [`0x2ab11ef4…`](https://sepolia.etherscan.io/tx/0x2ab11ef4e95bef30f7da7f048d565bd4adfccd8d8d3081dcb0852b1131851dcb) | （无转账，只改合约账本） |
| 放款（托管 → 可提现） | 12096477 | [`0x92680da4…`](https://sepolia.etherscan.io/tx/0x92680da40e716dd84511686ee436fa9b9145b80979c1f8f8ef2f8c62f29d5727) | （无转账，只改合约账本） |
| 商家提现 | 12096478 | [`0x9afeec8a…`](https://sepolia.etherscan.io/tx/0x9afeec8a171604b7757f4aeee693e91455774f17348dace49322d39586c3db70) | 25：🍱 饭点到·家常小厨 → 商家钱包 |

### 🍱 饭点到·家常小厨 · 订单 food-5（20 mUSDC，当前状态：Cancelled）

| 步骤 | 区块 | 交易 | 实际转账 |
|---|---|---|---|
| 下单 | 12096503 | [`0xb748fc8f…`](https://sepolia.etherscan.io/tx/0xb748fc8fd8396195b034bc6589f69a30b76a269532364ca1913bae1332144891) | （无转账，只改合约账本） |
| 取消 | 12096506 | [`0xa206f6a2…`](https://sepolia.etherscan.io/tx/0xa206f6a2ad9829b81eaa6af5e17295658dd16a4eeacd722a991fe646c5face31) | （无转账，只改合约账本） |

### 🍱 饭点到·家常小厨 · 订单 food-6（22 mUSDC，当前状态：Completed）

| 步骤 | 区块 | 交易 | 实际转账 |
|---|---|---|---|
| 下单 | 12096510 | [`0x77a1b124…`](https://sepolia.etherscan.io/tx/0x77a1b1245c3ad2e68f1cd1bd4cbd27a5842289be6b4369b2a0c370a72d7b9711) | （无转账，只改合约账本） |
| 付款进托管 | 12096513 | [`0x92e6279d…`](https://sepolia.etherscan.io/tx/0x92e6279da9fddd59f7baa4f856d6393b67b70a21985c1217990583e12c4e181c) | 22：小钱包（金库） → 🍱 饭点到·家常小厨 |
| 送达 | 12096521 | [`0xec6ec61c…`](https://sepolia.etherscan.io/tx/0xec6ec61c469aeb6c252a5a1ce882ffcf81b555baac21d9c8b211dc13eb5814ee) | （无转账，只改合约账本） |
| 放款（托管 → 可提现） | 12096530 | [`0x9557f45c…`](https://sepolia.etherscan.io/tx/0x9557f45c0cb70fdf1687b3743571a4699ac5ae04bcabc7b335808926c7d206f1) | （无转账，只改合约账本） |
| 商家提现 | 12096532 | [`0xcce34f1c…`](https://sepolia.etherscan.io/tx/0xcce34f1cb5370c8f5abdfabcd26d183afd7bc79322792eaef8f79468d8f5eed8) | 22：🍱 饭点到·家常小厨 → 商家钱包 |

### 🧋 一点甜·奶茶咖啡 · 订单 tea-1（90 mUSDC，当前状态：Completed）

| 步骤 | 区块 | 交易 | 实际转账 |
|---|---|---|---|
| 下单 | 12094534 | [`0x55af8fc7…`](https://sepolia.etherscan.io/tx/0x55af8fc71dfb57a396e431f91a8aa4daf9fecb72cfa81740a9a8cd11065957bf) | （无转账，只改合约账本） |
| 付款进托管 | 12094542 | [`0x39f8cce3…`](https://sepolia.etherscan.io/tx/0x39f8cce3cbfb50bf593980f051d20ac4e67718e7656cab8b6657cc396b9cc791) | 90：小钱包（金库） → 🧋 一点甜·奶茶咖啡 |
| 送达 | 12094547 | [`0x9c9e5848…`](https://sepolia.etherscan.io/tx/0x9c9e58480a3f3ebc3554e9e214fe5171b8ba858e8b272afcbbc895039bdbe38d) | （无转账，只改合约账本） |
| 放款（托管 → 可提现） | 12094573 | [`0x9061a9dd…`](https://sepolia.etherscan.io/tx/0x9061a9dd695ae3f0ffc821744e4d99e4824fc8883833e3adedf690698cde7b85) | （无转账，只改合约账本） |
| 商家提现 | 12094574 | [`0x893147d0…`](https://sepolia.etherscan.io/tx/0x893147d05008985e54b917b76578238c86ff0f3d6fbcff1944f3dcf628cfd8ad) | 90：🧋 一点甜·奶茶咖啡 → 商家钱包 |

### 🧋 一点甜·奶茶咖啡 · 订单 tea-2（90 mUSDC，当前状态：Completed）

| 步骤 | 区块 | 交易 | 实际转账 |
|---|---|---|---|
| 下单 | 12097892 | [`0xe57f7833…`](https://sepolia.etherscan.io/tx/0xe57f7833f9f8615e813df0c8e2f7ae7fee62fb1a23069e43238aef45bee7ed86) | （无转账，只改合约账本） |
| 付款进托管 | 12097895 | [`0x8e2de6c9…`](https://sepolia.etherscan.io/tx/0x8e2de6c9c8d00d282a1cfa9b35f6df28b149885574315413e159db98f5ab53fd) | 90：小钱包（金库） → 🧋 一点甜·奶茶咖啡 |
| 送达 | 12097939 | [`0x9c13e917…`](https://sepolia.etherscan.io/tx/0x9c13e917352627186ab22603415793c258aa28f3116e3a7ce0946b1f262259fb) | （无转账，只改合约账本） |
| 放款（托管 → 可提现） | 12098130 | [`0x3fe67fe8…`](https://sepolia.etherscan.io/tx/0x3fe67fe82fb654d42f197efd32984b8de7eefc65ae673092e003625408b8f385) | （无转账，只改合约账本） |
| 商家提现 | 12098131 | [`0x3d23b45d…`](https://sepolia.etherscan.io/tx/0x3d23b45d37c515f7045c2793e88fe86253da820073ab9ce689b6bb476ae87156) | 90：🧋 一点甜·奶茶咖啡 → 商家钱包 |

### 🧋 一点甜·奶茶咖啡 · 订单 tea-3（45 mUSDC，当前状态：Created）

| 步骤 | 区块 | 交易 | 实际转账 |
|---|---|---|---|
| 下单 | 12097897 | [`0xdfc05d7a…`](https://sepolia.etherscan.io/tx/0xdfc05d7a3cc23d7b23d3f130b7c5a34cb8f63f1d175366c8c9537624c49b0480) | （无转账，只改合约账本） |

###  小卖部·便利店 · 订单 store-1（4.5 mUSDC，当前状态：Completed）

| 步骤 | 区块 | 交易 | 实际转账 |
|---|---|---|---|
| 下单 | 12097903 | [`0x8d5c4f01…`](https://sepolia.etherscan.io/tx/0x8d5c4f0194f0622b227d8612f7db7027b2da9f1a24184427a59e183d8953eee3) | （无转账，只改合约账本） |
| 付款进托管 | 12097905 | [`0xa6b893af…`](https://sepolia.etherscan.io/tx/0xa6b893af596dfb12711687a199be0dd0612f069b06ff5ad3f5a1f34e873465aa) | 4.5：小钱包（金库） →  小卖部·便利店 |
| 送达 | 12097940 | [`0x248c03a9…`](https://sepolia.etherscan.io/tx/0x248c03a9e58638af4f7c35a5a0ab628e419b979909a030d2ec933007e7e2e3bf) | （无转账，只改合约账本） |
| 放款（托管 → 可提现） | 12098132 | [`0x2fe17e76…`](https://sepolia.etherscan.io/tx/0x2fe17e7658c936326cbe616311b2e05865b01e0b22f341079d83672c94a029ec) | （无转账，只改合约账本） |
| 商家提现 | 12098134 | [`0x32d0fba9…`](https://sepolia.etherscan.io/tx/0x32d0fba9298503c7916fcaad5c9261bcd9c6ab9c07dc2978818509f728370bb7) | 4.5： 小卖部·便利店 → 商家钱包 |

### 🍱 饭点到·家常小厨 · 订单 food-v2-1（29 mUSDC，当前状态：Refunded）

| 步骤 | 区块 | 交易 | 实际转账 |
|---|---|---|---|
| 下单 | 12089424 | [`0xc7ed4e98…`](https://sepolia.etherscan.io/tx/0xc7ed4e98b933f1b0fb5ce9f4cf465768a29eb537d037905046c5a4cb441d243a) | （无转账，只改合约账本） |
| 付款进托管 | 12089426 | [`0x74560f70…`](https://sepolia.etherscan.io/tx/0x74560f70da2ccc1e5046c8e4799fa8462442340e65014c650ef64bcaa79ce234) | 29：小钱包（金库） → 🍱 饭点到·家常小厨 |
| 退款回金库 | 12089427 | [`0xee944220…`](https://sepolia.etherscan.io/tx/0xee944220ea4b36765f5927198ccd01a6265f5dc454fcca1a43b6b81b62d7d848) | 29：🍱 饭点到·家常小厨 → 小钱包（金库） |

### 🍱 饭点到·家常小厨 · 订单 food-v2-2（29 mUSDC，当前状态：Completed）

| 步骤 | 区块 | 交易 | 实际转账 |
|---|---|---|---|
| 下单 | 12089453 | [`0x03c5f905…`](https://sepolia.etherscan.io/tx/0x03c5f9051bfdcd8aa59066d730066e4ef6c8bdc5c0054216b4975b7bf72f2579) | （无转账，只改合约账本） |
| 付款进托管 | 12089454 | [`0xd3651e32…`](https://sepolia.etherscan.io/tx/0xd3651e3221fa33a730f40328a3681c63c11da6a2caad4630e127d99e108581a2) | 29：小钱包（金库） → 🍱 饭点到·家常小厨 |
| 送达 | 12089459 | [`0x0f362d4c…`](https://sepolia.etherscan.io/tx/0x0f362d4ceb1bc96e1979e27d5f244aa2f685a9660bb9ea0fc028394ea23fbc13) | （无转账，只改合约账本） |
| 放款（托管 → 可提现） | 12089474 | [`0xee7af5a6…`](https://sepolia.etherscan.io/tx/0xee7af5a64aa5bf384649c990336ab74ac242b41e5c57aeed9aa969cfb2e41a62) | （无转账，只改合约账本） |
| 商家提现 | 12091136 | [`0xe3fc0cf2…`](https://sepolia.etherscan.io/tx/0xe3fc0cf2c3687287b86e0e0cd7d8a5ed032376c7d7a3f4a3be8bc4328e47c92c) | 29：🍱 饭点到·家常小厨 → 商家钱包 |

### 🍱 饭点到·家常小厨 · 订单 food-v2-3（29 mUSDC，当前状态：Completed）

| 步骤 | 区块 | 交易 | 实际转账 |
|---|---|---|---|
| 下单 | 12091246 | [`0x4ddc89ec…`](https://sepolia.etherscan.io/tx/0x4ddc89ecd1eb044d5e7cc81cd73d8415c133b7f8107c795108278f7d7b2de312) | （无转账，只改合约账本） |
| 付款进托管 | 12091247 | [`0xde0b6f3a…`](https://sepolia.etherscan.io/tx/0xde0b6f3ad9088f704f6a0d3096dadc6b467c542bec26c8fc86dba3fe8fa51077) | 29：小钱包（金库） → 🍱 饭点到·家常小厨 |
| 送达 | 12091252 | [`0x0b14d1c5…`](https://sepolia.etherscan.io/tx/0x0b14d1c5a52db5ee9d5b52f0c1ab39c6443c1cfe1a47de7a22cc30ec3d797d44) | （无转账，只改合约账本） |
| 放款（托管 → 可提现） | 12091268 | [`0xc27e009e…`](https://sepolia.etherscan.io/tx/0xc27e009e7e4819df1a0a133c73ecaf8426b43a6bab3d11428fc490566550dbda) | （无转账，只改合约账本） |
| 商家提现 | 12091270 | [`0x0d80c81e…`](https://sepolia.etherscan.io/tx/0x0d80c81eaab82f6294ebcbd4c92c395d4d4cd050cf77d21d1fc127c0a1a1e94d) | 29：🍱 饭点到·家常小厨 → 商家钱包 |

### 🧋 一点甜·奶茶咖啡 · 订单 tea-v2-1（90 mUSDC，当前状态：Completed）

| 步骤 | 区块 | 交易 | 实际转账 |
|---|---|---|---|
| 下单 | 12089429 | [`0x0a072d31…`](https://sepolia.etherscan.io/tx/0x0a072d31c859ad8aa0fa31a2ce615744e0e0ac2f8cedbcac165b1398e2b20bdd) | （无转账，只改合约账本） |
| 付款进托管 | 12089432 | [`0xe1bed87e…`](https://sepolia.etherscan.io/tx/0xe1bed87edf03d2f6601cdce485c53a8fd09678d6f79acfb01dc0003d3df27015) | 90：小钱包（金库） → 🧋 一点甜·奶茶咖啡 |
| 送达 | 12089437 | [`0xcd09313d…`](https://sepolia.etherscan.io/tx/0xcd09313d793d9159d8588ae37f1912e4f8c0b56be4471a663e3723c403ec05ca) | （无转账，只改合约账本） |
| 放款（托管 → 可提现） | 12089440 | [`0xe33fcdc9…`](https://sepolia.etherscan.io/tx/0xe33fcdc9ba07160bf20b9fa6b68702695e16ca1d03f58dc36fa625376768f7f5) | （无转账，只改合约账本） |
| 商家提现 | 12091137 | [`0xbcc9ee10…`](https://sepolia.etherscan.io/tx/0xbcc9ee109e630799eadc2eb3c70726c719cb23adc8a1bdc2e595cb581e699a61) | 90：🧋 一点甜·奶茶咖啡 → 商家钱包 |

### 🧋 一点甜·奶茶咖啡 · 订单 tea-v2-2（90 mUSDC，当前状态：Completed）

| 步骤 | 区块 | 交易 | 实际转账 |
|---|---|---|---|
| 下单 | 12091445 | [`0x22245905…`](https://sepolia.etherscan.io/tx/0x22245905bb86811552d7e9ae65ed1afa3d2a4b369d801df24b571de9b89bffc1) | （无转账，只改合约账本） |
| 付款进托管 | 12091452 | [`0x6804a782…`](https://sepolia.etherscan.io/tx/0x6804a782ed9902d529318f1b87a24827c813fc2229cbe607805fbb20620426c2) | 90：小钱包（金库） → 🧋 一点甜·奶茶咖啡 |
| 送达 | 12091458 | [`0xeed384c4…`](https://sepolia.etherscan.io/tx/0xeed384c45f03730d7ffcc8aac4dbf55a098dcf4d2669cafa89391a90932decd9) | （无转账，只改合约账本） |
| 放款（托管 → 可提现） | 12091475 | [`0x02171f93…`](https://sepolia.etherscan.io/tx/0x02171f937d13e59e79b4fac98c5698ac06f028340b696b1414f60a27b5d12971) | （无转账，只改合约账本） |
| 商家提现 | 12091477 | [`0x764a3e2e…`](https://sepolia.etherscan.io/tx/0x764a3e2ed196bb1c8deddb4eb6be2ce94a06bc45fefd9ca062980c043ac86efa) | 90：🧋 一点甜·奶茶咖啡 → 商家钱包 |

### 🚕 快到·打车 · 订单 ride-v2-1（85 mUSDC，当前状态：Created）

| 步骤 | 区块 | 交易 | 实际转账 |
|---|---|---|---|
| 下单 | 12091458 | [`0x4045aa0d…`](https://sepolia.etherscan.io/tx/0x4045aa0d1dcf16853a5769d00bc185625bbadcbc42d4f116f79071b8baa93298) | （无转账，只改合约账本） |

### 🔥 天天特价·首单1折 · 订单 deals-v2-1（56 mUSDC，当前状态：Created）

| 步骤 | 区块 | 交易 | 实际转账 |
|---|---|---|---|
| 下单 | 12089428 | [`0x321db316…`](https://sepolia.etherscan.io/tx/0x321db3164cb45e8ab9f5a755dd5c95a1b9c2fcbd9f8b1193aeaace57971b40e9) | （无转账，只改合约账本） |

### 🔥 天天特价·首单1折 · 订单 deals-v2-2（56 mUSDC，当前状态：Created）

| 步骤 | 区块 | 交易 | 实际转账 |
|---|---|---|---|
| 下单 | 12091152 | [`0x23bd9cea…`](https://sepolia.etherscan.io/tx/0x23bd9ceaee2dd8fe93364ee12eea3549ab11a485b4203a1729b19444259f18c7) | （无转账，只改合约账本） |

### 🔥 天天特价·首单1折 · 订单 deals-v2-3（56 mUSDC，当前状态：Created）

| 步骤 | 区块 | 交易 | 实际转账 |
|---|---|---|---|
| 下单 | 12091168 | [`0x1558c946…`](https://sepolia.etherscan.io/tx/0x1558c94698fe5484449a825c6f3cb4270f3f2840167e3977d239f133d2f9b5a1) | （无转账，只改合约账本） |

### 🔥 天天特价·首单1折 · 订单 deals-v2-4（56 mUSDC，当前状态：Created）

| 步骤 | 区块 | 交易 | 实际转账 |
|---|---|---|---|
| 下单 | 12091271 | [`0xece4ba26…`](https://sepolia.etherscan.io/tx/0xece4ba26d5300bbbde9d7734df7eaa9dddc867214b887e4ce69b0d25845f8894) | （无转账，只改合约账本） |

###  小卖部·便利店 · 订单 store-v2-1（14 mUSDC，当前状态：Completed）

| 步骤 | 区块 | 交易 | 实际转账 |
|---|---|---|---|
| 下单 | 12091358 | [`0x9dd18663…`](https://sepolia.etherscan.io/tx/0x9dd18663540fc68ea9b30afab599ac2e4e7848d6a2b358177a21d8d70b7b25c9) | （无转账，只改合约账本） |
| 付款进托管 | 12091360 | [`0x26db44c0…`](https://sepolia.etherscan.io/tx/0x26db44c05085df65882ed470d939072b95064c1580f3b47d263fd92d17ffb8ea) | 14：小钱包（金库） →  小卖部·便利店 |
| 送达 | 12091370 | [`0xb9b8bfb1…`](https://sepolia.etherscan.io/tx/0xb9b8bfb1736fc31064d68cb00365580889f6dda56c87649f401f90c072248f9b) | （无转账，只改合约账本） |
| 放款（托管 → 可提现） | 12091386 | [`0x98f120f6…`](https://sepolia.etherscan.io/tx/0x98f120f653199109e20bb7902c7c441dab93a2dfb5d2ff4408d8203944c53981) | （无转账，只改合约账本） |
| 商家提现 | 12091387 | [`0xe4a7b281…`](https://sepolia.etherscan.io/tx/0xe4a7b2815625849642689dc2124a7195f05d97baf36a98cb60c11de74dcd51ca) | 14： 小卖部·便利店 → 商家钱包 |

## 4. 订单金额核对（类似 Have / Result / As expected 的检查）

| 订单 | 订单金额（合约计算） | 金库实际转入商家合约 | 状态 | 是否一致 |
|---|---|---|---|---|
| food-1 | 29 | 29 | Refunded | ✅ |
| food-2 | 25 | 25 | Refunded | ✅ |
| food-3 | 25 | 25 | Completed | ✅ |
| food-4 | 25 | 25 | Completed | ✅ |
| food-5 | 20 | 0 | Cancelled | ❌ |
| food-6 | 22 | 22 | Completed | ✅ |
| tea-1 | 90 | 90 | Completed | ✅ |
| tea-2 | 90 | 90 | Completed | ✅ |
| tea-3 | 45 | 0 | Created（未付款） | ✅ 没有钱离开金库 |
| store-1 | 4.5 | 4.5 | Completed | ✅ |
| food-v2-1 | 29 | 29 | Refunded | ✅ |
| food-v2-2 | 29 | 29 | Completed | ✅ |
| food-v2-3 | 29 | 29 | Completed | ✅ |
| tea-v2-1 | 90 | 90 | Completed | ✅ |
| tea-v2-2 | 90 | 90 | Completed | ✅ |
| ride-v2-1 | 85 | 0 | Created（未付款） | ✅ 没有钱离开金库 |
| deals-v2-1 | 56 | 0 | Created（未付款） | ✅ 没有钱离开金库 |
| deals-v2-2 | 56 | 0 | Created（未付款） | ✅ 没有钱离开金库 |
| deals-v2-3 | 56 | 0 | Created（未付款） | ✅ 没有钱离开金库 |
| deals-v2-4 | 56 | 0 | Created（未付款） | ✅ 没有钱离开金库 |
| store-v2-1 | 14 | 14 | Completed | ✅ |

## 5. 金库审批请求（超额付款）

| # | 收款方 | 金额 | 备注 | 状态 |
|---|---|---|---|---|
| 1 | 🧋 一点甜·奶茶咖啡 | 90 | order:1 | 已批准付款 |
| 2 | 🧋 一点甜·奶茶咖啡 | 90 | order:2 | 已批准付款 |
| 3 | 🚕 快到·打车 | 85 | order:1 | 已拒绝 |
| 4 | 🧋 一点甜·奶茶咖啡 | 90 | order:1 | 已批准付款 |
| 5 | 0x861A…5bF4 | 32 | cloudeats:1 | 已批准付款 |
| 6 | 🧋 一点甜·奶茶咖啡 | 90 | order:2 | 已批准付款 |
| 7 | 🧋 一点甜·奶茶咖啡 | 45 | order:3 | 已拒绝 |

## 6. 被合约拒绝的尝试

被合约拒绝的交易不会改变任何状态、也不会产生事件，所以不出现在上面的表里。但它们作为**失败交易**留在链上：

| 时间 | 交易 | 调用 | 发给 | 链上结果 |
|---|---|---|---|---|
| 2026/11/8 23:29:12 | [`0x7ce6823a…`](https://sepolia.etherscan.io/tx/0x7ce6823a03e061364d81a7833f4c14bf53ea8a283b8d03265734c0ef966ce259) | pay | 小钱包（金库） | ❌ 被合约拒绝（revert） |
| 2026/11/8 23:32:12 | [`0x8dd4bdad…`](https://sepolia.etherscan.io/tx/0x8dd4bdad9c1920e3ea87aef6d3351ef4ef4eac83d14ffc1ebf4276fd4bd3822b) | pay | 小钱包（金库） | ❌ 被合约拒绝（revert） |
| 2026/11/8 23:53:36 | [`0x2c0e430e…`](https://sepolia.etherscan.io/tx/0x2c0e430e512d78c5b3a111f4b94c52545b5e2d4303b9f057e26dc996e3584441) | pay | 小钱包（金库） | ❌ 被合约拒绝（revert） |

其他可以核对的地方：
- AI 代理钱包的全部交易（包括标红的失败交易）：https://sepolia.etherscan.io/address/0x9Da8FA6692614E0Aadc9CabC59292A0609Ef73D1
- 诈骗店「天天特价·首单1折」合约的 mUSDC 转账记录（应该是空的）：https://sepolia.etherscan.io/token/0x18CaD1a9F7a97F73dA3EbA11779B37F045c8f42A?a=0x5d2D8BA46fb583a4942cf3A6c6f9A10b79055015
- 攻击者地址的 mUSDC 转账记录（应该是空的）：https://sepolia.etherscan.io/token/0x18CaD1a9F7a97F73dA3EbA11779B37F045c8f42A?a=0xBAd0000000000000000000000000000000000Bad
- v1 中故意上链留档的失败交易（AI 付款给攻击者 → MerchantNotAllowed）：https://sepolia.etherscan.io/tx/0x9fcaed0f12d5f0ae91eaf540c3dcc82457535083515d3268818d865dd5463d87
