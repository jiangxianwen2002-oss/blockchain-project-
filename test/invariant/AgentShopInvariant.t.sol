// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../../src/MockUSDC.sol";
import {AgentVault} from "../../src/AgentVault.sol";
import {AgentShop} from "../../src/AgentShop.sol";

/// @dev 随机执行"下单 / 付款 / 发货 / 确认 / 自动放款 / 退款 / 提现 / 时间流逝"
contract ShopHandler is Test {
    MockUSDC public usdc;
    AgentVault public vault;
    AgentShop public shop;
    address public owner;
    address public agent;
    address public merchant;

    uint256[] public orderIds;

    constructor(MockUSDC u, AgentVault v, AgentShop s, address o, address a, address m) {
        (usdc, vault, shop, owner, agent, merchant) = (u, v, s, o, a, m);
    }

    function _pick(uint256 seed) internal view returns (uint256) {
        if (orderIds.length == 0) return 0;
        return orderIds[seed % orderIds.length];
    }

    function create(uint8 item, uint8 qty) external {
        uint32[] memory ids = new uint32[](1);
        uint32[] memory qs = new uint32[](1);
        ids[0] = uint32(bound(item, 0, 2));
        qs[0] = uint32(bound(qty, 1, 3));
        vm.prank(agent);
        try shop.createOrder(ids, qs, type(uint256).max) returns (uint256 id) {
            orderIds.push(id);
        } catch {}
    }

    function pay(uint256 seed, bool wrongAmount) external {
        uint256 id = _pick(seed);
        if (id == 0) return;
        (AgentShop.Order memory o,) = shop.getOrder(id);
        uint128 amount = wrongAmount ? o.total + 1 : o.total;
        vm.prank(agent);
        try vault.pay(address(shop), amount, string.concat("order:", vm.toString(id))) {} catch {}
    }

    function deliver(uint256 seed) external {
        vm.prank(merchant);
        try shop.markDelivered(_pick(seed)) {} catch {}
    }

    function confirm(uint256 seed, bool byOwner) external {
        vm.prank(byOwner ? owner : agent);
        try shop.confirmReceived(_pick(seed)) {} catch {}
    }

    function release(uint256 seed) external {
        try shop.release(_pick(seed)) {} catch {}
    }

    function refund(uint256 seed, uint8 who) external {
        address caller = who % 3 == 0 ? agent : who % 3 == 1 ? owner : merchant;
        vm.prank(caller);
        try shop.refund(_pick(seed)) {} catch {}
    }

    function dispute(uint256 seed, bool byOwner) external {
        vm.prank(byOwner ? owner : agent);
        try shop.dispute(_pick(seed)) {} catch {}
    }

    function resolve(uint256 seed, bool refundBuyer) external {
        vm.prank(shop.arbiter());
        try shop.resolveDispute(_pick(seed), refundBuyer) {} catch {}
    }

    function withdraw() external {
        vm.prank(merchant);
        shop.withdraw(merchant);
    }

    function warp(uint32 secs) external {
        vm.warp(block.timestamp + bound(secs, 1, 2 hours));
    }

    function orderCount() external view returns (uint256) {
        return orderIds.length;
    }
}

contract AgentShopInvariantTest is Test {
    MockUSDC usdc;
    AgentVault vault;
    AgentShop shop;
    ShopHandler handler;

    address owner = makeAddr("owner");
    address agent = makeAddr("agent");
    address merchant = makeAddr("merchant");
    uint256 constant INITIAL = 1000e6;

    function setUp() public {
        vm.warp(1_800_000_000);
        usdc = new MockUSDC();
        vault = new AgentVault(address(usdc), owner);
        string[] memory names = new string[](3);
        uint128[] memory prices = new uint128[](3);
        uint32[] memory stocks = new uint32[](3);
        (names[0], prices[0], stocks[0]) = ("a", 22e6, 20);
        (names[1], prices[1], stocks[1]) = ("b", 4e6, 30);
        (names[2], prices[2], stocks[2]) = ("c", 15e6, 5);
        shop = new AgentShop(
            AgentShop.ShopConfig(address(usdc), address(vault), merchant, makeAddr("arbiter"), 3 minutes, "s", ""), names, prices, stocks
        );

        vm.startPrank(owner);
        usdc.faucet();
        usdc.approve(address(vault), type(uint256).max);
        vault.deposit(INITIAL);
        vault.setAgent(agent, 1000e6, 100e6, uint64(block.timestamp + 365 days));
        vault.setMerchant(address(shop), true);
        vm.stopPrank();

        handler = new ShopHandler(usdc, vault, shop, owner, agent, merchant);
        targetContract(address(handler));
    }

    /// @notice 托管账本永远和合约里实际的钱对得上
    function invariant_ShopBalanceMatchesBooks() public view {
        assertEq(usdc.balanceOf(address(shop)), shop.escrowed() + shop.withdrawable());
    }

    /// @notice 托管金额 = 所有"已付款 / 已发货 / 申诉中"订单的总额
    function invariant_EscrowEqualsOpenOrders() public view {
        uint256 sum;
        for (uint256 i; i < handler.orderCount(); i++) {
            (AgentShop.Order memory o,) = shop.getOrder(handler.orderIds(i));
            if (o.status == AgentShop.OrderStatus.Paid || o.status == AgentShop.OrderStatus.Delivered || o.status == AgentShop.OrderStatus.Disputed) {
                sum += o.total;
            }
        }
        assertEq(shop.escrowed(), sum);
    }

    /// @notice 钱只在 金库 / 商家合约 / 商家钱包 三处流动，总数不变
    function invariant_MoneyConserved() public view {
        assertEq(vault.balance() + usdc.balanceOf(address(shop)) + usdc.balanceOf(merchant), INITIAL);
    }
}
