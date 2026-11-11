// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {AgentVault} from "../src/AgentVault.sol";
import {AgentShop} from "../src/AgentShop.sol";
import {ShopFactory} from "../src/ShopFactory.sol";

contract ShopFactoryTest is Test {
    MockUSDC usdc;
    AgentVault vault;
    ShopFactory factory;
    address owner = makeAddr("owner");
    address merchant = makeAddr("merchant");
    address arbiter = makeAddr("arbiter");

    function setUp() public {
        usdc = new MockUSDC();
        vault = new AgentVault(address(usdc), owner);
        factory = new ShopFactory(address(usdc), address(vault), arbiter, 1 minutes);
    }

    function _menu() internal pure returns (string[] memory n, uint128[] memory p, uint32[] memory s) {
        n = new string[](1);
        p = new uint128[](1);
        s = new uint32[](1);
        (n[0], p[0], s[0]) = ("water", 3e6, 10);
    }

    function test_CreateShop_CallerIsOwner_RulesFixedByFactory() public {
        (string[] memory n, uint128[] memory p, uint32[] memory s) = _menu();
        vm.prank(merchant);
        AgentShop shop = factory.createShop("store", "desc", 1 hours, n, p, s);
        assertTrue(factory.isShop(address(shop)));
        assertEq(factory.shopCount(), 1);
        assertEq(shop.owner(), merchant);
        assertEq(shop.vault(), address(vault));
        assertEq(address(shop.token()), address(usdc));
        assertEq(shop.arbiter(), arbiter);
        assertEq(shop.confirmWindow(), 1 hours);
    }

    function test_RevertWhen_WindowTooShort() public {
        (string[] memory n, uint128[] memory p, uint32[] memory s) = _menu();
        vm.prank(merchant);
        vm.expectRevert(abi.encodeWithSelector(ShopFactory.WindowTooShort.selector, 1 minutes, 10));
        factory.createShop("store", "desc", 10, n, p, s);
    }

    function test_RevertWhen_ZeroAddress() public {
        vm.expectRevert(ShopFactory.ZeroAddress.selector);
        new ShopFactory(address(usdc), address(vault), address(0), 1);
    }

    function test_SelfDeployedShopIsNotOfficial() public {
        (string[] memory n, uint128[] memory p, uint32[] memory s) = _menu();
        // 商家绕过工厂自己部署：代码可能被改过，工厂不认
        AgentShop rogue = new AgentShop(AgentShop.ShopConfig(address(usdc), address(vault), merchant, merchant, 0, "rogue", ""), n, p, s);
        assertFalse(factory.isShop(address(rogue)));
    }
}
