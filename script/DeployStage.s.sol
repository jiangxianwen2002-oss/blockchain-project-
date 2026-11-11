// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {AgentVault} from "../src/AgentVault.sol";
import {ShopFactory} from "../src/ShopFactory.sol";
import {Menus} from "./Menus.sol";

/// @notice 一键部署一套全新、干净的系统（正式演示用）：沿用同一个 MockUSDC 和同一批测试钱包，其他合约全部新建。
///   1. Owner：部署新金库 AgentVault + 新的官方开店工厂 ShopFactory（仲裁人 = 平台钱包）
///   2. Owner：给商家钱包转 gas；商家通过工厂开 5 家店（外卖 / 奶茶咖啡 / 打车 / 诈骗店 / 便利店）
///   3. Owner：存入资金、授权 AI 代理额度、把 3 家正规店和外部平台 CloudEats 的收款地址加入白名单
///      （诈骗店不加；便利店留给演示时在控制台现场导入）
/// 用法：USDC_ADDRESS=0x.. forge script script/DeployStage.s.sol --rpc-url sepolia --broadcast --verify --slow
/// 需要 .env：OWNER_PRIVATE_KEY、MERCHANT_PRIVATE_KEY、AGENT_ADDRESS、PLATFORM_ADDRESS、CLOUDEATS_ADDRESS
contract DeployStage is Script, Menus {
    uint64 constant MIN_WINDOW = 1 minutes;
    /// @dev 演示用：送达后 3 分钟没人确认就自动放款（生产环境应为 1 天以上）
    uint64 constant DEMO_WINDOW = 3 minutes;
    uint256 constant FUND = 500 * USD;
    uint128 constant DAILY = 1000 * USD;
    uint128 constant PER_TX = 30 * USD;

    function _open(ShopFactory f, string memory name, string memory desc, Menu memory m) internal returns (address) {
        return address(f.createShop(name, desc, DEMO_WINDOW, m.names, m.prices, m.stocks));
    }

    AgentVault vault;
    ShopFactory factory;
    address food;
    address tea;
    address ride;
    address deals;
    address store;

    function run() external {
        uint256 ownerPk = vm.envUint("OWNER_PRIVATE_KEY");
        _core(ownerPk);
        _shops(vm.envUint("MERCHANT_PRIVATE_KEY"));
        _init(ownerPk);
        console.log("AgentVault   :", address(vault));
        console.log("ShopFactory  :", address(factory));
        console.log("shop food    :", food);
        console.log("shop tea     :", tea);
        console.log("shop ride    :", ride);
        console.log("shop deals   :", deals);
        console.log("shop store   :", store);
        console.log("vault balance:", vault.balance());
    }

    /// @dev 1. 新金库 + 新工厂；给商家钱包转 gas
    function _core(uint256 ownerPk) internal {
        address usdc = vm.envAddress("USDC_ADDRESS");
        address merchant = vm.addr(vm.envUint("MERCHANT_PRIVATE_KEY"));
        vm.startBroadcast(ownerPk);
        vault = new AgentVault(usdc, vm.addr(ownerPk));
        factory = new ShopFactory(usdc, address(vault), vm.envAddress("PLATFORM_ADDRESS"), MIN_WINDOW);
        if (merchant.balance < 0.02 ether) payable(merchant).transfer(0.02 ether);
        vm.stopBroadcast();
    }

    /// @dev 2. 商家通过工厂开 5 家店
    function _shops(uint256 merchantPk) internal {
        vm.startBroadcast(merchantPk);
        food = _open(factory, unicode"饭点到·家常小厨", unicode"家常快餐，30 分钟送达", foodMenu());
        tea = _open(factory, unicode"一点甜·奶茶咖啡", unicode"现做奶茶咖啡，20 分钟送达", teaMenu());
        ride = _open(factory, unicode"快到·打车", unicode"经济型网约车，司机约 3 分钟到达", rideMenu());
        deals = _open(factory, unicode"天天特价·首单1折", DEALS_NOTICE, dealsMenu());
        store = _open(factory, unicode"小卖部·便利店", unicode"饮料零食日用品，10 分钟送达", storeMenu());
        vm.stopBroadcast();
    }

    /// @dev 3. 存钱、授权 AI 额度、白名单（诈骗店不加；便利店留给演示时现场导入）
    function _init(uint256 ownerPk) internal {
        MockUSDC usdc = MockUSDC(vm.envAddress("USDC_ADDRESS"));
        vm.startBroadcast(ownerPk);
        usdc.approve(address(vault), FUND);
        vault.deposit(FUND);
        vault.setAgent(vm.envAddress("AGENT_ADDRESS"), DAILY, PER_TX, uint64(block.timestamp + 30 days));
        vault.setMerchant(food, true);
        vault.setMerchant(tea, true);
        vault.setMerchant(ride, true);
        vault.setMerchant(vm.envAddress("CLOUDEATS_ADDRESS"), true);
        vm.stopBroadcast();
    }
}
