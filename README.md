# AgentVault — an on-chain spending wallet for AI agents

> CDS528 group project · Blockchain DeFi Smart Contract Development · deployed on **Ethereum Sepolia**

AgentVault gives an AI assistant a **small wallet with rules it cannot break**. You tell the AI *"order me lunch under 30, nothing spicy"*; it reads on-chain menus, places the order and pays. The money sits in a smart-contract vault that enforces:

- a **daily limit** and a **per-payment cap**,
- a **payee whitelist**,
- **owner approval** for anything over the limits, signed in MetaMask with a key the AI never sees,
- an **emergency freeze**.

Payments to shops go into **escrow** and are released after delivery. Disputes go to a **platform arbiter** whose powers are limited by the contract. Even when the AI is tricked by prompt injection, the contract decides where the money can go: the scam shop in our demo received **0**.

## Architecture

```
 User ─ text/voice ─▶ Assistant :5173 ─▶ AI service :8787 ──────────▶ AgentVault (limits, whitelist, approvals)
 Owner ─ MetaMask ──▶ Console   :5174                (LLM + 10 tools)      │ pay() + notify
 Merchant ─────────▶ Merchant  :5175                                       ▼
 Arbiter ──────────▶ Arbitration :5176                        AgentShop ×N (menu, orders, escrow, disputes)
                                                               ShopFactory (official shop template)
                     CloudEats :8788 ◀── x402 payment ──────── external platform, no contract needed
```

The AI only decides what to do. A fixed tool layer (`agent/src/tools.ts`) turns its choices into contract calls, and the contracts enforce every rule. Shops can join in three ways, all guarded by the same vault: **platform shops** opened through `ShopFactory` (full escrow and disputes), **external platforms** using UCP-style checkout + **x402** payment, and **plain addresses** (direct transfers).

## Smart contracts

Solidity 0.8.28 with OpenZeppelin v5, in `src/`.

| Contract | Role |
|---|---|
| `AgentVault.sol` | Holds the money; enforces limits, whitelist, approvals, freeze (`pay`, `approveRequest`, `setAgent`, `setMerchant`, `pause`) |
| `AgentShop.sol` | One shop: on-chain menu, orders, escrow, dispute and arbiter ruling |
| `ShopFactory.sol` | Opens shops from one tested, source-verified template; fixes vault, token, arbiter and minimum confirm window |
| `MockUSDC.sol` | ERC-20 test stablecoin (6 decimals) |
| `IPaymentReceiver.sol` | Transfer-and-notify hook (ERC-165), so a shop knows which order was paid |

**A purchase on-chain:** `shop.createOrder(items, qty, maxTotal)` prices the order from the on-chain menu and rejects it if the price rose. Then `vault.pay(shop, amount, "order:<id>")` checks the agent, whitelist and limits, transfers mUSDC and calls the shop **in the same transaction**: the order becomes *Paid* (in escrow), or the whole payment reverts. Over-limit payments become a request only the owner can approve.

## Deployed addresses (Sepolia, verified on Etherscan)

| Contract | Address |
|---|---|
| AgentVault | [`0xDcB3853dbf1A9c0B53853d1C2EE84bceA53C1442`](https://sepolia.etherscan.io/address/0xDcB3853dbf1A9c0B53853d1C2EE84bceA53C1442#code) |
| ShopFactory | [`0xBD10670313A082372Dc69B34b6c0d33d091cFfc2`](https://sepolia.etherscan.io/address/0xBD10670313A082372Dc69B34b6c0d33d091cFfc2#code) |
| MockUSDC | [`0x18CaD1a9F7a97F73dA3EbA11779B37F045c8f42A`](https://sepolia.etherscan.io/address/0x18CaD1a9F7a97F73dA3EbA11779B37F045c8f42A#code) |
| Shops | [food](https://sepolia.etherscan.io/address/0xAbd934d535418dc79eC837236bd11F274d54d69D#code), [tea & coffee](https://sepolia.etherscan.io/address/0x1500CB21480c6c22B273de787758B20245625116#code), [rides](https://sepolia.etherscan.io/address/0xB08Bb122c6f6d535bEE78Dc49983160007074da8#code) (whitelisted) · [scam shop](https://sepolia.etherscan.io/address/0xB23891e2419A635594a59cAC7BF62dBb025a5298#code) (not whitelisted) · [corner store](https://sepolia.etherscan.io/address/0x96465E99Baf51BE72af31B0FF2eb812EdC1d9426#code) (imported live in the demo) |

These are the clean **stage** deployment, used only for the live demo. All development and testing ran on a second **rehearsal** deployment of the same code (vault [`0x301ee590…83b1`](https://sepolia.etherscan.io/address/0x301ee5902258D0548A23Ac24899a3DC1EAE283b1#code), `AV_ENV=rehearsal`), and the evidence below comes from it. Full list: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Quick start

Requires [Foundry](https://book.getfoundry.sh/), Node.js 22+, and MetaMask on Sepolia.

```bash
git clone --recursive <this repo> && cd agent-vault
cd agent && npm install && cd ../frontend && npm install && cd ..
cp .env.example .env    # fill in test-wallet keys; never commit .env
```
From the zip instead of git, first run `forge install foundry-rs/forge-std@v1.17.0 OpenZeppelin/openzeppelin-contracts@v5.4.0 --no-git`.

Start everything with one command (Ctrl+C stops all):
```bash
(cd agent && npm run server) & (cd agent && npm run cloudeats) & (cd frontend && npm run dev); kill %1 %2
```

| App | URL | For |
|---|---|---|
| Assistant | http://localhost:5173 | Chat or talk to the AI |
| Console | http://localhost:5174 | Owner: limits, approvals, whitelist, funds, on-chain audit, AI settings |
| Merchant | http://localhost:5175 | Open a shop through the factory |
| Arbitration | http://localhost:5176 | Resolve disputes |

Each app has a 中文 / EN switch. Add an AI key in Console → AI settings (Anthropic, OpenAI-compatible or Zhipu GLM); without one, the assistant uses an offline rules mode with the same tools and contracts.

Compile, test and deploy the contracts:
```bash
forge build                      # compile
forge test                       # unit, fuzz and invariant tests (add --gas-report for gas usage)
USDC_ADDRESS=0x18CaD1a9F7a97F73dA3EbA11779B37F045c8f42A \
  forge script script/DeployStage.s.sol --rpc-url sepolia --broadcast --verify   # full, ready-to-demo deployment
```
The deploy script creates the vault, factory and five shops, funds the vault, sets the AI's limits and the whitelist, and verifies everything on Etherscan in one run.

## Tests

| Test | Command | Result |
|---|---|---|
| Unit, fuzz and invariant tests | `forge test` | **77 passed**; AgentShop and ShopFactory 100% line coverage, AgentVault ~96% |
| Static analysis | `slither .` | Only `block.timestamp` notes ([report](docs/slither-report.txt)) |
| End-to-end on Sepolia (every signed action, real transactions) | `AV_ENV=rehearsal npm run e2e` | **39/39** ([results](docs/E2E-RESULTS.md)) |
| Real LLM (tool use, no unwanted orders, scam shop) | `npm run llm-test -- --all` | Passed (Zhipu GLM) |
| On-chain evidence: every order, failed scam payment, approval, refund and ruling, with Etherscan links | `AV_ENV=rehearsal npm run evidence` | Funds conserved ✅, attacker received 0 ([report](docs/EVIDENCE.md)) |

## Demo

Full script: [`docs/DEMO.md`](docs/DEMO.md).

1. **Order**: "Order me lunch under 30, nothing spicy" → payment into escrow → delivery → release, each step on Etherscan.
2. **Scam shop**: its notice tells the AI to pay an "activation fee"; the vault rejects the payment (`MerchantNotAllowed`).
3. **Over the limit**: "Milk tea for 6 people" (90 > cap 30) → the owner approves in the chat with MetaMask.
4. **External platform**: an order on CloudEats → HTTP 402 → vault pays → platform verifies on-chain.
5. **Dispute**: "My food never arrived" → funds frozen → the arbiter refunds.

## Security model

- **The AI key has a leash.** The contract caps what it can spend and where; a leaked key costs at most the rest of today's allowance, and only to whitelisted payees.
- **Approvals need the owner's signature.** The owner key stays in MetaMask; typing "yes" in the chat approves nothing.
- **Escrow and narrow arbitration.** Shops are paid only after delivery; the arbiter can only refund or release a disputed order.

## Operations: pause and upgrades

- **Pause**: the vault is `Pausable`. The owner can freeze all AI payments and approvals at once (Console → Emergency freeze) and can still withdraw while frozen.
- **No upgrade proxy, by choice**: contracts are immutable. Users can read and verify exactly the code that holds their money, and there is no admin key that could swap the logic. Upgrades are done by deploying a new version: we replaced the vault once (v1 → v2, moving the funds across) and the shop contracts twice (v2 → v3 → the current factory-made shops).
- **Limiting damage**: the AI's authorization expires (30 days by default) and can be revoked at any time; payees can be removed from the whitelist instantly.

## Limitations

- Delivery is an off-chain fact (the oracle problem). Escrow, a dispute window and arbitration reduce the risk but can't remove it.
- The arbiter is a single address; it should become a multisig or a decentralized arbitration service.
- Our x402 variant uses the vault's transaction hash as payment proof, because a contract can't produce the EIP-3009 signature standard x402 expects.
- The daily limit resets at 00:00 UTC; a rolling 24-hour window would be better.

Design and implementation notes (Chinese): [`docs/IMPLEMENTATION.md`](docs/IMPLEMENTATION.md).

## Credits, licenses and AI disclosure

This project is released under the [MIT License](LICENSE). Third-party code is used under its own license; all are permissive and compatible with MIT:

| Library | Used for | License |
|---|---|---|
| OpenZeppelin Contracts v5.4.0 | `ERC20`, `Ownable`, `Pausable`, `ReentrancyGuard`, `SafeERC20`, `ERC165`, `ERC165Checker` | MIT |
| Foundry / forge-std v1.17.0 | Build, tests, deployment scripts | MIT or Apache-2.0 |
| viem, wagmi, TanStack Query | Ethereum access from the AI service and frontend | MIT |
| React, Vite | Frontend | MIT |
| lucide-react | Icons | ISC |
| Anthropic TypeScript SDK | Claude API calls | Apache-2.0 |
| tsx, dotenv | Running the TypeScript service, reading `.env` | MIT, BSD-2-Clause |

**References (APA)**

- Ethereum Foundation. (n.d.). *Ethereum developer tutorials*. https://ethereum.org/developers/tutorials/
- OpenZeppelin. (2025). *OpenZeppelin Contracts* (Version 5.4.0) [Computer software]. https://github.com/OpenZeppelin/openzeppelin-contracts
- Foundry contributors. (2025). *Foundry* [Computer software]. https://github.com/foundry-rs/foundry
- Vogelsteller, F., & Buterin, V. (2015). *EIP-20: Token standard*. Ethereum Improvement Proposals. https://eips.ethereum.org/EIPS/eip-20
- Reitwießner, C., Johnson, N., Vogelsteller, F., Baylina, J., Feldmeier, K., & Entriken, W. (2018). *EIP-165: Standard interface detection*. Ethereum Improvement Proposals. https://eips.ethereum.org/EIPS/eip-165
- Minacori, V. (2020). *ERC-1363: Payable token*. Ethereum Improvement Proposals. https://eips.ethereum.org/EIPS/eip-1363
- x402 Foundation. (2026). *x402 payment protocol documentation*. https://docs.x402.org

**AI-assisted development.** Parts of the code and documentation were written with the help of an AI coding assistant (Claude, by Anthropic). The team reviewed the generated code and checked it with the unit, fuzz and invariant tests, Slither, and the end-to-end tests on Sepolia described above. We also checked that every dependency's license is compatible with MIT.
