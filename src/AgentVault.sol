// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ERC165Checker} from "@openzeppelin/contracts/utils/introspection/ERC165Checker.sol";
import {IAgentVault} from "./interfaces/IAgentVault.sol";
import {IPaymentReceiver} from "./interfaces/IPaymentReceiver.sol";

/// @title AgentVault
/// @notice 用户把稳定币存进来，授权 AI 代理在“每日限额 / 单笔限额 / 商家白名单”内自动付款；
///         超额付款进入待审批队列，由用户批准或拒绝；出现异常可一键暂停。
/// @dev 设计说明见 DESIGN.md 与 docs/IMPLEMENTATION.md。
///      v2：付款给商家合约（IPaymentReceiver）时会"转账并通知"，让商家合约把付款和订单绑定。
contract AgentVault is IAgentVault, Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice 待审批请求的有效期，过期后不可再批准
    uint64 public constant REQUEST_TTL = 1 days;

    IERC20 private immutable _token;

    mapping(address => AgentPolicy) private _policies;
    mapping(address => bool) private _merchants;
    mapping(uint256 => PaymentRequest) private _requests;
    /// @dev 待审批请求的完整备注。批准时要把它转交给商家合约（例如 "order:7"），所以 v2 起保存在链上
    mapping(uint256 => string) private _requestMemos;
    uint256 public nextRequestId = 1; // 从 1 开始，0 表示“没有请求”

    modifier onlyAgent() {
        if (!_policies[msg.sender].active) revert NotAgent();
        _;
    }

    constructor(address token_, address owner_) Ownable(owner_) {
        if (token_ == address(0)) revert ZeroAddress();
        _token = IERC20(token_);
    }

    // ─────────────────────────── 用户（owner）操作 ───────────────────────────

    /// @notice 任何人都可以给金库充值（例如家人、公司为 AI 预算充值）
    function deposit(uint256 amount) external override nonReentrant {
        if (amount == 0) revert ZeroAmount();
        _token.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(msg.sender, amount);
    }

    /// @notice 取款。刻意不加 whenNotPaused：暂停时用户必须仍能把钱撤走。
    function withdraw(address to, uint256 amount) external override onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        uint256 bal = balance();
        if (amount > bal) revert InsufficientBalance(bal, amount);
        _token.safeTransfer(to, amount);
        emit Withdrawn(to, amount);
    }

    /// @notice 授权 / 更新一个 AI 代理的额度。更新时保留当日已花，防止“改额度刷新用量”。
    function setAgent(address agent, uint128 dailyLimit, uint128 perTxLimit, uint64 expiresAt)
        external
        override
        onlyOwner
    {
        if (agent == address(0)) revert ZeroAddress();
        if (agent == owner()) revert InvalidLimits(); // 代理与所有者必须分离
        if (perTxLimit == 0 || perTxLimit > dailyLimit) revert InvalidLimits();
        if (expiresAt <= block.timestamp) revert InvalidLimits();

        AgentPolicy storage p = _policies[agent];
        p.active = true;
        p.dailyLimit = dailyLimit;
        p.perTxLimit = perTxLimit;
        p.expiresAt = expiresAt;
        // spentToday / dayIndex 保持不变
        emit AgentSet(agent, dailyLimit, perTxLimit, expiresAt);
    }

    function revokeAgent(address agent) external override onlyOwner {
        _policies[agent].active = false;
        emit AgentRevoked(agent);
    }

    function setMerchant(address merchant, bool allowed) external override onlyOwner {
        if (merchant == address(0)) revert ZeroAddress();
        _merchants[merchant] = allowed;
        emit MerchantSet(merchant, allowed);
    }

    /// @notice 批准一笔超额请求。用户亲自批准，因此不占用代理的每日额度。
    function approveRequest(uint256 requestId) external override nonReentrant onlyOwner whenNotPaused {
        PaymentRequest storage r = _requests[requestId];
        if (r.status != RequestStatus.Pending) revert RequestNotPending(requestId);
        if (block.timestamp > uint256(r.createdAt) + REQUEST_TTL) revert RequestExpired(requestId);
        if (!_merchants[r.merchant]) revert MerchantNotAllowed(r.merchant);
        uint256 bal = balance();
        if (r.amount > bal) revert InsufficientBalance(bal, r.amount);

        // Checks-Effects-Interactions：先改状态，再转账，最后通知商家合约
        r.status = RequestStatus.Executed;
        _token.safeTransfer(r.merchant, r.amount);
        emit RequestApproved(requestId);
        _notifyReceiver(r.merchant, r.agent, r.amount, _requestMemos[requestId]);
    }

    function rejectRequest(uint256 requestId) external override onlyOwner {
        PaymentRequest storage r = _requests[requestId];
        if (r.status != RequestStatus.Pending) revert RequestNotPending(requestId);
        r.status = RequestStatus.Rejected;
        emit RequestRejected(requestId);
    }

    function pause() external override onlyOwner {
        _pause();
    }

    function unpause() external override onlyOwner {
        _unpause();
    }

    // ─────────────────────────── AI 代理操作 ───────────────────────────

    /// @notice AI 代理付款。硬性规则（过期、白名单）直接拒绝；
    ///         额度类规则（单笔、每日、余额）不拒绝，而是转为待审批，交给人类决定。
    function pay(address merchant, uint128 amount, string calldata memo)
        external
        override
        nonReentrant
        onlyAgent
        whenNotPaused
        returns (bool executed, uint256 requestId)
    {
        AgentPolicy storage p = _policies[msg.sender];
        if (block.timestamp >= p.expiresAt) revert AgentExpired();
        if (amount == 0) revert ZeroAmount();
        if (!_merchants[merchant]) revert MerchantNotAllowed(merchant);

        uint64 today = _today();
        if (p.dayIndex != today) {
            p.dayIndex = today;
            p.spentToday = 0;
        }

        bool withinLimits = amount <= p.perTxLimit && uint256(p.spentToday) + amount <= p.dailyLimit
            && amount <= balance();

        if (withinLimits) {
            p.spentToday += amount; // 先记账，再转账
            _token.safeTransfer(merchant, amount);
            emit PaymentExecuted(msg.sender, merchant, amount, memo);
            _notifyReceiver(merchant, msg.sender, amount, memo);
            return (true, 0);
        }

        requestId = nextRequestId++;
        _requests[requestId] = PaymentRequest({
            agent: msg.sender,
            merchant: merchant,
            amount: amount,
            createdAt: uint64(block.timestamp),
            status: RequestStatus.Pending,
            memoHash: keccak256(bytes(memo))
        });
        _requestMemos[requestId] = memo;
        emit PaymentRequested(requestId, msg.sender, merchant, amount, memo);
        return (false, requestId);
    }

    // ─────────────────────────── 只读查询 ───────────────────────────

    function token() external view override returns (address) {
        return address(_token);
    }

    function balance() public view override returns (uint256) {
        return _token.balanceOf(address(this));
    }

    /// @notice 代理今天还能自动花多少（不考虑金库余额）
    function remainingToday(address agent) external view override returns (uint256) {
        AgentPolicy storage p = _policies[agent];
        if (!p.active || block.timestamp >= p.expiresAt) return 0;
        if (p.dayIndex != _today()) return p.dailyLimit;
        return p.dailyLimit > p.spentToday ? p.dailyLimit - p.spentToday : 0;
    }

    function getPolicy(address agent) external view override returns (AgentPolicy memory) {
        return _policies[agent];
    }

    function getRequest(uint256 requestId) external view override returns (PaymentRequest memory) {
        return _requests[requestId];
    }

    function isMerchant(address merchant) external view override returns (bool) {
        return _merchants[merchant];
    }

    function getRequestMemo(uint256 requestId) external view returns (string memory) {
        return _requestMemos[requestId];
    }

    // ─────────────────────────── 内部工具 ───────────────────────────

    /// @dev 收款方是支持 IPaymentReceiver 的商家合约时，转账后通知它（"转账并调用"）。
    ///      商家合约 revert 或返回值不对 → 整笔付款回滚，钱留在金库。
    ///      安全：调用发生在所有状态修改之后（CEI），且 pay / approveRequest 都有 nonReentrant，
    ///      商家合约无法在回调里重入金库。普通地址（EOA）或不支持接口的合约不会被调用。
    function _notifyReceiver(address merchant, address agent, uint256 amount, string memory memo) internal {
        if (!ERC165Checker.supportsInterface(merchant, type(IPaymentReceiver).interfaceId)) return;
        bytes4 ret = IPaymentReceiver(merchant).onAgentPayment(agent, amount, memo);
        if (ret != IPaymentReceiver.onAgentPayment.selector) revert ReceiverRejected(merchant);
    }

    function _today() internal view returns (uint64) {
        // 安全：block.timestamp / 1 days 远小于 uint64 上限
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint64(block.timestamp / 1 days);
    }
}
