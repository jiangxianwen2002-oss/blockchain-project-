import { createConfig, http } from "wagmi";
import { sepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors/injected";
import { formatUnits, getAddress, parseUnits, type Address } from "viem";
// 当前环境的部署信息：由 vite.config.ts 按 AV_ENV 指向 deployments/stage.json 或 rehearsal.json
import raw from "@deployment";
import { locale, t, tn } from "./i18n";

export const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [injected()],
  transports: { [sepolia.id]: http("https://ethereum-sepolia-rpc.publicnode.com") },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}

export const dep = {
  ...raw,
  contracts: { AgentVault: raw.contracts.AgentVault as Address, MockUSDC: raw.contracts.MockUSDC as Address },
  roles: { owner: raw.roles.owner as Address, agent: raw.roles.agent as Address, merchant: raw.roles.merchant as Address },
  merchants: raw.merchants.map((m) => ({ ...m, address: m.address as Address })),
  /** 不在白名单里的店（演示用的诈骗店） */
  untrustedShops: raw.untrustedShops.map((m) => ({ ...m, address: m.address as Address })),
  attacker: getAddress(raw.attacker.toLowerCase()),
  deployBlock: BigInt(raw.deployBlock),
};

/** 一家店。白名单状态、店名、店主来自链上（useShops）；图标、分类是部署配置里的可选展示信息 */
export type Shop = {
  id: string;
  name: string;
  emoji: string;
  category: string;
  eta: string;
  address: Address;
  /** 部署配置里登记过的正规店 */
  trusted: boolean;
  /** 部署配置里标记为可疑（演示用的诈骗店） */
  flagged?: boolean;
  /** 已停用的旧版商家合约 */
  legacy?: boolean;
  owner?: Address;
  description?: string;
};

// 商家注册表：先用部署配置填充，useShops() 从链上刷新后原地更新（保证 labelOf / shopById 这类同步函数也能用到最新数据）
export const allShops: Shop[] = [
  ...dep.merchants.map((m) => ({ ...m, trusted: true })),
  ...dep.untrustedShops.map((m) => ({ ...m, trusted: false, flagged: true })),
  ...raw.otherShops.map((m) => ({ ...m, address: m.address as Address, trusted: false })),
  ...raw.legacyShops.map((m) => ({ ...m, address: m.address as Address, trusted: false, legacy: true })),
];
export function setShops(list: Shop[]) {
  allShops.splice(0, allShops.length, ...list);
}
export const shopById = (id: string) => allShops.find((s) => s.id === id);
export const shopByAddress = (a: string) => allShops.find((s) => s.address.toLowerCase() === a.toLowerCase());
/** 部署配置里登记的展示信息 */
export const knownShop = (a: string) =>
  [
    ...dep.merchants.map((m) => ({ ...m, flagged: false, legacy: false })),
    ...dep.untrustedShops.map((m) => ({ ...m, flagged: true, legacy: false })),
    ...raw.otherShops.map((m) => ({ ...m, flagged: false, legacy: false })),
    ...raw.legacyShops.map((m) => ({ ...m, flagged: false, legacy: true })),
  ].find(
    (m) => m.address.toLowerCase() === a.toLowerCase(),
  );

/** 外部平台（UCP 风格结账 + x402 付款）：白名单里登记的是平台的收款地址 */
export const externalPlatforms = (raw.externalPlatforms ?? []).map((p) => ({ ...p, payTo: p.payTo as Address }));
export const FACTORY = raw.contracts.ShopFactory as Address;

export const VAULT = dep.contracts.AgentVault;
export const USDC = dep.contracts.MockUSDC;
export const EXPLORER = "https://sepolia.etherscan.io";

export const fmt = (v: bigint | undefined) =>
  v === undefined ? "—" : Number(formatUnits(v, 6)).toLocaleString(locale, { maximumFractionDigits: 2 });
export const toUnits = (s: string) => parseUnits(s || "0", 6);
export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** 地址 → 人能看懂的名字 */
export function labelOf(addr: string): string {
  const a = addr.toLowerCase();
  const m = allShops.find((x) => x.address.toLowerCase() === a);
  if (m) return tn(m.name);
  const old = raw.legacyMerchants.find((x) => x.address.toLowerCase() === a);
  if (old) return tn(`${old.name}（旧商家）`);
  const ext = externalPlatforms.find((x) => x.payTo.toLowerCase() === a);
  if (ext) return tn(ext.name);
  if (a === dep.contracts.AgentVault.toLowerCase()) return t("钱包（金库合约）", "Wallet (vault contract)");
  if (a === dep.roles.owner.toLowerCase()) return t("金库主人", "Vault owner");
  if (a === dep.roles.agent.toLowerCase()) return t("AI 代理", "AI agent");
  if (a === dep.roles.merchant.toLowerCase()) return t("商家钱包", "Merchant wallet");
  if (a === dep.attacker.toLowerCase()) return t("攻击者", "Attacker");
  return short(addr);
}
