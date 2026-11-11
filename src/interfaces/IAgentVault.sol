// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IAgentVault
/// @notice 用户托管资金、给 AI 代理设置“限额信用卡”的金库接口。
/// @dev 这是框架阶段的接口定义：数据结构、事件、错误、函数签名均已确定，实现见 AgentVault.sol。
interface IAgentVault {
    // ─────────────────────────── 数据结构 ───────────────────────────

    /// @notice 某个 AI 代理的花钱规则 + 当日用量
    struct AgentPolicy {
        bool active;          // 是否已授权
        uint64 expiresAt;     // 授权到期时间（unix 秒）
        uint128 dailyLimit;   // 每日（UTC 自然日）最多花多少
        uint128 perTxLimit;   // 单笔最多花多少
        uint128 spentToday;   // 当日已花
        uint64 dayIndex;      // spentToday 所属的日期 = block.timestamp / 1 days
    }

    enum RequestStatus {
        None,
        Pending,   // 超额，等用户审批
        Executed,  // 用户已批准并已付款
        Rejected,  // 用户已拒绝
        Expired    // 超过审批有效期
    }

    /// @notice 超出限额时生成的待审批付款请求
    struct PaymentRequest {
        address agent;
        address merchant;
        uint128 amount;
        uint64 createdAt;
        RequestStatus status;
        bytes32 memoHash;     // 备注的哈希（完整备注只放在事件里，省 gas）
    }

    // ─────────────────────────── 事件 ───────────────────────────

    event Deposited(address indexed from, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);
    event AgentSet(address indexed agent, uint128 dailyLimit, uint128 perTxLimit, uint64 expiresAt);
    event AgentRevoked(address indexed agent);
    event MerchantSet(address indexed merchant, bool allowed);
    event PaymentExecuted(address indexed agent, address indexed merchant, uint256 amount, string memo);
    event PaymentRequested(
        uint256 indexed requestId, address indexed agent, address indexed merchant, uint256 amount, string memo
    );
    event RequestApproved(uint256 indexed requestId);
    event RequestRejected(uint256 indexed requestId);

    // ─────────────────────────── 错误 ───────────────────────────

    error NotAgent();
    error AgentExpired();
    error MerchantNotAllowed(address merchant);
    error ZeroAmount();
    error ZeroAddress();
    error InvalidLimits();
    error InsufficientBalance(uint256 available, uint256 required);
    error RequestNotPending(uint256 requestId);
    error RequestExpired(uint256 requestId);
    error ReceiverRejected(address merchant);

    // ─────────────────────────── 用户（owner）操作 ───────────────────────────

    function deposit(uint256 amount) external;
    function withdraw(address to, uint256 amount) external;
    function setAgent(address agent, uint128 dailyLimit, uint128 perTxLimit, uint64 expiresAt) external;
    function revokeAgent(address agent) external;
    function setMerchant(address merchant, bool allowed) external;
    function approveRequest(uint256 requestId) external;
    function rejectRequest(uint256 requestId) external;
    function pause() external;
    function unpause() external;

    // ─────────────────────────── AI 代理操作 ───────────────────────────

    /// @notice AI 代理发起付款。在限额内 → 立即付款；超额 → 生成待审批请求。
    /// @return executed 是否已立即付款
    /// @return requestId 若未立即付款，返回待审批请求的 ID（否则为 0）
    function pay(address merchant, uint128 amount, string calldata memo)
        external
        returns (bool executed, uint256 requestId);

    // ─────────────────────────── 只读查询 ───────────────────────────

    function token() external view returns (address);
    function balance() external view returns (uint256);
    function remainingToday(address agent) external view returns (uint256);
    function getPolicy(address agent) external view returns (AgentPolicy memory);
    function getRequest(uint256 requestId) external view returns (PaymentRequest memory);
    function isMerchant(address merchant) external view returns (bool);
}
