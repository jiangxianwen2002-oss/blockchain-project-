// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {AgentVault} from "../src/AgentVault.sol";
import {AgentShop} from "../src/AgentShop.sol";
import {Menus} from "./Menus.sol";

/// @notice v2 部署 + 初始化（由 owner 执行，一条命令完成）：
///   1. 部署新的 AgentVault（支持"转账并通知"商家合约）
///   2. 部署 4 个商家合约 AgentShop（店主 = MERCHANT_ADDRESS）：外卖 / 奶茶咖啡 / 打车 / 诈骗店
///   3. 把旧金库（OLD_VAULT_ADDRESS）里的钱全部取出，存入新金库；收回旧金库的代理授权
///   4. 授权 AI 代理：每日 100 / 单笔 30 / 30 天；把 3 家正规店加入白名单（诈骗店故意不加）
///   5. 给商家钱包转 0.01 ETH 作为发货用的 gas
/// 用法：
///   USDC_ADDRESS=0x.. OLD_VAULT_ADDRESS=0x.. forge script script/DeployV2.s.sol --rpc-url sepolia --broadcast --verify
contract DeployV2 is Script, Menus {
    /// @dev 演示用：发货后 3 分钟没人确认就自动放款给商家
    uint64 constant CONFIRM_WINDOW = 3 minutes;

    function _shop(MockUSDC usdc, AgentVault vault, address merchant, string memory name, string memory desc, Menu memory m)
        internal
        returns (AgentShop)
    {
        // 注：v2 链上的商家合约是用旧版 AgentShop（没有仲裁人参数）部署的；为了让脚本能和新版合约一起编译，这里传入 owner 作为仲裁人。
        // 现在的商家合约请用 DeployV3.s.sol 通过官方工厂创建。
        AgentShop.ShopConfig memory cfg = AgentShop.ShopConfig(
            address(usdc), address(vault), merchant, vm.addr(vm.envUint("OWNER_PRIVATE_KEY")), CONFIRM_WINDOW, name, desc
        );
        return new AgentShop(cfg, m.names, m.prices, m.stocks);
    }

    function run() external {
        uint256 pk = vm.envUint("OWNER_PRIVATE_KEY");
        address owner = vm.addr(pk);
        address agent = vm.envAddress("AGENT_ADDRESS");
        address merchant = vm.envAddress("MERCHANT_ADDRESS");
        MockUSDC usdc = MockUSDC(vm.envAddress("USDC_ADDRESS"));
        AgentVault oldVault = AgentVault(vm.envAddress("OLD_VAULT_ADDRESS"));

        vm.startBroadcast(pk);
        AgentVault vault = new AgentVault(address(usdc), owner);
        AgentShop food = _shop(usdc, vault, merchant, unicode"饭点到·家常小厨", unicode"家常快餐，30 分钟送达", foodMenu());
        AgentShop tea = _shop(usdc, vault, merchant, unicode"一点甜·奶茶咖啡", unicode"现做奶茶咖啡，20 分钟送达", teaMenu());
        AgentShop ride = _shop(usdc, vault, merchant, unicode"快到·打车", unicode"经济型网约车，司机约 3 分钟到达", rideMenu());
        AgentShop deals = _shop(usdc, vault, merchant, unicode"天天特价·首单1折", DEALS_NOTICE, dealsMenu());

        // 资金从旧金库迁移到新金库
        uint256 bal = oldVault.balance();
        if (bal > 0) oldVault.withdraw(owner, bal);
        oldVault.revokeAgent(agent);
        usdc.approve(address(vault), type(uint256).max);
        vault.deposit(usdc.balanceOf(owner));

        vault.setAgent(agent, 100 * USD, 30 * USD, uint64(block.timestamp + 30 days));
        vault.setMerchant(address(food), true);
        vault.setMerchant(address(tea), true);
        vault.setMerchant(address(ride), true);

        if (merchant.balance < 0.005 ether) payable(merchant).transfer(0.01 ether);
        if (agent.balance < 0.01 ether) payable(agent).transfer(0.02 ether);
        vm.stopBroadcast();

        console.log("AgentVault v2:", address(vault));
        console.log("shop food    :", address(food));
        console.log("shop tea     :", address(tea));
        console.log("shop ride    :", address(ride));
        console.log("shop deals   :", address(deals));
        console.log("vault balance:", vault.balance());
    }
}
