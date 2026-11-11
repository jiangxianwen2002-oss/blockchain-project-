// 金库主人的命令行工具（前端做好之前用它；之后也可作为备用）
// 用法：npm run owner -- <status|approve ID|reject ID|pause|unpause>
import { deployment, trustedShops } from "./config.js";
import { ensureRegistry } from "./registry.js";
import { fmt, getRequest, getStatus, nextRequestId, owner, usdcBalance } from "./chain.js";
import { log } from "./log.js";

const STATUS = ["None", "⏳ 待审批", "✅ 已执行", "❌ 已拒绝", "⌛ 已过期"];
const [cmd, idArg] = process.argv.slice(2);

async function status() {
  log.title("金库状态");
  const st = await getStatus();
  log.status(st);
  console.log(`   代理授权：${st.agentActive ? "有效" : "无效"}，到期 ${st.agentExpiresAt}，代理 gas ${st.agentGasEth} ETH`);
  console.log("   商家收款：");
  await ensureRegistry();
  for (const mer of trustedShops()) console.log(`     ${mer.name.padEnd(16)} ${await usdcBalance(mer.address)} mUSDC`);
  console.log(`     攻击者           ${await usdcBalance(deployment.attacker)} mUSDC`);

  const next = await nextRequestId();
  if (next > 1n) {
    console.log("   审批请求：");
    for (let i = 1n; i < next; i++) {
      const r = await getRequest(i);
      const name = trustedShops().find((x) => x.address.toLowerCase() === r.merchant.toLowerCase())?.name ?? r.merchant;
      console.log(`     #${i}  ${STATUS[r.status]}  ${name}  ${fmt(r.amount)} mUSDC`);
    }
  }
}

switch (cmd) {
  case "status":
    await status();
    break;
  case "approve":
    log.user(`批准请求 #${idArg}`);
    console.log(`   ${await owner.approve(BigInt(idArg))}`);
    break;
  case "reject":
    log.user(`拒绝请求 #${idArg}`);
    console.log(`   ${await owner.reject(BigInt(idArg))}`);
    break;
  case "pause":
    console.log(`   ${await owner.pause()}`);
    break;
  case "unpause":
    console.log(`   ${await owner.unpause()}`);
    break;
  default:
    console.log("用法：npm run owner -- <status|approve ID|reject ID|pause|unpause>");
}
