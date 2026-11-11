// 把 Foundry 编译产物里的 ABI 导出为 TypeScript（`as const` 让 viem 有完整类型）
// 用法：forge build && node scripts/export-abi.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const targets = ["agent/src/generated", "frontend/src/generated"];
const contracts = { agentVault: "out/AgentVault.sol/AgentVault.json", mockUsdc: "out/MockUSDC.sol/MockUSDC.json", agentShop: "out/AgentShop.sol/AgentShop.json", shopFactory: "out/ShopFactory.sol/ShopFactory.json" };

let src = "// 自动生成，请勿手改：node scripts/export-abi.mjs\n";
for (const [name, path] of Object.entries(contracts)) {
  const { abi } = JSON.parse(readFileSync(path, "utf8"));
  src += `export const ${name}Abi = ${JSON.stringify(abi, null, 2)} as const;\n\n`;
}
for (const dir of targets) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/abi.ts`, src);
  console.log(`wrote ${dir}/abi.ts`);
}
