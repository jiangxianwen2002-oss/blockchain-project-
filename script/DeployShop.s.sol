// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {AgentShop} from "../src/AgentShop.sol";
import {ShopFactory} from "../src/ShopFactory.sol";

/// @notice 商家开一家新店：通过官方工厂 ShopFactory 创建 AgentShop（店主 = 商家钱包）。
///         工厂固定了金库、币种、仲裁人和最短确认期，商家改不了代码。
///         部署后它还不在白名单里，需要金库主人在控制台 → 商家白名单 → "添加商家" 里导入。
/// 用法（价格单位是"分"，即 0.01 mUSDC；350 = 3.50）：
///   SHOP_NAME="小卖部·便利店" SHOP_DESC="饮料零食，10 分钟送达" \
///   ITEM_NAMES="矿泉水,可乐,薯片,三明治" ITEM_PRICES="300,450,800,1500" \
///   FACTORY_ADDRESS=0x.. forge script script/DeployShop.s.sol --rpc-url sepolia --broadcast --verify
/// 需要 .env 里的 MERCHANT_PRIVATE_KEY（店主），以及 FACTORY_ADDRESS（官方工厂地址）
contract DeployShop is Script {
    function run() external returns (AgentShop shop) {
        uint256 pk = vm.envUint("MERCHANT_PRIVATE_KEY");
        address merchant = vm.addr(pk);
        string[] memory names = vm.envString("ITEM_NAMES", ",");
        uint256[] memory cents = vm.envUint("ITEM_PRICES", ",");
        require(names.length == cents.length && names.length > 0, "ITEM_NAMES / ITEM_PRICES length mismatch");

        uint128[] memory prices = new uint128[](names.length);
        uint32[] memory stocks = new uint32[](names.length);
        for (uint256 i; i < names.length; i++) {
            // forge-lint: disable-next-line(unsafe-typecast)
            prices[i] = uint128(cents[i] * 1e4); // 1 分 = 0.01 mUSDC = 1e4（6 位小数）
            stocks[i] = 999;
        }

        vm.startBroadcast(pk);
        shop = ShopFactory(vm.envAddress("FACTORY_ADDRESS")).createShop(
            vm.envString("SHOP_NAME"),
            vm.envOr("SHOP_DESC", string("")),
            uint64(vm.envOr("CONFIRM_WINDOW", uint256(1 days))),
            names,
            prices,
            stocks
        );
        vm.stopBroadcast();

        console.log("AgentShop:", address(shop));
        console.log("owner    :", merchant);
        console.log("items    :", names.length);
    }
}
