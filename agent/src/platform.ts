// 平台仲裁人命令行：处理买家的申诉。仲裁人只能裁决"申诉中"的订单（退款给买家，或放款给商家），动不了别的任何钱。
// 用法：npm run platform -- disputes
//       npm run platform -- resolve <订单号，如 food-3> <refund|release>
import { agentShopAbi } from "./generated/abi.js";
import { allShops, env, txUrl } from "./config.js";
import { publicClient, walletFor } from "./chain.js";
import { ensureRegistry } from "./registry.js";
import { getOrder, parseOrderRef } from "./shop.js";

const [cmd, ref, decision] = process.argv.slice(2);
await ensureRegistry(true);

if (cmd === "disputes") {
  let n = 0;
  for (const shop of allShops()) {
    const next = await publicClient.readContract({ address: shop.address, abi: agentShopAbi, functionName: "nextOrderId" });
    for (let id = 1n; id < next; id++) {
      const o = await getOrder(shop, id);
      if (o.status !== "Disputed") continue;
      n++;
      console.log(`⚖️  ${o.order_id}  ${shop.name}  ${o.total} mUSDC  ${o.items.map((i) => `${i.name}×${i.qty}`).join("、")}`);
    }
  }
  console.log(n ? `共 ${n} 个申诉待处理` : "没有申诉中的订单");
} else if (cmd === "resolve" && ref && (decision === "refund" || decision === "release")) {
  const r = parseOrderRef(ref);
  if (!r) throw new Error(`找不到订单 ${ref}`);
  const wallet = walletFor(env.platformKey());
  const { request } = await publicClient.simulateContract({
    address: r.shop.address,
    abi: agentShopAbi,
    functionName: "resolveDispute",
    args: [r.id, decision === "refund"],
    account: wallet.account,
  });
  const hash = await wallet.writeContract(request);
  await publicClient.waitForTransactionReceipt({ hash });
  console.log(`⚖️  ${ref}：${decision === "refund" ? "退款给买家的金库" : "放款给商家"}  ${txUrl(hash)}`);
} else {
  console.log("用法：npm run platform -- disputes | resolve <订单号> <refund|release>");
}
