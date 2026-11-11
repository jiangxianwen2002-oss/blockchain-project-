# AgentVault — an on-chain spending wallet for AI agents

> CDS528 group project · Blockchain DeFi Smart Contract Development · deployed on **Ethereum Sepolia**

AgentVault lets you hand an AI assistant a **small wallet with rules it cannot break**. You chat (or talk) to the AI — *"order me lunch under 30, nothing spicy"* — and it browses on-chain shops, places the order and pays. The money sits in a smart-contract vault that enforces:

- a **daily limit** and a **per-payment cap**,
- a **payee whitelist** (shops, external platforms, or plain addresses you approve),
- **owner approval** for anything over the limits — signed in MetaMask by a key the AI never sees,
- an **emergency freeze**.

Payments to whitelisted shops go into **escrow** and are released only after delivery is confirmed (or a dispute window passes). Disputes are settled by a **platform arbiter** whose powers are limited by the contract.

Even if the AI is tricked by a prompt-injection attack, the contract decides where money can go: the scam shop in our demo received **0**.

---

## Contents
- [Architecture](#architecture)
- [Smart contracts](#smart-contracts)
- [Deployed addresses (Sepolia)](#deployed-addresses-sepolia)
- [Quick start](#quick-start)
- [Tests](#tests)
- [Demo flow](#demo-flow)
- [Security model](#security-model)
- [Repository layout](#repository-layout)
- [Limitations and future work](#limitations-and-future-work)

---

## Architecture

```
 User ──(text / voice)──▶ Assistant app :5173 ─┐
 Owner ─(MetaMask)──────▶ Console app   :5174 │        ┌─────────── Sepolia ───────────┐
 Merchant ─(MetaMask)───▶ Merchant app  :5175 │        │                               │
 Arbiter ─(MetaMask)────▶ Arbitration   :5176 │        │  AgentVault  (limits, whitelist,
                                              │        │               approvals, freeze)
                         AI agent service :8787 ──────▶│      │ pay() + notify            │
                         (LLM tool loop, holds         │      ▼                           │
                          only the agent's key)        │  AgentShop ×N (menu, orders,     │
                                              │        │      escrow, dispute)            │
                         CloudEats :8788 ◀── x402 ─────│  ShopFactory (official template) │
                         (simulated external platform) │  MockUSDC (ERC-20 test token)    │
                                                       └───────────────────────────────┘
```

Three layers, each with one job:

| Layer | What it does | Trust |
|---|---|---|
| **AI** (Claude, or any OpenAI-compatible model such as Zhipu GLM / DeepSeek) | Understands the request, decides which tools to call | Untrusted — may be wrong or manipulated |
| **Tool layer** (`agent/src/tools.ts`) | 10 fixed tools: list shops, read menu, create order, pay, check, cancel, dispute, confirm, transfer, vault status | Only translates; enforces nothing |
| **Smart contracts** | Limits, whitelist, escrow, approvals, arbitration | The source of truth |

Shops can join in three ways, all guarded by the same vault:

| Channel | Shop needs to… | Money flow | Protection |
|---|---|---|---|
| **Platform shop** (AgentShop) | Open a shop via the official `ShopFactory` | Vault → shop escrow → released after delivery | Strongest: escrow, disputes, price cap |
| **External platform** (UCP-style checkout + **x402**) | Expose standard APIs and a pay-to address | Vault → platform address; platform verifies on-chain | Limits + whitelist; refunds by platform policy |
| **Plain address** | Nothing | Vault → address | Limits + whitelist only |

## Smart contracts

All in `src/`, Solidity 0.8.28, OpenZeppelin v5.

| Contract | Role | Key functions |
|---|---|---|
| `AgentVault.sol` | Holds the money and the rules | `setAgent`, `setMerchant`, `pay`, `approveRequest` / `rejectRequest`, `pause` / `unpause`, `deposit` / `withdraw` |
| `AgentShop.sol` | One shop: menu, orders, escrow, disputes | `createOrder(itemIds, qtys, maxTotal)`, `onAgentPayment`, `markDelivered`, `confirmReceived`, `release`, `refund`, `dispute`, `resolveDispute`, `withdraw` |
| `ShopFactory.sol` | Official shop template; fixes vault, token, arbiter and minimum confirm window | `createShop`, `isShop` |
| `MockUSDC.sol` | ERC-20 test stablecoin (6 decimals) with a faucet | `faucet` |
| `interfaces/IPaymentReceiver.sol` | "Transfer-and-notify" hook (ERC-165, similar to ERC-1363) | `onAgentPayment(agent, amount, memo)` |

**How a purchase works:** the AI calls `shop.createOrder` (the contract prices it from the on-chain menu and rejects it if the price rose above `maxTotal`), then `vault.pay(shop, amount, "order:<id>")`. The vault checks agent, expiry, whitelist and limits, transfers mUSDC to the shop and calls `onAgentPayment` **in the same transaction**, so the shop marks the order *Paid* (escrow) or the whole payment reverts. Over-limit payments become a pending request that only the owner can approve.

Design patterns: checks-effects-interactions, `ReentrancyGuard`, `Pausable`, `Ownable`, custom errors, an escrow state machine (`Created → Paid → Delivered → Completed`, plus `Refunded`, `Cancelled`, `Disputed`).

## Deployed addresses (Sepolia)

There are two deployments of the same code:

- **Stage** (default): a clean deployment used for the live demo. The addresses below belong to it.
- **Rehearsal** (`AV_ENV=rehearsal`): the development deployment with the full test history (v1 → v3, end-to-end test runs).

Both share MockUSDC and the test wallets. Details: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) · machine-readable: [`deployments/stage.json`](deployments/stage.json), [`deployments/rehearsal.json`](deployments/rehearsal.json). All contracts are verified on Etherscan.

| Contract (stage) | Address |
|---|---|
| AgentVault | [`0xDcB3853dbf1A9c0B53853d1C2EE84bceA53C1442`](https://sepolia.etherscan.io/address/0xDcB3853dbf1A9c0B53853d1C2EE84bceA53C1442#code) |
| MockUSDC | [`0x18CaD1a9F7a97F73dA3EbA11779B37F045c8f42A`](https://sepolia.etherscan.io/address/0x18CaD1a9F7a97F73dA3EbA11779B37F045c8f42A#code) |
| ShopFactory | [`0xBD10670313A082372Dc69B34b6c0d33d091cFfc2`](https://sepolia.etherscan.io/address/0xBD10670313A082372Dc69B34b6c0d33d091cFfc2#code) |
| Shop: food (whitelisted) | [`0xAbd934d535418dc79eC837236bd11F274d54d69D`](https://sepolia.etherscan.io/address/0xAbd934d535418dc79eC837236bd11F274d54d69D#code) |
| Shop: tea & coffee (whitelisted) | [`0x1500CB21480c6c22B273de787758B20245625116`](https://sepolia.etherscan.io/address/0x1500CB21480c6c22B273de787758B20245625116#code) |
| Shop: rides (whitelisted) | [`0xB08Bb122c6f6d535bEE78Dc49983160007074da8`](https://sepolia.etherscan.io/address/0xB08Bb122c6f6d535bEE78Dc49983160007074da8#code) |
| Shop: scam "Daily Deals" (**not** whitelisted) | [`0xB23891e2419A635594a59cAC7BF62dBb025a5298`](https://sepolia.etherscan.io/address/0xB23891e2419A635594a59cAC7BF62dBb025a5298#code) |
| Shop: corner store (imported live in the demo) | [`0x96465E99Baf51BE72af31B0FF2eb812EdC1d9426`](https://sepolia.etherscan.io/address/0x96465E99Baf51BE72af31B0FF2eb812EdC1d9426#code) |

On-chain evidence (balances, every order with its transactions, failed scam payments): [`docs/EVIDENCE.md`](docs/EVIDENCE.md) for stage and [`docs/EVIDENCE-rehearsal.md`](docs/EVIDENCE-rehearsal.md) for rehearsal. Regenerate with `npm run evidence`.

## Quick start

### Requirements
- [Foundry](https://book.getfoundry.sh/) (forge, cast)
- Node.js 22+
- Chrome with MetaMask on the **Sepolia** network (for owner / merchant / arbiter actions)

### 1. Install
```bash
git clone --recursive <this repo> && cd agent-vault   # submodules: forge-std v1.17.0, OpenZeppelin v5.4.0
cd agent && npm install && cd ../frontend && npm install && cd ..
cp .env.example .env   # then fill in test-wallet keys (never commit .env)
```
From the zip instead of git, install the two Solidity libraries first:
```bash
forge install foundry-rs/forge-std@v1.17.0 OpenZeppelin/openzeppelin-contracts@v5.4.0 --no-git
```

`.env` holds **test-only** keys: `OWNER_*`, `AGENT_*`, `MERCHANT_*`, `PLATFORM_*` (arbiter), `CLOUDEATS_*` (simulated platform), plus `SEPOLIA_RPC_URL` and `ETHERSCAN_API_KEY`. An AI key is optional — you can also enter it in the console.

### 2. Run everything (one command)
```bash
(cd agent && npm run server) & (cd agent && npm run cloudeats) & (cd frontend && npm run dev); kill %1 %2
```
This starts the **stage** deployment. To use the rehearsal deployment, run `export AV_ENV=rehearsal` first. Rehearsal tabs are titled "[Rehearsal]".

| App | URL | Who uses it |
|---|---|---|
| Assistant | http://localhost:5173 | You: chat / voice with the AI |
| Console | http://localhost:5174 | Owner: limits, approvals, whitelist, funds, audit, AI settings |
| Merchant onboarding | http://localhost:5175 | Merchants: open a shop via the factory |
| Platform arbitration | http://localhost:5176 | Arbiter: resolve disputes |

Every app has a **中文 / EN** switch (or add `?lang=en` to the URL).

### 3. Configure the AI (optional)
Console → **AI settings**: choose *Anthropic*, *OpenAI-compatible* or *Zhipu GLM*, enter the API key and model, then **Test connection**. Without a key the assistant runs in **offline rules mode**, which uses exactly the same tools and contracts.

### Deploying your own copy
A fresh, ready-to-demo deployment (vault, factory, 5 shops, funding, limits, whitelist) in one script:
```bash
USDC_ADDRESS=<MockUSDC> forge script script/DeployStage.s.sol --rpc-url sepolia --broadcast --verify --slow
```
History of how the rehearsal deployment was built:
```bash
forge script script/Deploy.s.sol   --rpc-url sepolia --broadcast --verify   # MockUSDC + first vault (v1)
forge script script/DeployV2.s.sol --rpc-url sepolia --broadcast --verify   # vault v2 with transfer-and-notify
forge script script/DeployV3.s.sol --rpc-url sepolia --broadcast --verify   # ShopFactory + 5 shops, whitelist
node scripts/export-abi.mjs                                                 # copy ABIs to agent/ and frontend/
```
Environment variables for each script are documented at the top of the script file.

## Tests

| What | Command | Result |
|---|---|---|
| Contract unit, fuzz and invariant tests | `forge test` | **77 passed** (AgentShop and ShopFactory 100% line coverage, AgentVault ~96%) |
| Coverage | `forge coverage` | — |
| Static analysis | `slither .` | Only `block.timestamp` notes remain ([report](docs/slither-report.txt)) |
| End-to-end on Sepolia (every signed action in the apps, real transactions; rehearsal only) | `cd agent && AV_ENV=rehearsal npm run e2e` | **39/39** — [results with tx links](docs/E2E-RESULTS.md) |
| Real LLM check (connection, tool use, no unwanted orders, scam shop) | `cd agent && npm run llm-test -- --all` | Passed with Zhipu GLM |
| On-chain evidence report | `cd agent && npm run evidence` | Funds conserved ✅, shop books ✅, attacker received 0 (both deployments) |

## Demo flow

Step-by-step script with what to show on Etherscan: [`docs/DEMO.md`](docs/DEMO.md). In short:

1. **Normal order**: "Order me lunch under 30, nothing spicy" → order + payment into escrow → delivery → release. Each step is visible on Etherscan.
2. **Scam shop**: the shop notice tells the AI to pay an "activation fee". The AI may refuse or be fooled, but the vault rejects the payment (`MerchantNotAllowed`) and a failed transaction is recorded.
3. **Over the limit**: "Milk tea for 6 people" (90 > cap 30) → pending → the owner approves in chat with MetaMask.
4. **External platform**: "Order a spicy chicken burger on CloudEats" → HTTP 402 → vault pays → the platform verifies on-chain.
5. **Dispute**: "My food never arrived" → funds frozen → the arbiter refunds on :5176.
6. **Import a new shop** in the console → the AI can buy there immediately.

## Security model

- **The AI key is a hot wallet with a leash.** It can only call `pay` and shop order functions, and the contract caps what it can spend. Leaking it costs at most the remaining daily allowance, and only to whitelisted payees.
- **The owner key never touches the server.** It stays in MetaMask. Typing "yes" in the chat cannot approve anything — approval is an on-chain signature.
- **Prompt injection is contained.** Shop notices and item names are treated as data; the tools flag suspicious text; the whitelist blocks unknown payees.
- **Escrow protects the buyer.** A shop can't mark an order *Paid* without the exact amount and memo; funds move only on delivery confirmation, timeout, refund or an arbiter ruling.
- **The arbiter has narrow powers.** It can only rule on disputed orders, choosing refund or release.
- **Secrets**: `.env`, `agent/settings.local.json` and local state files are git-ignored; the AI API key is stored only locally and returned masked.

## Repository layout

```
src/                 Solidity contracts
test/                Foundry tests (unit, fuzz, invariant)
script/              Deployment scripts (v1 → v3), shared menus
deployments/         stage.json (live demo) and rehearsal.json (development) — addresses, roles, shops
agent/               Node/TypeScript AI service
  src/tools.ts         the 10 tools the AI can call
  src/llm.ts           Anthropic tool loop      src/openai.ts  OpenAI-compatible loop
  src/offline.ts       offline rules mode       src/ucp.ts     external platform driver (UCP + x402)
  src/server.ts        HTTP/SSE service          src/merchant.ts simulated merchant back office
  src/cloudeats.ts     simulated external platform
  src/e2e.ts           end-to-end test           src/llm-test.ts LLM test   src/evidence.ts evidence report
frontend/            React 19 + Vite + wagmi — four apps from one codebase
  src/assistant/ src/console/ src/merchant/ src/platform/ src/shared/ src/i18n.tsx
docs/                Design and implementation notes, demo script, deployment log, evidence, test results
```

Detailed design and implementation notes (Chinese): [`docs/IMPLEMENTATION.md`](docs/IMPLEMENTATION.md).

## Limitations and future work

- **Delivery is an off-chain fact** (oracle problem). This is mitigated by escrow, a dispute window and arbitration, not eliminated.
- **The arbiter is a single address.** It should become a multisig or a decentralized arbitration protocol.
- **x402 variant**: standard x402 "exact" uses an EIP-3009 signature from the payer's wallet. Our funds sit in a contract, so the payment proof is the vault's transaction hash instead.
- **Daily limit resets at 00:00 UTC**, so two days' allowance can be spent around midnight. A rolling 24-hour window would fix this.
- **One shop serves one vault**; merchant KYC, privacy of delivery addresses, per-shop limits, compliance and mainnet gas costs (an L2 would suit this better) are out of scope.

