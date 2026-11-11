import { t } from "./i18n";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useConnection, usePublicClient, useReadContract, useReadContracts, useWriteContract } from "wagmi";
import { BaseError, ContractFunctionRevertedError, decodeEventLog, getAddress, toFunctionSelector, type Abi, type Address, type PublicClient } from "viem";
import { agentShopAbi, agentVaultAbi, mockUsdcAbi } from "./generated/abi";
import { allShops, dep, EXPLORER, externalPlatforms, knownShop, setShops, USDC, VAULT, type Shop } from "./config";

const POLL = { refetchInterval: 6000 } as const;
const vault = { address: VAULT, abi: agentVaultAbi } as const;

/** 金库核心状态，每 6 秒自动刷新（AI 在终端付款时，页面会自己更新） */
export function useVault() {
  const agent = dep.roles.agent;
  const { data, isLoading } = useReadContracts({
    contracts: [
      { ...vault, functionName: "balance" },
      { ...vault, functionName: "paused" },
      { ...vault, functionName: "owner" },
      { ...vault, functionName: "getPolicy", args: [agent] },
      { ...vault, functionName: "remainingToday", args: [agent] },
      { ...vault, functionName: "nextRequestId" },
    ],
    query: POLL,
  });
  return {
    isLoading,
    balance: data?.[0].result,
    paused: data?.[1].result,
    owner: data?.[2].result,
    policy: data?.[3].result,
    remaining: data?.[4].result,
    nextRequestId: data?.[5].result,
  };
}

/** 当前连接的钱包是不是金库主人（只有主人能看到管理按钮） */
export function useIsOwner() {
  const { address } = useConnection();
  const { owner } = useVault();
  return Boolean(address && owner && address.toLowerCase() === owner.toLowerCase());
}

// ─────────────── 商家注册表（以链上为准） ───────────────

export const RECEIVER_INTERFACE_ID = toFunctionSelector("onAgentPayment(address,uint256,string)");

export type ShopCheck =
  | { kind: "invalid" }
  | { kind: "eoa" }
  | { kind: "contract" }
  | { kind: "shop"; name: string; description: string; owner: Address; vault: Address; token: Address; items: number; confirmWindow: number; boundHere: boolean; tokenOk: boolean };

/** 检查一个地址是不是能接入本金库的商家合约 */
export async function inspectShop(client: PublicClient, address: Address): Promise<ShopCheck> {
  const code = await client.getCode({ address });
  if (!code || code === "0x") return { kind: "eoa" };
  const read = <T,>(functionName: string, args: unknown[] = []) =>
    client.readContract({ address, abi: agentShopAbi, functionName, args } as never) as Promise<T>;
  try {
    if (!(await read<boolean>("supportsInterface", [RECEIVER_INTERFACE_ID]))) return { kind: "contract" };
    const [name, description, owner, v, token, items, confirmWindow] = await Promise.all([
      read<string>("name"),
      read<string>("description"),
      read<Address>("owner"),
      read<Address>("vault"),
      read<Address>("token"),
      read<readonly unknown[]>("getItems"),
      read<bigint>("confirmWindow"),
    ]);
    return {
      kind: "shop", name, description, owner, vault: v, token, items: items.length, confirmWindow: Number(confirmWindow),
      boundHere: v.toLowerCase() === VAULT.toLowerCase(),
      tokenOk: token.toLowerCase() === USDC.toLowerCase(),
    };
  } catch {
    return { kind: "contract" };
  }
}

/** 所有店 = 部署配置里的店 + 链上白名单出现过的所有商家合约。15 秒刷新一次 */
export function useShops(): Shop[] {
  const client = usePublicClient();
  const { data } = useQuery({
    queryKey: ["shops"],
    enabled: Boolean(client),
    refetchInterval: 15000,
    queryFn: async () => {
      const logs = await client!.getContractEvents({ ...vault, eventName: "MerchantSet", fromBlock: dep.deployBlock });
      const candidates = new Set<string>([...allShops.map((s) => getAddress(s.address)), ...logs.map((l) => getAddress(l.args.merchant!))]);
      const list: Shop[] = [];
      for (const addr of candidates) {
        const info = await inspectShop(client!, addr as Address).catch(() => ({ kind: "invalid" }) as const);
        if (info.kind === "invalid") {
          // 网络抖动：保留上一次的结果，不要让店"消失"
          const prev = allShops.find((x) => x.address.toLowerCase() === addr.toLowerCase());
          if (prev) list.push(prev);
          continue;
        }
        if (info.kind !== "shop" || !info.boundHere) continue;
        const meta = knownShop(addr);
        list.push({
          id: meta?.id ?? `s${addr.slice(2, 8).toLowerCase()}`,
          name: info.name || meta?.name || addr,
          emoji: meta?.emoji ?? "",
          category: meta?.category ?? "商家", // 显示时用 tn() 翻译
          eta: meta?.eta ?? "",
          address: addr as Address,
          trusted: Boolean(meta && !meta.flagged),
          flagged: meta?.flagged,
          legacy: meta?.legacy,
          owner: info.owner,
          description: info.description,
        });
      }
      setShops(list);
      return list;
    },
  });
  return data ?? allShops;
}

/** 所有店以及它们在链上是否被允许收款 */
export function useMerchants() {
  const shops = useShops();
  const { data } = useReadContracts({
    contracts: shops.map((m) => ({ ...vault, functionName: "isMerchant" as const, args: [m.address] as const })),
    query: POLL,
  });
  return shops.map((m, i) => ({ ...m, allowed: data?.[i]?.result === true }));
}

/** 每家店的链上菜单 */
export function useShopItems() {
  const shops = useShops();
  const { data } = useReadContracts({
    contracts: shops.map((m) => ({ address: m.address, abi: agentShopAbi, functionName: "getItems" as const })),
    query: { refetchInterval: 30000 },
  });
  const map = new Map<string, { name: string; price: bigint; stock: number; active: boolean }[]>();
  shops.forEach((m, i) => map.set(m.id, (data?.[i]?.result as never) ?? []));
  return map;
}

export const ORDER_STATUS = ["None", "Created", "Paid", "Delivered", "Completed", "Refunded", "Cancelled", "Disputed"] as const;
export type ChainOrder = {
  shop: Shop;
  id: bigint;
  status: (typeof ORDER_STATUS)[number];
  buyer: string;
  total: bigint;
  createdAt: number;
  paidAt: number;
  deliveredAt: number;
  lines: { itemId: number; qty: number }[];
};

function toOrder(shop: Shop, id: bigint, r: unknown): ChainOrder | undefined {
  if (!r) return undefined;
  const [o, lines] = r as [
    { buyer: string; status: number; total: bigint; createdAt: bigint; paidAt: bigint; deliveredAt: bigint },
    readonly { itemId: number; qty: number }[],
  ];
  if (o.status === 0) return undefined;
  return {
    shop,
    id,
    status: ORDER_STATUS[o.status],
    buyer: o.buyer,
    total: o.total,
    createdAt: Number(o.createdAt),
    paidAt: Number(o.paidAt),
    deliveredAt: Number(o.deliveredAt),
    lines: [...lines],
  };
}

/** 一个订单，每 4 秒刷新；已结束的订单不再刷新 */
export function useOrder(shop: Shop | undefined, id: bigint | undefined) {
  const { data } = useReadContract({
    address: shop?.address,
    abi: agentShopAbi,
    functionName: "getOrder",
    args: id !== undefined ? [id] : undefined,
    query: {
      enabled: Boolean(shop && id !== undefined),
      refetchInterval: (q) => {
        const st = (q.state.data as unknown as [{ status: number }] | undefined)?.[0]?.status;
        return st !== undefined && st >= 4 ? false : 4000;
      },
    },
  });
  return shop && id !== undefined ? toOrder(shop, id, data) : undefined;
}

/** 所有店的订单（每家店最近 20 单），最新的在前 */
export function useOrders() {
  const shops = useShops();
  const next = useReadContracts({
    contracts: shops.map((m) => ({ address: m.address, abi: agentShopAbi, functionName: "nextOrderId" as const })),
    query: { refetchInterval: 5000 },
  });
  const ids = shops.flatMap((shop, i) => {
    const n = Number((next.data?.[i]?.result as bigint | undefined) ?? 1n);
    return Array.from({ length: Math.min(n - 1, 20) }, (_, k) => ({ shop, id: BigInt(n - 1 - k) }));
  });
  const orders = useReadContracts({
    contracts: ids.map(({ shop, id }) => ({ address: shop.address, abi: agentShopAbi, functionName: "getOrder" as const, args: [id] as const })),
    query: { refetchInterval: 5000, enabled: ids.length > 0 },
  });
  return ids
    .map(({ shop, id }, i) => toOrder(shop, id, orders.data?.[i]?.result))
    .filter((o): o is ChainOrder => Boolean(o))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function useRequests(next: bigint | undefined) {
  const ids = next ? Array.from({ length: Number(next) - 1 }, (_, i) => BigInt(i + 1)) : [];
  const { data } = useReadContracts({
    contracts: ids.flatMap((id) => [
      { ...vault, functionName: "getRequest" as const, args: [id] as const },
      { ...vault, functionName: "getRequestMemo" as const, args: [id] as const },
    ]),
    query: POLL,
  });
  type Req = { agent: string; merchant: string; amount: bigint; createdAt: bigint; status: number };
  return ids
    .map((id, i) => ({ id, req: data?.[i * 2]?.result as Req | undefined, memo: (data?.[i * 2 + 1]?.result as string | undefined) ?? "" }))
    .filter((x): x is { id: bigint; req: Req; memo: string } => Boolean(x.req))
    .reverse();
}

export function useUsdc(address?: `0x${string}`) {
  const bal = useReadContract({
    address: USDC,
    abi: mockUsdcAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { ...POLL, enabled: Boolean(address) },
  });
  const allowance = useReadContract({
    address: USDC,
    abi: mockUsdcAbi,
    functionName: "allowance",
    args: address ? [address, VAULT] : undefined,
    query: { ...POLL, enabled: Boolean(address) },
  });
  return { balance: bal.data, allowance: allowance.data };
}

/** 合约事件 → 活动记录（从部署区块开始读，按时间倒序） */
export function useActivity() {
  const client = usePublicClient();
  const shops = useShops();
  return useQuery({
    queryKey: ["activity", shops.map((s) => s.address).join()],
    refetchInterval: 8000,
    enabled: Boolean(client),
    queryFn: async () => {
      const vaultLogs = await client!.getContractEvents({ ...vault, fromBlock: dep.deployBlock });
      const shopLogs = (
        await Promise.all(
          shops.map(async (shop) =>
            (await client!.getContractEvents({ address: shop.address, abi: agentShopAbi, fromBlock: dep.deployBlock })).map((l) => ({ ...l, shop })),
          ),
        )
      ).flat();
      const logs = [...vaultLogs.map((l) => ({ ...l, shop: undefined as Shop | undefined })), ...shopLogs].sort((a, b) =>
        a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1,
      );
      const blocks = [...new Set(logs.map((l) => l.blockNumber))];
      const times = new Map<bigint, number>();
      await Promise.all(
        blocks.map(async (b) => times.set(b, Number((await client!.getBlock({ blockNumber: b })).timestamp) * 1000)),
      );
      return logs.map((l) => ({ ...l, time: times.get(l.blockNumber) ?? 0 })).reverse();
    },
  });
}

/** 把合约错误翻译成中文 */
export function explain(err: unknown): string {
  if (err instanceof BaseError) {
    const r = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (r instanceof ContractFunctionRevertedError) {
      const name = r.data?.errorName ?? "";
      const map: Record<string, string> = {
        MerchantNotAllowed: t("收款方不在白名单", "Payee is not on the whitelist"),
        InvalidLimits: t("额度设置不合法（单笔须 > 0 且 ≤ 每日，到期时间须在未来，代理不能是主人）", "Invalid limits (per-tx must be > 0 and ≤ daily, expiry in the future, agent can't be the owner)"),
        InsufficientBalance: t("余额不足", "Insufficient balance"),
        RequestNotPending: t("该请求已处理过", "This request was already handled"),
        RequestExpired: t("请求已超过 24 小时有效期", "Request is older than 24 hours"),
        EnforcedPause: t("金库已冻结", "Vault is frozen"),
        ExpectedPause: t("金库未冻结", "Vault is not frozen"),
        OwnableUnauthorizedAccount: t("只有金库主人可以执行", "Only the vault owner can do this"),
        FaucetCooldown: t("水龙头冷却中，每 24 小时只能领一次", "Faucet cooling down: once every 24 hours"),
        ZeroAmount: t("金额不能为 0", "Amount can't be 0"),
        ZeroAddress: t("地址不能为空", "Address can't be empty"),
        ERC20InsufficientAllowance: t("授权额度不足，请先授权", "Allowance too low, approve first"),
        ERC20InsufficientBalance: t("钱包 mUSDC 余额不足", "Not enough mUSDC in wallet"),
        NotArbiter: t("只有平台仲裁人可以裁决（请用仲裁人钱包连接）", "Only the platform arbiter can rule (connect the arbiter wallet)"),
        WrongStatus: t("订单当前状态不允许这个操作（可能已经处理过）", "Order status doesn't allow this (maybe already handled)"),
        WindowTooShort: t("确认期短于平台规定的最短时间", "Confirm window is shorter than the platform minimum"),
        TooLong: t("文字太长", "Text too long"),
      };
      return map[name] ?? (name || r.shortMessage);
    }
    if (err.shortMessage.includes("User rejected") || err.shortMessage.includes("User denied")) return t("你在 MetaMask 中取消了操作", "You cancelled in MetaMask");
    return err.shortMessage;
  }
  return String(err);
}

export type TxState = { kind: "idle" } | { kind: "busy"; label: string } | { kind: "ok"; label: string; url: string } | { kind: "err"; label: string; msg: string };

/** 发交易的统一流程：先模拟（拿到中文错误）→ MetaMask 签名 → 等上链 → 刷新数据 */
export function useTx() {
  const client = usePublicClient();
  const { address } = useConnection();
  const { mutateAsync } = useWriteContract();
  const qc = useQueryClient();
  const [state, setState] = useState<TxState>({ kind: "idle" });

  async function send(
    label: string,
    call: { address: `0x${string}`; abi: Abi; functionName: string; args?: readonly unknown[] },
  ) {
    if (!client || !address) return false;
    setState({ kind: "busy", label });
    try {
      const { request } = await client.simulateContract({ ...call, account: address } as never);
      const hash = await mutateAsync(request as never);
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(t("交易执行失败", "Transaction failed"));
      setState({ kind: "ok", label, url: `${EXPLORER}/tx/${hash}` });
      await qc.invalidateQueries();
      return true;
    } catch (e) {
      setState({ kind: "err", label, msg: explain(e) });
      return false;
    }
  }
  return { state, send, clear: () => setState({ kind: "idle" }) };
}

// ─────────────── 链上证据：余额对账 + 订单回执 ───────────────

/** 资金在哪里：直接向公共节点读 ERC-20 余额和商家合约账本（不经过我们的任何服务器） */
/**
 * 链上对账。金库和商家合约是这个环境独有的，直接读余额；
 * 商家钱包、外部平台收款地址、普通地址可能被两套环境共用，所以只统计"从本环境流过去的钱"：
 * 商家钱包 = 本环境商家合约的提现总额；平台 / 普通地址 = 金库付给它的 − 它退回金库的。
 */
export function useLedger() {
  const shops0 = useShops();
  const client = usePublicClient();
  const { data: events } = useActivity();
  const known = new Set([VAULT, dep.roles.merchant, dep.attacker, ...shops0.map((s) => s.address), ...externalPlatforms.map((p) => p.payTo)].map((a) => a.toLowerCase()));
  const plain = [
    ...new Set(
      (events ?? [])
        .filter((e) => !e.shop && e.eventName === "MerchantSet")
        .map((e) => String((e.args as { merchant: string }).merchant))
        .filter((a) => !known.has(a.toLowerCase())),
    ),
  ] as Address[];
  const holders = [{ key: "vault", address: VAULT }, ...shops0.map((s) => ({ key: s.id, address: s.address })), { key: "attacker", address: dep.attacker }];
  const { data, dataUpdatedAt } = useReadContracts({
    contracts: [
      ...holders.map((h) => ({ address: USDC, abi: mockUsdcAbi, functionName: "balanceOf" as const, args: [h.address] as const })),
      ...shops0.flatMap((s) => [
        { address: s.address, abi: agentShopAbi, functionName: "escrowed" as const },
        { address: s.address, abi: agentShopAbi, functionName: "withdrawable" as const },
      ]),
    ],
    query: { refetchInterval: 5000 },
  });
  // 金库和外部收款方之间的 mUSDC 转账（双向）
  const flows = useQuery({
    queryKey: ["ledger-flows"],
    enabled: Boolean(client),
    refetchInterval: 10000,
    queryFn: async () => {
      const [out, back] = await Promise.all([
        client!.getContractEvents({ address: USDC, abi: mockUsdcAbi, eventName: "Transfer", args: { from: VAULT }, fromBlock: dep.deployBlock }),
        client!.getContractEvents({ address: USDC, abi: mockUsdcAbi, eventName: "Transfer", args: { to: VAULT }, fromBlock: dep.deployBlock }),
      ]);
      const net = new Map<string, bigint>();
      for (const l of out) net.set(String(l.args.to).toLowerCase(), (net.get(String(l.args.to).toLowerCase()) ?? 0n) + (l.args.value ?? 0n));
      for (const l of back) net.set(String(l.args.from).toLowerCase(), (net.get(String(l.args.from).toLowerCase()) ?? 0n) - (l.args.value ?? 0n));
      return net;
    },
  }).data;
  const r = (i: number) => data?.[i]?.result as bigint | undefined;
  const bal = new Map(holders.map((h, i) => [h.key, r(i)]));
  const shops = shops0.map((s, i) => ({
    shop: s,
    balance: bal.get(s.id),
    escrowed: r(holders.length + i * 2),
    withdrawable: r(holders.length + i * 2 + 1),
  }));
  const received = (a: string) => (flows ? (flows.get(a.toLowerCase()) ?? 0n) : undefined);
  const platforms = externalPlatforms.map((p) => ({ platform: p, balance: received(p.payTo) }));
  const plainBalances = plain.map((a) => ({ address: a, balance: received(a) }));
  const merchantReceived = events
    ? events.filter((e) => e.shop && e.eventName === "Withdrawn").reduce((sum, e) => sum + ((e.args as { amount?: bigint }).amount ?? 0n), 0n)
    : undefined;
  return { bal, shops, platforms, plain: plainBalances, merchantReceived, updatedAt: dataUpdatedAt };
}

export type Receipt = {
  event: string;
  txHash: `0x${string}`;
  block: bigint;
  time: number;
  transfers: { from: string; to: string; amount: bigint }[];
};

/** 一个订单在链上的全部记录：每一步的交易、区块、时间，以及这笔交易里实际发生的 mUSDC 转账 */
export function useOrderReceipts(shop: Shop, id: bigint, statusKey: string, enabled: boolean) {
  const client = usePublicClient();
  return useQuery({
    queryKey: ["receipts", shop.id, id.toString(), statusKey],
    enabled: enabled && Boolean(client),
    staleTime: Infinity,
    queryFn: async (): Promise<Receipt[]> => {
      const logs = await client!.getContractEvents({ address: shop.address, abi: agentShopAbi, fromBlock: dep.deployBlock });
      const mine = logs.filter((l) => "orderId" in (l.args as object) && (l.args as { orderId: bigint }).orderId === id);
      // 订单放款后，商家下一次提现的交易也算进来：证明钱最终到了商家钱包
      const done = mine.find((l) => l.eventName === "OrderCompleted");
      const wd = done ? logs.find((l) => l.eventName === "Withdrawn" && l.blockNumber >= done.blockNumber) : undefined;
      const all = wd ? [...mine, wd] : mine;
      return Promise.all(
        all.map(async (l) => {
          const [rc, blk] = await Promise.all([
            client!.getTransactionReceipt({ hash: l.transactionHash }),
            client!.getBlock({ blockNumber: l.blockNumber }),
          ]);
          const transfers = rc.logs
            .filter((x) => x.address.toLowerCase() === USDC.toLowerCase())
            .flatMap((x) => {
              try {
                const ev = decodeEventLog({ abi: mockUsdcAbi, data: x.data, topics: x.topics });
                return ev.eventName === "Transfer" ? [{ from: ev.args.from, to: ev.args.to, amount: ev.args.value }] : [];
              } catch {
                return [];
              }
            });
          return { event: l.eventName as string, txHash: l.transactionHash, block: l.blockNumber, time: Number(blk.timestamp) * 1000, transfers };
        }),
      );
    },
  });
}
