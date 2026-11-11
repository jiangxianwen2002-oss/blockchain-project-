// 读取 .env（项目根目录）和部署信息（deployments/<环境>.json）
// 两套环境：stage（正式演示，默认）和 rehearsal（练习，有大量测试记录），用环境变量 AV_ENV 切换
import { config as loadEnv } from "dotenv";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { getAddress, type Address, type Hex } from "viem";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, "../..");

loadEnv({ path: path.join(ROOT, ".env"), quiet: true });

/** 一家店。白名单状态、店名、店主来自链上（见 registry.ts）；图标、分类、送达时间是本地的可选展示信息 */
export interface Merchant {
  id: string;
  name: string;
  emoji: string;
  category: string;
  /** AgentShop 合约地址 */
  address: Address;
  eta: string;
  /** 当前是否在金库白名单里（链上状态） */
  allowed?: boolean;
  /** 店主地址（链上） */
  owner?: Address;
  /** 部署配置里标记为可疑的店（演示用的诈骗店） */
  flagged?: boolean;
  /** 已停用的旧版商家合约（v2）：只用于显示历史订单和对账 */
  legacy?: boolean;
  /** 由官方开店工厂 ShopFactory 创建（代码是官方模板） */
  official?: boolean;
  /** 商家类型：onchain = 链上商家合约 AgentShop（默认）；ucp = 外部平台（UCP 风格结账 + x402 付款），address 是平台的收款地址 */
  kind?: "onchain" | "ucp";
  /** 外部平台的接口地址 */
  endpoint?: string;
  /** 外部平台使用的协议 */
  protocol?: string;
}

interface Deployment {
  chainId: number;
  contracts: { AgentVault: Address; MockUSDC: Address; ShopFactory: Address };
  roles: { owner: Address; agent: Address; merchant: Address; platform: Address };
  confirmWindowSeconds: number;
  /** 主人加入白名单的商家 */
  merchants: Merchant[];
  /** 不在白名单里的店（比如诈骗店）。商家服务照样能访问它们，但合约不允许付钱给它们 */
  untrustedShops: Merchant[];
  /** 已经开好、但还没加入白名单的店（演示时现场导入） */
  otherShops: Merchant[];
  /** 已停用的旧版商家合约 */
  legacyShops: Merchant[];
  /** 早期版本用过的商家，只用于显示历史记录 */
  legacyMerchants: { id: string; name: string; address: Address }[];
  attacker: Address;
  deployBlock: number;
}

/** 当前环境：正式演示 stage（默认）/ 练习 rehearsal */
export const AV_ENV: "stage" | "rehearsal" = process.env.AV_ENV === "rehearsal" ? "rehearsal" : "stage";
export const deployment: Deployment = JSON.parse(readFileSync(path.join(ROOT, `deployments/${AV_ENV}.json`), "utf8"));
// 统一转成标准校验格式（EIP-55），避免手写地址大小写不规范
deployment.attacker = getAddress(deployment.attacker.toLowerCase());

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`缺少环境变量 ${name}，请在项目根目录的 .env 中填写`);
  return v;
}

export const env = {
  rpcUrl: process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
  agentKey: () => need("AGENT_PRIVATE_KEY") as Hex,
  ownerKey: () => need("OWNER_PRIVATE_KEY") as Hex,
  merchantKey: () => need("MERCHANT_PRIVATE_KEY") as Hex,
  platformKey: () => need("PLATFORM_PRIVATE_KEY") as Hex,
  hasMerchantKey: () => Boolean(process.env.MERCHANT_PRIVATE_KEY),
  hasLLM: () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
};

export const EXPLORER = "https://sepolia.etherscan.io";
export const txUrl = (hash: string) => `${EXPLORER}/tx/${hash}`;

const match = (m: Merchant, key: string) => {
  const k = key.trim().toLowerCase();
  if (!k) return false;
  return m.id === k || m.address.toLowerCase() === k || m.name.toLowerCase() === k || m.name.split("·").some((p) => p.toLowerCase() === k);
};

// ─────────────── 商家注册表 ───────────────
// 启动时先用部署配置里的店填充；registry.ts 会定期从链上刷新（白名单状态、新导入的店、店名、店主）
/** 部署配置里登记过的所有店（展示信息） */
export const knownShops = (): Merchant[] => [
  ...deployment.merchants,
  ...deployment.untrustedShops.map((m) => ({ ...m, flagged: true })),
  ...(deployment.otherShops ?? []),
  ...(deployment.legacyShops ?? []).map((m) => ({ ...m, legacy: true })),
];
let registry: Merchant[] = knownShops().map((m) => ({ ...m, allowed: deployment.merchants.includes(m) }));
export const setRegistry = (list: Merchant[]) => void (registry = list);
/** 已接入的外部平台（见 ucp.ts）。和链上商家分开存放：allShops() 只包含链上商家合约 */
let platforms: Merchant[] = [];
export const setPlatforms = (list: Merchant[]) => void (platforms = list);
export const allPlatforms = () => platforms;

/** 所有已知的链上商家合约（包括不在白名单里的） */
export const allShops = () => registry;
/** 当前在链上白名单里的店和平台 */
export const trustedShops = () => [...registry, ...platforms].filter((m) => m.allowed);

/** 在白名单商家里按 id / 名称 / 地址查找（大小写不敏感） */
export function findMerchant(key: string): Merchant | undefined {
  return trustedShops().find((m) => match(m, key));
}

/** 在所有店里查找（包括不在白名单里的），支持名称的部分匹配，比如"天天特价"。
 *  旧版合约只能按 id / 地址精确找到（用于历史订单），不参与按名字匹配，免得和新店重名 */
export function findShop(key: string): Merchant | undefined {
  const k = key.trim().toLowerCase();
  const exact = [...registry, ...platforms].find((m) => m.id === k || m.address.toLowerCase() === k);
  if (exact) return exact;
  const live = [...registry.filter((m) => !m.legacy), ...platforms];
  return live.find((m) => match(m, key)) ?? (k.length >= 2 ? live.find((m) => m.name.toLowerCase().includes(k)) : undefined);
}
