# 链上证据报告（自动生成）

> 由 `npm run evidence` 在 2026-11-09T14:45:45.331Z 生成，读取的是 Sepolia **区块 #12098202** 时的链上状态。
> 所有数据都直接来自链上（合约状态、事件、交易回执），不依赖本地记录。每个地址和交易都附 Etherscan 链接，可以逐条核对。

## 1. 合约地址（已在 Etherscan 验证源码）

| 合约 | 地址 | 源码 |
|---|---|---|
| AgentVault（金库） | `0xDcB3853dbf1A9c0B53853d1C2EE84bceA53C1442` | [查看已验证源码](https://sepolia.etherscan.io/address/0xDcB3853dbf1A9c0B53853d1C2EE84bceA53C1442#code) |
| MockUSDC（测试稳定币） | `0x18CaD1a9F7a97F73dA3EbA11779B37F045c8f42A` | [查看已验证源码](https://sepolia.etherscan.io/address/0x18CaD1a9F7a97F73dA3EbA11779B37F045c8f42A#code) |
| AgentShop 🍱 饭点到·家常小厨（白名单：✅） | `0xAbd934d535418dc79eC837236bd11F274d54d69D` | [查看已验证源码](https://sepolia.etherscan.io/address/0xAbd934d535418dc79eC837236bd11F274d54d69D#code) |
| AgentShop 🧋 一点甜·奶茶咖啡（白名单：✅） | `0x1500CB21480c6c22B273de787758B20245625116` | [查看已验证源码](https://sepolia.etherscan.io/address/0x1500CB21480c6c22B273de787758B20245625116#code) |
| AgentShop 🚕 快到·打车（白名单：✅） | `0xB08Bb122c6f6d535bEE78Dc49983160007074da8` | [查看已验证源码](https://sepolia.etherscan.io/address/0xB08Bb122c6f6d535bEE78Dc49983160007074da8#code) |
| AgentShop 🔥 天天特价·首单1折（白名单：❌） | `0xB23891e2419A635594a59cAC7BF62dBb025a5298` | [查看已验证源码](https://sepolia.etherscan.io/address/0xB23891e2419A635594a59cAC7BF62dBb025a5298#code) |
| AgentShop  小卖部·便利店（白名单：❌） | `0x96465E99Baf51BE72af31B0FF2eb812EdC1d9426` | [查看已验证源码](https://sepolia.etherscan.io/address/0x96465E99Baf51BE72af31B0FF2eb812EdC1d9426#code) |

## 2. 余额对账：钱现在在哪里

| 地址 | 链上 mUSDC 余额 | 托管中 | 可提现 | 校验 |
|---|---|---|---|---|
| [小钱包（金库）](https://sepolia.etherscan.io/token/0x18CaD1a9F7a97F73dA3EbA11779B37F045c8f42A?a=0xDcB3853dbf1A9c0B53853d1C2EE84bceA53C1442) | **500** | — | — | AI 能动用的钱 |
| [🍱 饭点到·家常小厨](https://sepolia.etherscan.io/token/0x18CaD1a9F7a97F73dA3EbA11779B37F045c8f42A?a=0xAbd934d535418dc79eC837236bd11F274d54d69D) | **0** | 0 | 0 | ✅ 余额 = 托管 + 可提现 |
| [🧋 一点甜·奶茶咖啡](https://sepolia.etherscan.io/token/0x18CaD1a9F7a97F73dA3EbA11779B37F045c8f42A?a=0x1500CB21480c6c22B273de787758B20245625116) | **0** | 0 | 0 | ✅ 余额 = 托管 + 可提现 |
| [🚕 快到·打车](https://sepolia.etherscan.io/token/0x18CaD1a9F7a97F73dA3EbA11779B37F045c8f42A?a=0xB08Bb122c6f6d535bEE78Dc49983160007074da8) | **0** | 0 | 0 | ✅ 余额 = 托管 + 可提现 |
| [🔥 天天特价·首单1折](https://sepolia.etherscan.io/token/0x18CaD1a9F7a97F73dA3EbA11779B37F045c8f42A?a=0xB23891e2419A635594a59cAC7BF62dBb025a5298) | **0** | 0 | 0 | ✅ 余额 = 托管 + 可提现 |
| [ 小卖部·便利店](https://sepolia.etherscan.io/token/0x18CaD1a9F7a97F73dA3EbA11779B37F045c8f42A?a=0x96465E99Baf51BE72af31B0FF2eb812EdC1d9426) | **0** | 0 | 0 | ✅ 余额 = 托管 + 可提现 |
| [商家钱包](https://sepolia.etherscan.io/token/0x18CaD1a9F7a97F73dA3EbA11779B37F045c8f42A?a=0x1Cb9CEB6B28866803E97C74a1c3055630D0143dc) | **0** | — | — | 从本环境商家合约提现的总额 |
| [云间外卖 CloudEats（外部平台收款地址）](https://sepolia.etherscan.io/token/0x18CaD1a9F7a97F73dA3EbA11779B37F045c8f42A?a=0x861A5564efB8CF5468A41696dDA537288B125bF4) | **0** | — | — | 金库付给平台的 − 平台退回的（x402） |
| [攻击者地址](https://sepolia.etherscan.io/token/0x18CaD1a9F7a97F73dA3EbA11779B37F045c8f42A?a=0xBAd0000000000000000000000000000000000Bad) | **0** | — | — | ✅ 一分没收到 |
| **合计**（金库 + 商家合约 + 商家钱包 + 外部平台 + 普通地址） | **500** | | | 付款 / 退款 / 放款 / 提现只在这些地址之间移动 |

**资金守恒检查**：金库累计存入 500 − 主人取出 0 = 500；当前合计 500 → ✅ 一分不差

**商家合约账本检查**：✅ 每个商家合约的 mUSDC 余额都等于 托管中 + 可提现

## 3. 每个订单的链上记录

每一行是一笔真实的链上交易；“实际转账”一列是从交易回执里解码出来的 mUSDC Transfer 事件。

## 4. 订单金额核对（类似 Have / Result / As expected 的检查）

| 订单 | 订单金额（合约计算） | 金库实际转入商家合约 | 状态 | 是否一致 |
|---|---|---|---|---|

## 5. 金库审批请求（超额付款）

| # | 收款方 | 金额 | 备注 | 状态 |
|---|---|---|---|---|

## 6. 被合约拒绝的尝试

被合约拒绝的交易不会改变任何状态、也不会产生事件，所以不出现在上面的表里。但它们作为**失败交易**留在链上：

其他可以核对的地方：
- AI 代理钱包的全部交易（包括标红的失败交易）：https://sepolia.etherscan.io/address/0x9Da8FA6692614E0Aadc9CabC59292A0609Ef73D1
- 诈骗店「天天特价·首单1折」合约的 mUSDC 转账记录（应该是空的）：https://sepolia.etherscan.io/token/0x18CaD1a9F7a97F73dA3EbA11779B37F045c8f42A?a=0xB23891e2419A635594a59cAC7BF62dBb025a5298
- 攻击者地址的 mUSDC 转账记录（应该是空的）：https://sepolia.etherscan.io/token/0x18CaD1a9F7a97F73dA3EbA11779B37F045c8f42A?a=0xBAd0000000000000000000000000000000000Bad
- v1 中故意上链留档的失败交易（AI 付款给攻击者 → MerchantNotAllowed）：https://sepolia.etherscan.io/tx/0x9fcaed0f12d5f0ae91eaf540c3dcc82457535083515d3268818d865dd5463d87
