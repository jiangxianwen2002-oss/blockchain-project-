// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../../src/MockUSDC.sol";
import {AgentVault} from "../../src/AgentVault.sol";

/// @notice 模拟“现实世界”：AI 代理乱付款（含被骗付给攻击者）、时间流逝、用户存取款/审批/暂停。
///         Foundry 会随机调用这些函数成千上万次，每次之后检查不变量。
contract Handler is Test {
    MockUSDC public usdc;
    AgentVault public vault;
    address public owner;
    address public agent;
    address public merchant;
    address public attacker;
    uint128 public constant DAILY = 100e6;

    // 影子账本（ghost variables）
    uint256 public ghostDeposited;
    uint256 public ghostWithdrawn;
    uint256 public ghostPaid;
    mapping(uint64 => uint256) public directPaidOnDay;
    uint64[] public daysSeen;
    uint256[] public pendingIds;

    constructor(MockUSDC u, AgentVault v, address o, address a, address m, address x) {
        usdc = u;
        vault = v;
        owner = o;
        agent = a;
        merchant = m;
        attacker = x;
    }

    function agentPay(uint128 amount, bool toAttacker) external {
        amount = uint128(bound(amount, 1, 200e6));
        address to = toAttacker ? attacker : merchant;
        vm.prank(agent);
        try vault.pay(to, amount, "inv") returns (bool executed, uint256 id) {
            if (executed) {
                uint64 day = uint64(block.timestamp / 1 days);
                if (directPaidOnDay[day] == 0) daysSeen.push(day);
                directPaidOnDay[day] += amount;
                ghostPaid += amount;
            } else {
                pendingIds.push(id);
            }
        } catch {}
    }

    function ownerApprove(uint256 idx) external {
        if (pendingIds.length == 0) return;
        uint256 id = pendingIds[idx % pendingIds.length];
        uint256 amt = vault.getRequest(id).amount;
        vm.prank(owner);
        try vault.approveRequest(id) {
            ghostPaid += amt;
        } catch {}
    }

    function ownerReject(uint256 idx) external {
        if (pendingIds.length == 0) return;
        vm.prank(owner);
        try vault.rejectRequest(pendingIds[idx % pendingIds.length]) {} catch {}
    }

    function ownerDeposit(uint256 amount) external {
        amount = bound(amount, 1, 300e6);
        deal(address(usdc), owner, amount);
        vm.startPrank(owner);
        usdc.approve(address(vault), amount);
        vault.deposit(amount);
        vm.stopPrank();
        ghostDeposited += amount;
    }

    function ownerWithdraw(uint256 amount) external {
        uint256 bal = vault.balance();
        if (bal == 0) return;
        amount = bound(amount, 1, bal);
        vm.prank(owner);
        vault.withdraw(owner, amount);
        ghostWithdrawn += amount;
    }

    function togglePause() external {
        vm.startPrank(owner);
        if (vault.paused()) vault.unpause();
        else vault.pause();
        vm.stopPrank();
    }

    function warp(uint256 secs) external {
        vm.warp(block.timestamp + bound(secs, 1, 12 hours));
    }

    function daysCount() external view returns (uint256) {
        return daysSeen.length;
    }
}

contract AgentVaultInvariantTest is Test {
    MockUSDC usdc;
    AgentVault vault;
    Handler handler;

    address owner = makeAddr("owner");
    address agent = makeAddr("agent");
    address merchant = makeAddr("merchant");
    address attacker = makeAddr("attacker");
    uint256 initialDeposit = 500e6;

    function setUp() public {
        vm.warp(1_800_000_000);
        usdc = new MockUSDC();
        vault = new AgentVault(address(usdc), owner);

        deal(address(usdc), owner, initialDeposit);
        vm.startPrank(owner);
        usdc.approve(address(vault), initialDeposit);
        vault.deposit(initialDeposit);
        vault.setAgent(agent, 100e6, 30e6, type(uint64).max);
        vault.setMerchant(merchant, true);
        vm.stopPrank();

        handler = new Handler(usdc, vault, owner, agent, merchant, attacker);
        targetContract(address(handler));
    }

    /// 不变量 1：任何一天，代理自动付出的钱 ≤ 每日额度
    function invariant_DailyLimitNeverExceeded() public view {
        uint256 n = handler.daysCount();
        for (uint256 i; i < n; i++) {
            assertLe(handler.directPaidOnDay(handler.daysSeen(i)), handler.DAILY());
        }
    }

    /// 不变量 2：账目守恒 —— 余额 = 存入 − 取出 − 付款
    function invariant_Accounting() public view {
        assertEq(
            vault.balance(),
            initialDeposit + handler.ghostDeposited() - handler.ghostWithdrawn() - handler.ghostPaid()
        );
    }

    /// 不变量 3：攻击者（非白名单）永远收不到一分钱
    function invariant_AttackerNeverPaid() public view {
        assertEq(usdc.balanceOf(attacker), 0);
    }

    /// 不变量 4：所有权永远不会被代理或任何人改变
    function invariant_OwnerUnchanged() public view {
        assertEq(vault.owner(), owner);
    }
}
