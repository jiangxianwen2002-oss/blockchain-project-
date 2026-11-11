// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {AgentVault} from "../src/AgentVault.sol";

/// @notice 一键部署：MockUSDC + AgentVault（owner = 部署者）
/// 用法见 README：forge script script/Deploy.s.sol --rpc-url sepolia --broadcast --verify
contract Deploy is Script {
    function run() external returns (MockUSDC usdc, AgentVault vault) {
        uint256 pk = vm.envUint("OWNER_PRIVATE_KEY");
        address owner = vm.addr(pk);

        vm.startBroadcast(pk);
        usdc = new MockUSDC();
        vault = new AgentVault(address(usdc), owner);
        vm.stopBroadcast();

        console.log("MockUSDC   :", address(usdc));
        console.log("AgentVault :", address(vault));
        console.log("Owner      :", owner);
    }
}
