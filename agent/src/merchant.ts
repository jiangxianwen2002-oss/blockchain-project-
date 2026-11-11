// 商家后台机器人：代表"商家那一边"，用商家自己的钱包（MERCHANT_PRIVATE_KEY）操作商家合约。
// 它和 AI 代理互不信任，只看链上：
//   - 看到订单在合约里变成"已付款"（钱已在合约托管）→ 备货 / 配送一段时间后 markDelivered
//   - 发货后超过确认期还没人确认 → 调用 release 自动放款
//   - 合约里有"可提现"的钱 → withdraw 提到商家钱包（这样在 Etherscan 上能看到钱真正到了商家手里）
// 演示为了节奏把时间压缩了：付款后约 40 秒送达（期间可以取消退款），送达后 3 分钟自动放款，放款后马上提现。
import { agentShopAbi } from "./generated/abi.js";
import { allShops, deployment, env, txUrl, type Merchant } from "./config.js";
import { publicClient, walletFor } from "./chain.js";
import { ensureRegistry } from "./registry.js";
import { privateKeyToAccount } from "viem/accounts";

const DELIVER_AFTER = Number(process.env.DELIVER_AFTER_SECONDS || 40);
const POLL_MS = 5000;

const seen = new Map<string, number>(); // 已经处理过的订单 → 上次处理时间，避免重复发交易

async function act(shop: Merchant, fn: "markDelivered" | "release" | "withdraw", id: bigint) {
  // 发货 / 放款对每个订单只做一次；提现每次有余额都要做（tick 本身是串行的，等回执后余额就变成 0，不会重复）
  const key = `${shop.id}-${id}-${fn}`;
  if (fn !== "withdraw") {
    if (seen.has(key)) return;
    seen.set(key, Date.now());
  }
  const wallet = walletFor(env.merchantKey());
  try {
    const { request } = await publicClient.simulateContract({
      address: shop.address,
      abi: agentShopAbi,
      functionName: fn,
      args: fn === "withdraw" ? [wallet.account.address] : [id],
      account: wallet.account,
    } as never);
    const hash = await wallet.writeContract(request);
    await publicClient.waitForTransactionReceipt({ hash });
    const what = fn === "markDelivered" ? `订单 ${shop.id}-${id}：已送达` : fn === "release" ? `订单 ${shop.id}-${id}：自动放款` : "提现到商家钱包";
    console.log(`🏪 ${shop.name} ${what}  ${txUrl(hash)}`);
  } catch (err) {
    seen.delete(key); // 下一轮再试
    console.error(`🏪 ${shop.name} ${fn} #${id} 失败：`, err instanceof Error ? err.message.split("\n")[0] : err);
  }
}

let running = false;
async function tick() {
  if (running) return;
  running = true;
  try {
    const now = Math.floor(Date.now() / 1000);
    await ensureRegistry();
    // 只处理店主是自己的店（别人的店轮不到我们发货）
    const me = privateKeyToAccount(env.merchantKey()).address.toLowerCase();
    for (const shop of allShops().filter((s) => !s.owner || s.owner.toLowerCase() === me)) {
      const next = await publicClient.readContract({ address: shop.address, abi: agentShopAbi, functionName: "nextOrderId" });
      const from = next > 31n ? next - 30n : 1n;
      // 自动放款期是每个商家合约自己的参数
      const window = Number(await publicClient.readContract({ address: shop.address, abi: agentShopAbi, functionName: "confirmWindow" }));
      for (let id = from; id < next; id++) {
        const [o] = await publicClient.readContract({ address: shop.address, abi: agentShopAbi, functionName: "getOrder", args: [id] });
        if (o.status === 2 && now - Number(o.paidAt) >= DELIVER_AFTER) await act(shop, "markDelivered", id);
        if (o.status === 3 && now - Number(o.deliveredAt) >= window) await act(shop, "release", id);
      }
      const w = await publicClient.readContract({ address: shop.address, abi: agentShopAbi, functionName: "withdrawable" });
      if (w > 0n) await act(shop, "withdraw", w);
    }
  } catch (err) {
    console.error("🏪 商家后台读取链上订单失败：", err instanceof Error ? err.message.split("\n")[0] : err);
  } finally {
    running = false;
  }
}

export function startMerchantBot() {
  if (!env.hasMerchantKey()) {
    console.log("🏪 未配置 MERCHANT_PRIVATE_KEY，商家后台不启动（订单不会自动送达）");
    return;
  }
  console.log(`🏪 商家后台已启动：付款后 ${DELIVER_AFTER} 秒送达，送达后超过各店的确认期无人确认自动放款`);
  tick();
  setInterval(tick, POLL_MS);
}
