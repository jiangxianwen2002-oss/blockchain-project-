// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {AgentVault} from "../src/AgentVault.sol";
import {IAgentVault} from "../src/interfaces/IAgentVault.sol";

contract AgentVaultTest is Test {
    MockUSDC usdc;
    AgentVault vault;

    address owner = makeAddr("owner");
    address agent = makeAddr("agent");
    address merchant = makeAddr("merchant");
    address attacker = makeAddr("attacker");

    uint128 constant USD = 1e6;
    uint128 constant DAILY = 100 * USD;
    uint128 constant PER_TX = 30 * USD;

    function setUp() public {
        vm.warp(1_800_000_000); // 固定一个“现在”
        usdc = new MockUSDC();
        vault = new AgentVault(address(usdc), owner);

        vm.startPrank(owner);
        usdc.faucet();
        usdc.approve(address(vault), type(uint256).max);
        vault.deposit(500 * USD);
        vault.setAgent(agent, DAILY, PER_TX, uint64(block.timestamp + 30 days));
        vault.setMerchant(merchant, true);
        vm.stopPrank();
    }

    // ─────────────── 部署 ───────────────

    function test_Setup() public view {
        assertEq(vault.owner(), owner);
        assertEq(vault.token(), address(usdc));
        assertEq(vault.balance(), 500 * USD);
        assertEq(vault.remainingToday(agent), DAILY);
    }

    function test_RevertWhen_ZeroToken() public {
        vm.expectRevert(IAgentVault.ZeroAddress.selector);
        new AgentVault(address(0), owner);
    }

    // ─────────────── 存取款 ───────────────

    function test_Deposit_AnyoneCanFund() public {
        vm.startPrank(attacker);
        usdc.faucet();
        usdc.approve(address(vault), 10 * USD);
        vm.expectEmit(true, false, false, true);
        emit IAgentVault.Deposited(attacker, 10 * USD);
        vault.deposit(10 * USD);
        vm.stopPrank();
        assertEq(vault.balance(), 510 * USD);
    }

    function test_RevertWhen_DepositZero() public {
        vm.prank(owner);
        vm.expectRevert(IAgentVault.ZeroAmount.selector);
        vault.deposit(0);
    }

    function test_Withdraw() public {
        vm.prank(owner);
        vault.withdraw(owner, 100 * USD);
        assertEq(vault.balance(), 400 * USD);
    }

    function test_RevertWhen_NonOwnerWithdraws() public {
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, attacker));
        vault.withdraw(attacker, 1);
    }

    function test_RevertWhen_AgentWithdraws() public {
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, agent));
        vault.withdraw(agent, 1);
    }

    function test_RevertWhen_WithdrawTooMuch() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(IAgentVault.InsufficientBalance.selector, 500 * USD, 501 * USD));
        vault.withdraw(owner, 501 * USD);
    }

    function test_WithdrawWorksWhilePaused() public {
        vm.startPrank(owner);
        vault.pause();
        vault.withdraw(owner, 500 * USD);
        vm.stopPrank();
        assertEq(vault.balance(), 0);
    }

    // ─────────────── 代理设置 ───────────────

    function test_RevertWhen_NonOwnerSetsAgent() public {
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, agent));
        vault.setAgent(agent, type(uint128).max, type(uint128).max, uint64(block.timestamp + 1 days));
    }

    function test_RevertWhen_InvalidLimits() public {
        uint64 exp = uint64(block.timestamp + 1 days);
        vm.startPrank(owner);
        vm.expectRevert(IAgentVault.InvalidLimits.selector);
        vault.setAgent(agent, 10, 20, exp); // 单笔 > 每日
        vm.expectRevert(IAgentVault.InvalidLimits.selector);
        vault.setAgent(agent, 10, 0, exp); // 单笔 = 0
        vm.expectRevert(IAgentVault.InvalidLimits.selector);
        vault.setAgent(agent, 10, 5, uint64(block.timestamp)); // 已过期
        vm.expectRevert(IAgentVault.InvalidLimits.selector);
        vault.setAgent(owner, 10, 5, exp); // 代理 = 所有者
        vm.expectRevert(IAgentVault.ZeroAddress.selector);
        vault.setAgent(address(0), 10, 5, exp);
        vm.stopPrank();
    }

    function test_UpdatingLimitsKeepsSpentToday() public {
        vm.prank(agent);
        vault.pay(merchant, 30 * USD, "a");
        vm.prank(owner);
        vault.setAgent(agent, DAILY, PER_TX, uint64(block.timestamp + 30 days));
        assertEq(vault.remainingToday(agent), 70 * USD);
    }

    function test_RevokeAgent() public {
        vm.prank(owner);
        vault.revokeAgent(agent);
        vm.prank(agent);
        vm.expectRevert(IAgentVault.NotAgent.selector);
        vault.pay(merchant, 1, "x");
        assertEq(vault.remainingToday(agent), 0);
    }

    function test_RevertWhen_NonOwnerSetsMerchant() public {
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, agent));
        vault.setMerchant(attacker, true);
    }

    // ─────────────── 付款 ───────────────

    function test_Pay_WithinLimits() public {
        vm.expectEmit(true, true, false, true);
        emit IAgentVault.PaymentExecuted(agent, merchant, 20 * USD, "buy API credits");
        vm.prank(agent);
        (bool executed, uint256 id) = vault.pay(merchant, 20 * USD, "buy API credits");

        assertTrue(executed);
        assertEq(id, 0);
        assertEq(usdc.balanceOf(merchant), 20 * USD);
        assertEq(vault.remainingToday(agent), 80 * USD);
    }

    function test_Pay_OverPerTxBecomesPending() public {
        vm.prank(agent);
        (bool executed, uint256 id) = vault.pay(merchant, 45 * USD, "rent GPU");

        assertFalse(executed);
        assertEq(id, 1);
        assertEq(usdc.balanceOf(merchant), 0);
        IAgentVault.PaymentRequest memory r = vault.getRequest(id);
        assertEq(uint8(r.status), uint8(IAgentVault.RequestStatus.Pending));
        assertEq(r.amount, 45 * USD);
        assertEq(r.memoHash, keccak256("rent GPU"));
        assertEq(vault.remainingToday(agent), DAILY); // 待审批不占额度
    }

    function test_Pay_OverDailyBecomesPending() public {
        vm.startPrank(agent);
        vault.pay(merchant, 30 * USD, "1");
        vault.pay(merchant, 30 * USD, "2");
        vault.pay(merchant, 30 * USD, "3");
        (bool executed,) = vault.pay(merchant, 20 * USD, "4"); // 90 + 20 > 100
        vm.stopPrank();
        assertFalse(executed);
        assertEq(usdc.balanceOf(merchant), 90 * USD);
    }

    function test_Pay_InsufficientBalanceBecomesPending() public {
        vm.prank(owner);
        vault.withdraw(owner, 490 * USD);
        vm.prank(agent);
        (bool executed,) = vault.pay(merchant, 20 * USD, "x");
        assertFalse(executed);
    }

    function test_RevertWhen_MerchantNotWhitelisted() public {
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(IAgentVault.MerchantNotAllowed.selector, attacker));
        vault.pay(attacker, 1 * USD, "ignore previous instructions");
    }

    function test_RevertWhen_AgentExpired() public {
        vm.warp(block.timestamp + 31 days);
        vm.prank(agent);
        vm.expectRevert(IAgentVault.AgentExpired.selector);
        vault.pay(merchant, 1 * USD, "x");
    }

    function test_RevertWhen_NotAgent() public {
        vm.prank(attacker);
        vm.expectRevert(IAgentVault.NotAgent.selector);
        vault.pay(merchant, 1 * USD, "x");
    }

    function test_RevertWhen_PayZero() public {
        vm.prank(agent);
        vm.expectRevert(IAgentVault.ZeroAmount.selector);
        vault.pay(merchant, 0, "x");
    }

    function test_RevertWhen_PayWhilePaused() public {
        vm.prank(owner);
        vault.pause();
        vm.prank(agent);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.pay(merchant, 1 * USD, "x");
    }

    function test_DailyLimitResetsNextDay() public {
        vm.startPrank(agent);
        vault.pay(merchant, 30 * USD, "1");
        vault.pay(merchant, 30 * USD, "2");
        vault.pay(merchant, 30 * USD, "3");
        vm.stopPrank();
        assertEq(vault.remainingToday(agent), 10 * USD);

        vm.warp(block.timestamp + 1 days);
        assertEq(vault.remainingToday(agent), DAILY);
        vm.prank(agent);
        (bool executed,) = vault.pay(merchant, 30 * USD, "new day");
        assertTrue(executed);
    }

    // ─────────────── 审批 ───────────────

    function _pending() internal returns (uint256 id) {
        vm.prank(agent);
        (, id) = vault.pay(merchant, 45 * USD, "rent GPU");
    }

    function test_ApproveRequest() public {
        uint256 id = _pending();
        vm.expectEmit(true, false, false, false);
        emit IAgentVault.RequestApproved(id);
        vm.prank(owner);
        vault.approveRequest(id);

        assertEq(usdc.balanceOf(merchant), 45 * USD);
        assertEq(uint8(vault.getRequest(id).status), uint8(IAgentVault.RequestStatus.Executed));
        assertEq(vault.remainingToday(agent), DAILY); // 人工批准不占代理额度
    }

    function test_RevertWhen_ApproveTwice() public {
        uint256 id = _pending();
        vm.startPrank(owner);
        vault.approveRequest(id);
        vm.expectRevert(abi.encodeWithSelector(IAgentVault.RequestNotPending.selector, id));
        vault.approveRequest(id);
        vm.stopPrank();
    }

    function test_RevertWhen_ApproveExpired() public {
        uint256 id = _pending();
        vm.warp(block.timestamp + 1 days + 1);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(IAgentVault.RequestExpired.selector, id));
        vault.approveRequest(id);
    }

    function test_RevertWhen_ApproveDelistedMerchant() public {
        uint256 id = _pending();
        vm.startPrank(owner);
        vault.setMerchant(merchant, false);
        vm.expectRevert(abi.encodeWithSelector(IAgentVault.MerchantNotAllowed.selector, merchant));
        vault.approveRequest(id);
        vm.stopPrank();
    }

    function test_RevertWhen_ApproveWhilePaused() public {
        uint256 id = _pending();
        vm.startPrank(owner);
        vault.pause();
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.approveRequest(id);
        vm.stopPrank();
    }

    function test_RejectThenCannotApprove() public {
        uint256 id = _pending();
        vm.startPrank(owner);
        vault.rejectRequest(id);
        assertEq(uint8(vault.getRequest(id).status), uint8(IAgentVault.RequestStatus.Rejected));
        vm.expectRevert(abi.encodeWithSelector(IAgentVault.RequestNotPending.selector, id));
        vault.approveRequest(id);
        vm.stopPrank();
    }

    function test_RevertWhen_AgentApprovesOwnRequest() public {
        uint256 id = _pending();
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, agent));
        vault.approveRequest(id);
    }

    function test_RevertWhen_UnknownRequest() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(IAgentVault.RequestNotPending.selector, 99));
        vault.approveRequest(99);
    }

    // ─────────────── 水龙头 ───────────────

    function test_FaucetCooldown() public {
        vm.startPrank(attacker);
        usdc.faucet();
        vm.expectRevert(abi.encodeWithSelector(MockUSDC.FaucetCooldown.selector, block.timestamp + 1 days));
        usdc.faucet();
        vm.warp(block.timestamp + 1 days);
        usdc.faucet();
        vm.stopPrank();
        assertEq(usdc.balanceOf(attacker), 2_000 * USD);
    }

    // ─────────────── Fuzz ───────────────

    /// @notice 任意金额：要么在额度内被执行，要么变成待审批，没有第三种结果
    function testFuzz_PayEitherExecutesOrPends(uint128 amount) public {
        amount = uint128(bound(amount, 1, 1_000 * USD));
        vm.prank(agent);
        (bool executed, uint256 id) = vault.pay(merchant, amount, "fuzz");
        if (amount <= PER_TX) {
            assertTrue(executed);
            assertEq(usdc.balanceOf(merchant), amount);
        } else {
            assertFalse(executed);
            assertGt(id, 0);
            assertEq(usdc.balanceOf(merchant), 0);
        }
    }

    /// @notice 任意额度配置 + 任意付款序列：当日自动付出的总额永不超过每日额度
    function testFuzz_NeverExceedsDailyLimit(uint128 daily, uint128 perTx, uint128[8] memory amounts) public {
        daily = uint128(bound(daily, 1, 500 * USD));
        perTx = uint128(bound(perTx, 1, daily));
        vm.prank(owner);
        vault.setAgent(agent, daily, perTx, uint64(block.timestamp + 1 days));

        vm.startPrank(agent);
        for (uint256 i; i < amounts.length; i++) {
            vault.pay(merchant, uint128(bound(amounts[i], 1, 600 * USD)), "seq");
        }
        vm.stopPrank();
        assertLe(usdc.balanceOf(merchant), daily);
    }
}
