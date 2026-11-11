// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

/// @title IPaymentReceiver
/// @notice 商家合约实现这个接口后，AgentVault 付款时会"转账并通知"它（思路类似 ERC-1363 的 transferAndCall）。
///         商家合约可以借此把一笔付款和一个订单绑定起来；如果它不认这笔付款（订单不存在、金额不对、缺货），
///         就 revert —— 整笔付款随之回滚，钱不会离开金库。
/// @dev 金库通过 ERC-165 判断收款方是否支持本接口；普通钱包地址或不支持的合约照常转账，不会被调用。
interface IPaymentReceiver is IERC165 {
    /// @param agent 发起付款的 AI 代理（审批通过的付款也是原来的代理）
    /// @param amount 本次已经转入的金额
    /// @param memo 付款备注，例如 "order:7"
    /// @return 必须返回 IPaymentReceiver.onAgentPayment.selector，否则金库视为拒收
    function onAgentPayment(address agent, uint256 amount, string calldata memo) external returns (bytes4);
}
