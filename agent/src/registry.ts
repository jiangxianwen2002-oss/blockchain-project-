// 商家注册表：从链上读取"现在有哪些店、哪些在白名单里"。
// 真实系统里白名单只存在链上（金库的 MerchantSet 事件 + isMerchant），本地配置只提供图标、分类这类展示信息。
// 管理员在控制台导入一家新店后，AI 下一次调用工具时就能看到它，不需要改任何配置或重启。
import { getAddress, toFunctionSelector, type Address } from "viem";
import { agentShopAbi, agentVaultAbi, shopFactoryAbi } from "./generated/abi.js";
import { deployment, knownShops, setRegistry, allShops, type Merchant } from "./config.js";
import { publicClient, VAULT } from "./chain.js";
import { discoverPlatforms } from "./ucp.js";

/** IPaymentReceiver 的 ERC-165 接口 ID = onAgentPayment 的函数选择器 */
export const RECEIVER_INTERFACE_ID = toFunctionSelector("onAgentPayment(address,uint256,string)");

const TTL_MS = 10_000;
let last = 0;
let inflight: Promise<void> | undefined;

/** 读取一个地址的商家合约信息；不是（绑定本金库的）商家合约则返回 undefined */
export async function inspectShop(address: Address) {
  const code = await publicClient.getCode({ address });
  if (!code || code === "0x") return { kind: "eoa" as const };
  const read = <T>(functionName: string, args: unknown[] = []) =>
    publicClient.readContract({ address, abi: agentShopAbi, functionName, args } as never) as Promise<T>;
  try {
    const supports = await read<boolean>("supportsInterface", [RECEIVER_INTERFACE_ID]);
    if (!supports) return { kind: "contract" as const };
    const [name, description, owner, vault, token, items] = await Promise.all([
      read<string>("name"),
      read<string>("description"),
      read<Address>("owner"),
      read<Address>("vault"),
      read<Address>("token"),
      read<readonly unknown[]>("getItems"),
    ]);
    return { kind: "shop" as const, name, description, owner, vault, token, itemCount: items.length };
  } catch {
    return { kind: "contract" as const };
  }
}

async function refresh() {
  // 1. 白名单：回放金库的 MerchantSet 事件，得到每个地址最新的状态
  const logs = await publicClient.getContractEvents({
    address: VAULT,
    abi: agentVaultAbi,
    eventName: "MerchantSet",
    fromBlock: BigInt(deployment.deployBlock),
  });
  const state = new Map<string, boolean>();
  for (const l of logs) state.set(getAddress(l.args.merchant!), Boolean(l.args.allowed));

  // 2. 候选：部署配置里的店 + 链上出现过的所有地址
  const known = new Map<string, Merchant>();
  for (const m of knownShops()) known.set(getAddress(m.address), m);
  const candidates = new Set<string>([...known.keys(), ...state.keys()]);

  const list: Merchant[] = [];
  for (const addr of candidates) {
    const meta = known.get(addr);
    const info = await inspectShop(addr as Address).catch(() => undefined);
    // 只收录绑定了本金库的商家合约（普通地址、别的合约不算"店"）
    if (!info || info.kind !== "shop" || info.vault.toLowerCase() !== VAULT.toLowerCase()) continue;
    const official = await publicClient
      .readContract({ address: deployment.contracts.ShopFactory, abi: shopFactoryAbi, functionName: "isShop", args: [addr as Address] })
      .catch(() => false);
    list.push({
      id: meta?.id ?? `s${addr.slice(2, 8).toLowerCase()}`,
      name: info.name || meta?.name || addr,
      emoji: meta?.emoji ?? "",
      category: meta?.category ?? "商家",
      eta: meta?.eta ?? "",
      address: addr as Address,
      allowed: state.get(addr) ?? false,
      owner: info.owner,
      flagged: meta?.flagged,
      legacy: meta?.legacy,
      official,
    });
  }
  setRegistry(list);
  // 3. 外部平台：白名单里登记的是平台的 x402 收款地址
  await discoverPlatforms((a) => state.get(getAddress(a)) ?? false);
  last = Date.now();
}

/** 确保注册表是最新的（15 秒缓存）。读取失败时保留上一次的结果 */
export async function ensureRegistry(force = false) {
  if (!force && Date.now() - last < TTL_MS) return allShops();
  inflight ??= refresh()
    .catch((err) => console.error("商家注册表刷新失败：", err instanceof Error ? err.message.split("\n")[0] : err))
    .finally(() => (inflight = undefined));
  await inflight;
  return allShops();
}
