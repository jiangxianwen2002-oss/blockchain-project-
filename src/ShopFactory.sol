// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AgentShop} from "./AgentShop.sol";

/// @title ShopFactory
/// @notice 官方开店工厂：商家通过它开店，每家店都是同一份 AgentShop 模板代码（已测试、已验证源码），
///         不能夹带自己写的合约。金库主人导入商家时，只要确认 `isShop(地址) == true`，就知道代码没被改过。
/// @dev 工厂同时固定了几项平台规则：绑定哪个金库、用哪种币、仲裁人是谁、自动放款期最短多久。
contract ShopFactory {
    address public immutable token;
    address public immutable vault;
    /// @notice 平台仲裁人：只能裁决申诉中的订单（退款或放款），不能动任何别的钱
    address public immutable arbiter;
    /// @notice 自动放款期（也是申诉期）的下限，防止商家把它设成 0、让买家来不及申诉
    uint64 public immutable minConfirmWindow;

    mapping(address => bool) public isShop;
    address[] public shops;

    event ShopCreated(address indexed shop, address indexed owner, string name);

    error WindowTooShort(uint64 min, uint64 got);
    error ZeroAddress();

    constructor(address token_, address vault_, address arbiter_, uint64 minConfirmWindow_) {
        if (token_ == address(0) || vault_ == address(0) || arbiter_ == address(0)) revert ZeroAddress();
        token = token_;
        vault = vault_;
        arbiter = arbiter_;
        minConfirmWindow = minConfirmWindow_;
    }

    /// @notice 开店。调用者就是店主（负责发货、改菜单、提现）
    function createShop(
        string calldata name,
        string calldata description,
        uint64 confirmWindow,
        string[] calldata itemNames,
        uint128[] calldata prices,
        uint32[] calldata stocks
    ) external returns (AgentShop shop) {
        if (confirmWindow < minConfirmWindow) revert WindowTooShort(minConfirmWindow, confirmWindow);
        shop = new AgentShop(
            AgentShop.ShopConfig(token, vault, msg.sender, arbiter, confirmWindow, name, description), itemNames, prices, stocks
        );
        isShop[address(shop)] = true;
        shops.push(address(shop));
        emit ShopCreated(address(shop), msg.sender, name);
    }

    function shopCount() external view returns (uint256) {
        return shops.length;
    }
}
