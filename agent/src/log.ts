// 终端输出：让演示时观众一眼看懂 AI 在做什么、合约给了什么结果
import type { PayResult, VaultStatus } from "./chain.js";

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

export const log = {
  title: (s: string) => console.log(`\n${c.bold(c.cyan("━━ " + s + " ━━"))}`),
  step: (s: string) => console.log(c.dim(`   ${s}`)),
  ai: (s: string) => console.log(`🤖 ${s}`),
  user: (s: string) => console.log(`👤 ${s}`),
  attack: (s: string) => console.log(c.red(`☠️  ${s}`)),
  status: (st: VaultStatus) =>
    console.log(
      c.dim(
        `   金库 ${st.vaultBalance} mUSDC | 今日剩余 ${st.remainingToday}/${st.dailyLimit} | 单笔上限 ${st.perTxLimit} | ${st.paused ? "🔴 已冻结" : "🟢 正常"}`,
      ),
    ),
  pay: (to: string, amount: string, memo: string) => console.log(`🤖 付款 → ${to}  ${amount} mUSDC  “${memo}”`),
  payResult: (r: PayResult) => {
    if (r.status === "executed") console.log(c.green(`   ✅ 已执行  ${r.explorer}`));
    else if (r.status === "pending_approval")
      console.log(c.yellow(`   ⏳ 待审批 #${r.requestId}（${r.why}）  ${r.explorer}`));
    else console.log(c.red(`   ⛔ 链上拒绝：${r.reason}${r.explorer ? "  " + r.explorer : ""}`));
  },
  final: (s: string) => console.log(`\n${c.bold("🤖 总结：")}${s}\n`),
};
