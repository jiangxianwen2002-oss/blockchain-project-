// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {AgentVault} from "../src/AgentVault.sol";
import {AgentShop} from "../src/AgentShop.sol";
import {ShopFactory} from "../src/ShopFactory.sol";
import {Menus} from "./Menus.sol";

/// @notice v3：官方开店工厂 + 新版商家合约（防涨价、申诉仲裁、长度限制）。金库沿用 v2，不需要迁移资金。
///   1. Owner 部署 ShopFactory（绑定 v2 金库、mUSDC、平台仲裁人、最短确认期）
///   2. 商家钱包通过工厂开 5 家店：外卖 / 奶茶咖啡 / 打车 / 诈骗店 / 便利店
///   3. Owner 更新白名单：移出 v2 的 3 家旧店，加入 v3 的 3 家正规店（诈骗店不加；便利店留给演示时现场导入）
///   4. Owner 给平台仲裁人转 0.005 ETH 作为 gas
/// 用法：VAULT_ADDRESS=0x.. USDC_ADDRESS=0x.. OLD_SHOPS=0x..,0x..,0x.. \
///       forge script script/DeployV3.s.sol --rpc-url sepolia --broadcast --verify --slow
contract DeployV3 is Script, Menus {
    /// @dev 演示用的最短确认期。生产环境应设为 1 天以上，给买家足够的时间发现问题并申诉
    uint64 constant MIN_WINDOW = 1 minutes;
    uint64 constant DEMO_WINDOW = 3 minutes;

    function _open(ShopFactory f, string memory name, string memory desc, Menu memory m) internal returns (address) {
        return address(f.createShop(name, desc, DEMO_WINDOW, m.names, m.prices, m.stocks));
    }

    function run() external {
        uint256 ownerPk = vm.envUint("OWNER_PRIVATE_KEY");
        uint256 merchantPk = vm.envUint("MERCHANT_PRIVATE_KEY");
        address platform = vm.envAddress("PLATFORM_ADDRESS");
        AgentVault vault = AgentVault(vm.envAddress("VAULT_ADDRESS"));
        address[] memory oldShops = vm.envAddress("OLD_SHOPS", ",");

        vm.startBroadcast(ownerPk);
        ShopFactory factory = new ShopFactory(vm.envAddress("USDC_ADDRESS"), address(vault), platform, MIN_WINDOW);
        vm.stopBroadcast();

        vm.startBroadcast(merchantPk);
        address food = _open(factory, unicode"饭点到·家常小厨", unicode"家常快餐，30 分钟送达", foodMenu());
        address tea = _open(factory, unicode"一点甜·奶茶咖啡", unicode"现做奶茶咖啡，20 分钟送达", teaMenu());
        address ride = _open(factory, unicode"快到·打车", unicode"经济型网约车，司机约 3 分钟到达", rideMenu());
        address deals = _open(factory, unicode"天天特价·首单1折", DEALS_NOTICE, dealsMenu());
        address store = _open(factory, unicode"小卖部·便利店", unicode"饮料零食日用品，10 分钟送达", storeMenu());
        vm.stopBroadcast();

        vm.startBroadcast(ownerPk);
        for (uint256 i; i < oldShops.length; i++) {
            if (vault.isMerchant(oldShops[i])) vault.setMerchant(oldShops[i], false);
        }
        vault.setMerchant(food, true);
        vault.setMerchant(tea, true);
        vault.setMerchant(ride, true);
        if (platform.balance < 0.002 ether) payable(platform).transfer(0.005 ether);
        vm.stopBroadcast();

        console.log("ShopFactory  :", address(factory));
        console.log("shop food    :", food);
        console.log("shop tea     :", tea);
        console.log("shop ride    :", ride);
        console.log("shop deals   :", deals);
        console.log("shop store   :", store);
    }
}
