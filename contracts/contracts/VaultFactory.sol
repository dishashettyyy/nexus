// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./NexusVault.sol";

/**
 * VaultFactory — Deploys NexusVault instances.
 *
 * Rules:
 * - One vault per user address (enforced on-chain).
 * - Maps owner address → vault address.
 * - Emits VaultCreated on each deployment.
 */
contract VaultFactory {
    mapping(address => address) public vaults;

    address public feeRecipient;

    event VaultCreated(
        address indexed owner,
        address indexed vaultAddress,
        uint256 inactivityPeriod
    );

    constructor(address _feeRecipient) {
        require(_feeRecipient != address(0), "Invalid fee recipient");
        feeRecipient = _feeRecipient;
    }

    /**
     * Deploy a new NexusVault for the caller.
     * @param beneficiaries     Array of beneficiary addresses (no duplicates, no zero address).
     * @param shares            Basis points per beneficiary, must sum to 10000.
     * @param inactivityPeriod  Seconds of inactivity before inheritance executes.
     */
    function createVault(
        address[] calldata beneficiaries,
        uint256[] calldata shares,
        uint256 inactivityPeriod
    ) external returns (address) {
        require(vaults[msg.sender] == address(0), "Vault already exists");
        require(beneficiaries.length > 0, "No beneficiaries");
        require(beneficiaries.length == shares.length, "length mismatch");
        require(inactivityPeriod >= 1 days, "Min inactivity is 1 day");

        for (uint256 i = 0; i < beneficiaries.length; i++) {
            require(beneficiaries[i] != address(0), "Zero address not allowed");
        }

        NexusVault vault = new NexusVault(
            msg.sender,
            beneficiaries,
            shares,
            inactivityPeriod,
            feeRecipient
        );

        vaults[msg.sender] = address(vault);

        emit VaultCreated(msg.sender, address(vault), inactivityPeriod);

        return address(vault);
    }

    function getVault(address owner) external view returns (address) {
        return vaults[owner];
    }
}

