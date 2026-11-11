// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {AgentVault} from "../src/AgentVault.sol";
import {AgentShop} from "../src/AgentShop.sol";
import {IAgentVault} from "../src/interfaces/IAgentVault.sol";
import {IPaymentReceiver} from "../src/interfaces/IPaymentReceiver.sol";

/// @dev 返回错误 selector 的"假商家合约"
contract BadReceiver is IPaymentReceiver {
    function onAgentPayment(address, uint256, string calldata) external pure returns (bytes4) {
        return 0xdeadbeef;
    }

    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == type(IPaymentReceiver).interfaceId || id == type(IERC165).interfaceId;
    }
}

/// @dev 收到付款通知时试图重入金库、再付一次款的恶意商家合约
contract ReentrantReceiver is IPaymentReceiver {
    AgentVault public vault;

    constructor(AgentVault v) {
        vault = v;
    }

    function onAgentPayment(address, uint256, string calldata) external returns (bytes4) {
        vault.pay(address(this), 1e6, "again");
        return IPaymentReceiver.onAgentPayment.selector;
    }

    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == type(IPaymentReceiver).interfaceId || id == type(IERC165).interfaceId;
    }
}

contract AgentShopTest is Test {
    MockUSDC usdc;
    AgentVault vault;
    AgentShop shop;

    address owner = makeAddr("owner");
    address agent = makeAddr("agent");
    address agent2 = makeAddr("agent2");
    address merchant = makeAddr("merchant");
    address attacker = makeAddr("attacker");
    address arbiter = makeAddr("arbiter");

    uint128 constant USD = 1e6;
    uint64 constant CONFIRM = 3 minutes;

    function setUp() public {
        vm.warp(1_800_000_000);
        usdc = new MockUSDC();
        vault = new AgentVault(address(usdc), owner);

        string[] memory names = new string[](3);
        uint128[] memory prices = new uint128[](3);
        uint32[] memory stocks = new uint32[](3);
        (names[0], prices[0], stocks[0]) = ("tomato beef rice", 22 * USD, 50);
        (names[1], prices[1], stocks[1]) = ("iced tea", 4 * USD, 100);
        (names[2], prices[2], stocks[2]) = ("hotpot", 28 * USD, 2);
        shop = new AgentShop(
            AgentShop.ShopConfig(address(usdc), address(vault), merchant, arbiter, CONFIRM, "food", "desc"), names, prices, stocks
        );

        vm.startPrank(owner);
        usdc.faucet();
        usdc.approve(address(vault), type(uint256).max);
        vault.deposit(500 * USD);
        vault.setAgent(agent, 100 * USD, 30 * USD, uint64(block.timestamp + 30 days));
        vault.setAgent(agent2, 100 * USD, 30 * USD, uint64(block.timestamp + 30 days));
        vault.setMerchant(address(shop), true);
        vm.stopPrank();
    }

    // ─────────────── 工具 ───────────────

    function _order(uint32 item, uint32 qty) internal returns (uint256 id) {
        uint32[] memory ids = new uint32[](1);
        uint32[] memory qs = new uint32[](1);
        ids[0] = item;
        qs[0] = qty;
        vm.prank(agent);
        id = shop.createOrder(ids, qs, type(uint256).max);
    }

    function _memo(uint256 id) internal pure returns (string memory) {
        return string.concat("order:", vm.toString(id));
    }

    function _status(uint256 id) internal view returns (AgentShop.OrderStatus) {
        (AgentShop.Order memory o,) = shop.getOrder(id);
        return o.status;
    }

    function _paidOrder() internal returns (uint256 id) {
        id = _order(0, 1); // 22
        vm.prank(agent);
        vault.pay(address(shop), 22 * USD, _memo(id));
    }

    // ─────────────── 下单 ───────────────

    function test_Setup() public view {
        assertTrue(shop.supportsInterface(type(IPaymentReceiver).interfaceId));
        assertEq(shop.itemCount(), 3);
        assertEq(shop.owner(), merchant);
        assertEq(shop.vault(), address(vault));
    }

    function test_CreateOrder_PriceFromChain() public {
        uint32[] memory ids = new uint32[](2);
        uint32[] memory qs = new uint32[](2);
        (ids[0], qs[0], ids[1], qs[1]) = (0, 1, 1, 2);
        vm.prank(agent);
        uint256 id = shop.createOrder(ids, qs, type(uint256).max);
        (AgentShop.Order memory o, AgentShop.Line[] memory lines) = shop.getOrder(id);
        assertEq(o.total, 30 * USD); // 22 + 4×2，由合约计算
        assertEq(o.buyer, agent);
        assertEq(uint8(o.status), uint8(AgentShop.OrderStatus.Created));
        assertEq(lines.length, 2);
        assertEq(shop.getItem(1).stock, 100, "unpaid order does not reserve stock");
    }

    function test_RevertWhen_CreateOrderBadInput() public {
        uint32[] memory ids = new uint32[](1);
        uint32[] memory qs = new uint32[](1);
        (ids[0], qs[0]) = (9, 1);
        vm.expectRevert(abi.encodeWithSelector(AgentShop.ItemUnavailable.selector, 9));
        shop.createOrder(ids, qs, type(uint256).max);

        (ids[0], qs[0]) = (0, 0);
        vm.expectRevert(AgentShop.BadOrder.selector);
        shop.createOrder(ids, qs, type(uint256).max);

        (ids[0], qs[0]) = (2, 3);
        vm.expectRevert(abi.encodeWithSelector(AgentShop.OutOfStock.selector, 2, 2, 3));
        shop.createOrder(ids, qs, type(uint256).max);
    }

    // ─────────────── 买入：付款进托管 ───────────────

    function test_Pay_MovesFundsIntoEscrow() public {
        uint256 id = _order(0, 1);
        vm.prank(agent);
        (bool executed,) = vault.pay(address(shop), 22 * USD, _memo(id));
        assertTrue(executed);
        assertEq(uint8(_status(id)), uint8(AgentShop.OrderStatus.Paid));
        assertEq(shop.escrowed(), 22 * USD);
        assertEq(shop.withdrawable(), 0);
        assertEq(usdc.balanceOf(address(shop)), 22 * USD);
        assertEq(vault.balance(), 478 * USD);
        assertEq(shop.getItem(0).stock, 49);
    }

    function test_RevertWhen_PayWrongAmount_NothingMoves() public {
        uint256 id = _order(0, 1);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AgentShop.WrongAmount.selector, 22 * USD, 5 * USD));
        vault.pay(address(shop), 5 * USD, _memo(id));
        assertEq(vault.balance(), 500 * USD, "whole payment rolled back");
        assertEq(vault.remainingToday(agent), 100 * USD, "daily usage rolled back too");
    }

    function test_RevertWhen_PayBadMemoOrUnknownOrder() public {
        vm.startPrank(agent);
        vm.expectRevert(AgentShop.BadMemo.selector);
        vault.pay(address(shop), 22 * USD, "lunch");
        vm.expectRevert(AgentShop.BadMemo.selector);
        vault.pay(address(shop), 22 * USD, "order:1x");
        vm.expectRevert(abi.encodeWithSelector(AgentShop.WrongStatus.selector, 77, AgentShop.OrderStatus.None));
        vault.pay(address(shop), 22 * USD, "order:77");
        vm.stopPrank();
    }

    function test_RevertWhen_PayTwice() public {
        uint256 id = _paidOrder();
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AgentShop.WrongStatus.selector, id, AgentShop.OrderStatus.Paid));
        vault.pay(address(shop), 22 * USD, _memo(id));
    }

    function test_RevertWhen_PayOtherAgentsOrder() public {
        uint256 id = _order(0, 1); // agent 的订单
        vm.prank(agent2);
        vm.expectRevert(abi.encodeWithSelector(AgentShop.WrongBuyer.selector, agent, agent2));
        vault.pay(address(shop), 22 * USD, _memo(id));
    }

    function test_RevertWhen_OrderExpired() public {
        uint256 id = _order(0, 1);
        vm.warp(block.timestamp + 1 days + 1);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AgentShop.OrderExpired.selector, id));
        vault.pay(address(shop), 22 * USD, _memo(id));
    }

    function test_RevertWhen_StockRunsOutBeforePayment() public {
        uint256 a = _order(2, 2); // 两单都想要 2 份香锅，库存只有 2
        uint256 b = _order(2, 2);
        // 56 超过单笔上限会进审批；这里放宽额度，直接测库存
        vm.prank(owner);
        vault.setAgent(agent, 200 * USD, 100 * USD, uint64(block.timestamp + 1 days));
        vm.startPrank(agent);
        vault.pay(address(shop), 56 * USD, _memo(a));
        vm.expectRevert(abi.encodeWithSelector(AgentShop.OutOfStock.selector, 2, 0, 2));
        vault.pay(address(shop), 56 * USD, _memo(b));
        vm.stopPrank();
    }

    function test_RevertWhen_NotVaultCallsHook() public {
        uint256 id = _order(0, 1);
        // 攻击者自己转钱进来，再冒充金库调用回调，想把订单标成已付
        vm.startPrank(attacker);
        usdc.faucet();
        usdc.transfer(address(shop), 22 * USD);
        vm.expectRevert(AgentShop.NotVault.selector);
        shop.onAgentPayment(agent, 22 * USD, _memo(id));
        vm.stopPrank();
        assertEq(uint8(_status(id)), uint8(AgentShop.OrderStatus.Created));
    }

    // ─────────────── 超额：审批通过后才付款 ───────────────

    function test_OverLimit_ApproveMarksOrderPaid() public {
        uint256 id = _order(1, 10); // 40 > 单笔 30
        vm.prank(agent);
        (bool executed, uint256 reqId) = vault.pay(address(shop), 40 * USD, _memo(id));
        assertFalse(executed);
        assertEq(uint8(_status(id)), uint8(AgentShop.OrderStatus.Created), "still unpaid while pending");
        assertEq(vault.getRequestMemo(reqId), _memo(id));

        vm.prank(owner);
        vault.approveRequest(reqId);
        assertEq(uint8(_status(id)), uint8(AgentShop.OrderStatus.Paid));
        assertEq(shop.escrowed(), 40 * USD);
    }

    function test_OverLimit_ApproveRevertsIfOrderCancelled() public {
        uint256 id = _order(1, 10);
        vm.prank(agent);
        (, uint256 reqId) = vault.pay(address(shop), 40 * USD, _memo(id));
        vm.prank(agent);
        shop.cancelOrder(id);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(AgentShop.WrongStatus.selector, id, AgentShop.OrderStatus.Cancelled));
        vault.approveRequest(reqId);
        assertEq(vault.balance(), 500 * USD);
    }

    // ─────────────── 发货 / 放款 ───────────────

    function test_Deliver_Confirm_Withdraw() public {
        uint256 id = _paidOrder();
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, attacker));
        shop.markDelivered(id);

        vm.prank(merchant);
        shop.markDelivered(id);

        vm.prank(attacker);
        vm.expectRevert(AgentShop.NotAuthorized.selector);
        shop.confirmReceived(id);

        vm.prank(owner); // 金库主人替 AI 确认收货
        shop.confirmReceived(id);
        assertEq(uint8(_status(id)), uint8(AgentShop.OrderStatus.Completed));
        assertEq(shop.escrowed(), 0);
        assertEq(shop.withdrawable(), 22 * USD);

        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, attacker));
        shop.withdraw(attacker);

        vm.prank(merchant);
        shop.withdraw(merchant);
        assertEq(usdc.balanceOf(merchant), 22 * USD);
        assertEq(shop.withdrawable(), 0);
    }

    function test_AgentCanConfirm() public {
        uint256 id = _paidOrder();
        vm.prank(merchant);
        shop.markDelivered(id);
        vm.prank(agent);
        shop.confirmReceived(id);
        assertEq(uint8(_status(id)), uint8(AgentShop.OrderStatus.Completed));
    }

    function test_AutoReleaseAfterWindow() public {
        uint256 id = _paidOrder();
        vm.prank(merchant);
        shop.markDelivered(id);
        vm.expectRevert(abi.encodeWithSelector(AgentShop.TooEarly.selector, block.timestamp + CONFIRM));
        shop.release(id);
        vm.warp(block.timestamp + CONFIRM);
        vm.prank(attacker); // 任何人都能触发，但钱只会进商家的可提现余额
        shop.release(id);
        assertEq(shop.withdrawable(), 22 * USD);
    }

    // ─────────────── 退款（卖出）───────────────

    function test_BuyerRefundBeforeDelivery_MoneyBackToVault() public {
        uint256 id = _paidOrder();
        assertEq(vault.balance(), 478 * USD);
        vm.prank(agent);
        shop.refund(id);
        assertEq(uint8(_status(id)), uint8(AgentShop.OrderStatus.Refunded));
        assertEq(vault.balance(), 500 * USD, "refunded to vault");
        assertEq(shop.escrowed(), 0);
        assertEq(shop.getItem(0).stock, 50, "stock restored");
    }

    function test_RevertWhen_BuyerRefundAfterDelivery() public {
        uint256 id = _paidOrder();
        vm.prank(merchant);
        shop.markDelivered(id);
        vm.prank(owner);
        vm.expectRevert(AgentShop.NotAuthorized.selector);
        shop.refund(id);
        vm.prank(merchant); // 商家自愿退款可以
        shop.refund(id);
        assertEq(vault.balance(), 500 * USD);
    }

    function test_RevertWhen_StrangerRefunds() public {
        uint256 id = _paidOrder();
        vm.prank(attacker);
        vm.expectRevert(AgentShop.NotAuthorized.selector);
        shop.refund(id);
    }

    function test_RevertWhen_RefundTwice() public {
        uint256 id = _paidOrder();
        vm.prank(agent);
        shop.refund(id);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AgentShop.WrongStatus.selector, id, AgentShop.OrderStatus.Refunded));
        shop.refund(id);
    }

    // ─────────────── 金库回调的边界情况 ───────────────

    function test_NonReceiverContract_PlainTransfer() public {
        // MockUSDC 合约本身不支持 IPaymentReceiver：当作普通收款方，直接转账，不回调
        vm.prank(owner);
        vault.setMerchant(address(usdc), true);
        vm.prank(agent);
        (bool executed,) = vault.pay(address(usdc), 1 * USD, "plain");
        assertTrue(executed);
    }

    function test_RevertWhen_ReceiverReturnsWrongSelector() public {
        BadReceiver bad = new BadReceiver();
        vm.prank(owner);
        vault.setMerchant(address(bad), true);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(IAgentVault.ReceiverRejected.selector, address(bad)));
        vault.pay(address(bad), 1 * USD, "x");
        assertEq(vault.balance(), 500 * USD);
    }

    function test_RevertWhen_ReceiverReenters() public {
        ReentrantReceiver evil = new ReentrantReceiver(vault);
        vm.startPrank(owner);
        vault.setMerchant(address(evil), true);
        vault.setAgent(address(evil), 100 * USD, 30 * USD, uint64(block.timestamp + 1 days));
        vm.stopPrank();
        vm.prank(agent);
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        vault.pay(address(evil), 1 * USD, "x");
        assertEq(vault.balance(), 500 * USD);
    }

    // ─────────────── 商家管理菜单 ───────────────

    function test_MerchantManagesMenu() public {
        vm.startPrank(merchant);
        uint256 id = shop.addItem("noodles", 18 * USD, 10);
        shop.setItem(id, 16 * USD, 5, true);
        shop.setDescription("new");
        shop.setItem(0, 22 * USD, 50, false); // 下架
        vm.stopPrank();
        assertEq(shop.getItem(id).price, 16 * USD);
        assertEq(shop.getItems().length, 4);
        assertEq(shop.description(), "new");

        uint32[] memory ids = new uint32[](1);
        uint32[] memory qs = new uint32[](1);
        (ids[0], qs[0]) = (0, 1);
        vm.expectRevert(abi.encodeWithSelector(AgentShop.ItemUnavailable.selector, 0));
        shop.createOrder(ids, qs, type(uint256).max);

        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, attacker));
        shop.setItem(1, 0, 0, true);
        vm.prank(merchant);
        vm.expectRevert(abi.encodeWithSelector(AgentShop.ItemUnavailable.selector, 99));
        shop.setItem(99, 1, 1, true);
    }

    function test_CancelUnpaidOrder() public {
        uint256 id = _order(0, 1);
        vm.prank(attacker);
        vm.expectRevert(AgentShop.NotAuthorized.selector);
        shop.cancelOrder(id);
        vm.prank(agent);
        shop.cancelOrder(id);
        assertEq(uint8(_status(id)), uint8(AgentShop.OrderStatus.Cancelled));
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AgentShop.WrongStatus.selector, id, AgentShop.OrderStatus.Cancelled));
        shop.cancelOrder(id);
    }

    function test_RevertWhen_DeliverUnpaidOrWithdrawToZero() public {
        uint256 id = _order(0, 1);
        vm.startPrank(merchant);
        vm.expectRevert(abi.encodeWithSelector(AgentShop.WrongStatus.selector, id, AgentShop.OrderStatus.Created));
        shop.markDelivered(id);
        vm.expectRevert(AgentShop.ZeroAddress.selector);
        shop.withdraw(address(0));
        vm.stopPrank();
        vm.expectRevert(abi.encodeWithSelector(AgentShop.WrongStatus.selector, id, AgentShop.OrderStatus.Created));
        shop.release(id);
        vm.expectRevert(abi.encodeWithSelector(AgentShop.WrongStatus.selector, id, AgentShop.OrderStatus.Created));
        shop.confirmReceived(id);
    }

    // ─────────────── v3：防涨价 ───────────────

    function test_RevertWhen_PriceAboveMax() public {
        uint32[] memory ids = new uint32[](1);
        uint32[] memory qs = new uint32[](1);
        (ids[0], qs[0]) = (0, 1);
        // 买家看到的是 22，商家在下单前一刻涨价到 30
        vm.prank(merchant);
        shop.setItem(0, 30 * USD, 50, true);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AgentShop.PriceAboveMax.selector, 30 * USD, 22 * USD));
        shop.createOrder(ids, qs, 22 * USD);
        // 价格没变时，maxTotal 正好等于总价也能下单
        vm.prank(merchant);
        shop.setItem(0, 22 * USD, 50, true);
        vm.prank(agent);
        shop.createOrder(ids, qs, 22 * USD);
    }

    // ─────────────── v3：申诉与仲裁 ───────────────

    function _delivered() internal returns (uint256 id) {
        id = _paidOrder();
        vm.prank(merchant);
        shop.markDelivered(id);
    }

    function test_Dispute_FreezesEscrow() public {
        uint256 id = _delivered();
        vm.prank(agent);
        shop.dispute(id);
        assertEq(uint8(_status(id)), uint8(AgentShop.OrderStatus.Disputed));
        // 过了确认期也不会被自动放款
        vm.warp(block.timestamp + CONFIRM + 1);
        vm.expectRevert(abi.encodeWithSelector(AgentShop.WrongStatus.selector, id, AgentShop.OrderStatus.Disputed));
        shop.release(id);
        assertEq(shop.escrowed(), 22 * USD);
    }

    function test_RevertWhen_DisputeAfterWindow() public {
        uint256 id = _delivered();
        vm.warp(block.timestamp + CONFIRM);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(AgentShop.DisputeWindowClosed.selector, block.timestamp));
        shop.dispute(id);
    }

    function test_RevertWhen_StrangerDisputes() public {
        uint256 id = _delivered();
        vm.prank(attacker);
        vm.expectRevert(AgentShop.NotAuthorized.selector);
        shop.dispute(id);
        vm.prank(merchant); // 商家不能替买家申诉
        vm.expectRevert(AgentShop.NotAuthorized.selector);
        shop.dispute(id);
    }

    function test_Arbiter_RefundsBuyer() public {
        uint256 id = _delivered();
        vm.prank(owner);
        shop.dispute(id);
        vm.prank(attacker);
        vm.expectRevert(AgentShop.NotArbiter.selector);
        shop.resolveDispute(id, true);
        vm.prank(arbiter);
        shop.resolveDispute(id, true);
        assertEq(uint8(_status(id)), uint8(AgentShop.OrderStatus.Refunded));
        assertEq(vault.balance(), 500 * USD, "refunded to vault");
        assertEq(shop.escrowed(), 0);
    }

    function test_Arbiter_ReleasesToMerchant() public {
        uint256 id = _delivered();
        vm.prank(agent);
        shop.dispute(id);
        vm.prank(arbiter);
        shop.resolveDispute(id, false);
        assertEq(uint8(_status(id)), uint8(AgentShop.OrderStatus.Completed));
        assertEq(shop.withdrawable(), 22 * USD);
    }

    function test_RevertWhen_ArbiterTouchesUndisputed() public {
        uint256 id = _delivered();
        vm.prank(arbiter);
        vm.expectRevert(abi.encodeWithSelector(AgentShop.WrongStatus.selector, id, AgentShop.OrderStatus.Delivered));
        shop.resolveDispute(id, true);
    }

    function test_Dispute_MerchantCanRefund_BuyerCanWithdraw() public {
        uint256 a = _delivered();
        vm.prank(agent);
        shop.dispute(a);
        vm.prank(merchant);
        shop.refund(a);
        assertEq(uint8(_status(a)), uint8(AgentShop.OrderStatus.Refunded));

        uint256 b = _delivered();
        vm.prank(agent);
        shop.dispute(b);
        vm.prank(owner); // 买家撤回申诉：直接确认收货
        shop.confirmReceived(b);
        assertEq(uint8(_status(b)), uint8(AgentShop.OrderStatus.Completed));
    }

    // ─────────────── v3：长度 / 数量限制 ───────────────

    function test_RevertWhen_StringsTooLong() public {
        bytes memory long = new bytes(97);
        for (uint256 i; i < long.length; i++) long[i] = "a";
        vm.startPrank(merchant);
        vm.expectRevert(AgentShop.TooLong.selector);
        shop.addItem(string(long), 1, 1);
        vm.expectRevert(AgentShop.TooLong.selector);
        shop.setDescription(string(new bytes(601)));
        vm.stopPrank();
    }

    // ─────────────── Fuzz ───────────────

    /// @dev 任意数量组合：总价一定等于 Σ 单价×数量；只有付对金额才能成交
    function testFuzz_TotalAndExactPayment(uint8 q0, uint8 q1, uint128 payAmount) public {
        q0 = uint8(bound(q0, 0, 5));
        q1 = uint8(bound(q1, 1, 5));
        uint32[] memory ids = new uint32[](2);
        uint32[] memory qs = new uint32[](2);
        (ids[0], qs[0], ids[1], qs[1]) = (0, q0 == 0 ? 1 : q0, 1, q1);
        vm.prank(agent);
        uint256 id = shop.createOrder(ids, qs, type(uint256).max);
        (AgentShop.Order memory o,) = shop.getOrder(id);
        assertEq(o.total, uint128(22 * USD) * qs[0] + uint128(4 * USD) * qs[1]);

        vm.prank(owner);
        vault.setAgent(agent, 1000 * USD, 500 * USD, uint64(block.timestamp + 1 days));
        payAmount = uint128(bound(payAmount, 1, 400 * USD));
        vm.prank(agent);
        if (payAmount == o.total) {
            vault.pay(address(shop), payAmount, _memo(id));
            assertEq(shop.escrowed(), o.total);
        } else {
            vm.expectRevert(abi.encodeWithSelector(AgentShop.WrongAmount.selector, o.total, payAmount));
            vault.pay(address(shop), payAmount, _memo(id));
        }
    }
}
