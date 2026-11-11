// 链交互层：AI 代理通过这里读金库状态、发起付款。
// 关键点：代理只持有自己的私钥（AGENT_PRIVATE_KEY），合约只允许它调用 pay()。
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  formatUnits,
  http,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { agentShopAbi, agentVaultAbi as vaultOnlyAbi, mockUsdcAbi } from "./generated/abi.js";

// 付款给商家合约时，金库会回调商家合约；商家合约拒收（金额不对、订单不存在……）的错误会原样冒出来。
// 把商家合约的错误定义也加进来，viem 才能把它们解码成名字
const agentVaultAbi = [...vaultOnlyAbi, ...agentShopAbi.filter((x) => x.type === "error")] as unknown as typeof vaultOnlyAbi;
import { deployment, env, txUrl } from "./config.js";

export const DECIMALS = 6;
export const toUnits = (usd: string | number) => parseUnits(String(usd), DECIMALS);
export const fmt = (units: bigint) => formatUnits(units, DECIMALS);

export const VAULT = deployment.contracts.AgentVault;
export const USDC = deployment.contracts.MockUSDC;

export const publicClient = createPublicClient({ chain: sepolia, transport: http(env.rpcUrl) });

export function walletFor(key: Hex) {
  return createWalletClient({ account: privateKeyToAccount(key), chain: sepolia, transport: http(env.rpcUrl) });
}

export interface VaultStatus {
  vaultBalance: string;
  paused: boolean;
  agent: Address;
  agentActive: boolean;
  agentExpiresAt: string;
  dailyLimit: string;
  perTxLimit: string;
  remainingToday: string;
  agentGasEth: string;
}

export async function getStatus(agent: Address = deployment.roles.agent): Promise<VaultStatus> {
  const [bal, paused, policy, remaining, gas] = await Promise.all([
    publicClient.readContract({ address: VAULT, abi: agentVaultAbi, functionName: "balance" }),
    publicClient.readContract({ address: VAULT, abi: agentVaultAbi, functionName: "paused" }),
    publicClient.readContract({ address: VAULT, abi: agentVaultAbi, functionName: "getPolicy", args: [agent] }),
    publicClient.readContract({ address: VAULT, abi: agentVaultAbi, functionName: "remainingToday", args: [agent] }),
    publicClient.getBalance({ address: agent }),
  ]);
  return {
    vaultBalance: fmt(bal),
    paused,
    agent,
    agentActive: policy.active,
    agentExpiresAt: new Date(Number(policy.expiresAt) * 1000).toISOString(),
    dailyLimit: fmt(policy.dailyLimit),
    perTxLimit: fmt(policy.perTxLimit),
    remainingToday: fmt(remaining),
    agentGasEth: formatUnits(gas, 18),
  };
}

export type PayResult =
  | { status: "executed"; amount: string; txHash: Hex; explorer: string }
  | { status: "pending_approval"; requestId: string; amount: string; txHash: Hex; explorer: string; why: string }
  | { status: "rejected_by_contract"; reason: string; txHash?: Hex; explorer?: string };

/** 把合约的自定义错误翻译成人话（AI 和用户都能看懂） */
export function explainRevert(err: unknown): string {
  if (err instanceof BaseError) {
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName ?? revert.reason ?? "未知原因";
      const map: Record<string, string> = {
        MerchantNotAllowed: "收款方不在商家白名单中",
        NotAgent: "该钱包未被授权为 AI 代理（或已被收回）",
        AgentExpired: "AI 代理的授权已过期",
        EnforcedPause: "金库已被用户紧急冻结",
        ZeroAmount: "金额不能为 0",
        OwnableUnauthorizedAccount: "调用者没有权限执行",
        ReceiverRejected: "商家合约拒收了这笔付款",
        WrongAmount: "付款金额和订单金额不一致",
        BadMemo: "付款备注不是有效的订单号",
        WrongStatus: "订单当前状态不允许这个操作（可能已付款、已取消或已发货）",
        WrongBuyer: "这不是你下的订单",
        OrderExpired: "订单已过期（超过 24 小时未付款）",
        OutOfStock: "库存不足",
        ItemUnavailable: "商品不存在或已下架",
        NotAuthorized: "没有权限（例如发货后只有商家能退款）",
        TooEarly: "还没到自动放款时间",
        BadOrder: "订单内容不合法",
        RequestExpired: "审批请求已过期",
        RequestNotPending: "审批请求已处理过",
        PriceAboveMax: "商家价格变了，总价超过了你能接受的最高价，没有下单",
        DisputeWindowClosed: "已经过了申诉期（自动放款后不能再申诉）",
        NotArbiter: "只有平台仲裁人能裁决申诉",
        TooLong: "文字太长",
      };
      return `${name}: ${map[name] ?? "合约拒绝"}`;
    }
    return err.shortMessage;
  }
  return String(err);
}

/**
 * AI 代理付款。先在节点上模拟（不花 gas）：
 * - 合约会拒绝 → 默认直接返回拒绝原因；若 recordOnChain=true，仍强制发送交易，
 *   让“被拦截”在 Etherscan 上留下一条失败记录（演示/报告用）。
 * - 不会拒绝 → 发送交易，读取事件判断是“已执行”还是“待审批”。
 */
export async function pay(
  merchant: Address,
  amountUsd: string,
  memo: string,
  opts: { recordOnChain?: boolean } = {},
): Promise<PayResult> {
  const wallet = walletFor(env.agentKey());
  const amount = toUnits(amountUsd);
  const call = {
    address: VAULT,
    abi: agentVaultAbi,
    functionName: "pay",
    args: [merchant, amount, memo],
    account: wallet.account,
  } as const;

  try {
    await publicClient.simulateContract(call);
  } catch (err) {
    const reason = explainRevert(err);
    if (!opts.recordOnChain) return { status: "rejected_by_contract", reason };
    const txHash = await wallet.writeContract({ ...call, gas: 150_000n });
    await publicClient.waitForTransactionReceipt({ hash: txHash });
    return { status: "rejected_by_contract", reason, txHash, explorer: txUrl(txHash) };
  }

  const txHash = await wallet.writeContract(call);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") {
    return { status: "rejected_by_contract", reason: "交易执行失败", txHash, explorer: txUrl(txHash) };
  }

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== VAULT.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: agentVaultAbi, data: log.data, topics: log.topics });
      if (ev.eventName === "PaymentExecuted") {
        return { status: "executed", amount: fmt(ev.args.amount), txHash, explorer: txUrl(txHash) };
      }
      if (ev.eventName === "PaymentRequested") {
        return {
          status: "pending_approval",
          requestId: ev.args.requestId.toString(),
          amount: fmt(ev.args.amount),
          txHash,
          explorer: txUrl(txHash),
          why: "超出单笔上限 / 今日剩余额度 / 金库余额，需金库主人人工批准",
        };
      }
    } catch {
      /* 非本合约事件，忽略 */
    }
  }
  return { status: "rejected_by_contract", reason: "未找到付款事件", txHash, explorer: txUrl(txHash) };
}

// ─────────────── 以下为“用户（owner）”操作，仅供演示脚本 / 命令行使用 ───────────────

async function ownerWrite(functionName: "pause" | "unpause" | "approveRequest" | "rejectRequest", args: bigint[] = []) {
  const wallet = walletFor(env.ownerKey());
  const { request } = await publicClient.simulateContract({
    address: VAULT,
    abi: agentVaultAbi,
    functionName,
    args: args as never,
    account: wallet.account,
  });
  const hash = await wallet.writeContract(request);
  await publicClient.waitForTransactionReceipt({ hash });
  return txUrl(hash);
}

export const owner = {
  pause: () => ownerWrite("pause"),
  unpause: () => ownerWrite("unpause"),
  approve: (id: bigint) => ownerWrite("approveRequest", [id]),
  reject: (id: bigint) => ownerWrite("rejectRequest", [id]),
};

export async function getRequest(id: bigint) {
  return publicClient.readContract({ address: VAULT, abi: agentVaultAbi, functionName: "getRequest", args: [id] });
}

export async function nextRequestId() {
  return publicClient.readContract({ address: VAULT, abi: agentVaultAbi, functionName: "nextRequestId" });
}

export async function usdcBalance(addr: Address) {
  return fmt(await publicClient.readContract({ address: USDC, abi: mockUsdcAbi, functionName: "balanceOf", args: [addr] }));
}
