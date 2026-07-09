// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MironSpendingLimit
 * @notice Stores daily spending limits for MironPay agent wallets on-chain.
 *         Admin (MironPay project wallet) sets limits on behalf of users.
 *         Anyone can read. Limits are in USDC micro-units (6 decimals).
 */
contract MironSpendingLimit {
    address public admin;

    // agentWalletAddress => daily limit in USDC micro-units (1 USDC = 1_000_000)
    mapping(address => uint256) private _limits;

    event LimitSet(address indexed wallet, uint256 limitMicro);
    event AdminTransferred(address indexed oldAdmin, address indexed newAdmin);

    constructor() {
        admin = msg.sender;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "MironSpendingLimit: only admin");
        _;
    }

    /// @notice Set daily spending limit for an agent wallet (admin only)
    /// @param wallet   The agent wallet address
    /// @param limitMicro  Limit in USDC micro-units (e.g. 50 USDC = 50_000_000)
    function setLimit(address wallet, uint256 limitMicro) external onlyAdmin {
        require(wallet != address(0), "Zero address");
        require(limitMicro >= 10_000, "Minimum 0.01 USDC"); // 0.01 USDC
        _limits[wallet] = limitMicro;
        emit LimitSet(wallet, limitMicro);
    }

    /// @notice Read daily limit for a wallet. Returns 5 USDC default if not set.
    function getLimit(address wallet) external view returns (uint256) {
        uint256 stored = _limits[wallet];
        return stored == 0 ? 5_000_000 : stored;
    }

    /// @notice Transfer admin role to a new address
    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "Zero address");
        emit AdminTransferred(admin, newAdmin);
        admin = newAdmin;
    }
}
