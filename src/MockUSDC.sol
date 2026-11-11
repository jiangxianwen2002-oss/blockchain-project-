// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockUSDC
/// @notice 仅用于 Sepolia 测试网的“假 USDC”，任何人都能从水龙头领取，没有真实价值。
contract MockUSDC is ERC20 {
    uint256 public constant FAUCET_AMOUNT = 1_000 * 1e6; // 每次领 1000 mUSDC
    uint256 public constant FAUCET_COOLDOWN = 1 days;

    mapping(address => uint256) public lastClaim;

    error FaucetCooldown(uint256 nextClaimAt);

    constructor() ERC20("Mock USDC", "mUSDC") {}

    /// @dev 与真实 USDC 一致，6 位小数
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice 水龙头：每个地址每 24 小时可领一次
    function faucet() external {
        uint256 next = lastClaim[msg.sender] + FAUCET_COOLDOWN;
        if (lastClaim[msg.sender] != 0 && block.timestamp < next) revert FaucetCooldown(next);
        lastClaim[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);
    }
}
