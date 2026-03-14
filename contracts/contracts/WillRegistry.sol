// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Minimal interface to trigger NexusVault execution.
interface INexusVault {
    function executeInheritance() external;
}

/**
 * WillRegistry — Off-chain friendly registry for NexusVault wills.
 *
 * - One will per owner address.
 * - Stores beneficiary, linked vault, and Fileverse IPFS CID.
 * - Tracks a simple trust tree with level-1 trustees and backups.
 * - Supports ZK verification + approvals from trustees.
 * - Emits events that the backend indexes and uses for notifications.
 *
 * NOTE: This is intentionally hackathon-grade and optimized for
 *       easy indexing rather than gas efficiency.
 */
contract WillRegistry {
    struct TrusteeNode {
        address wallet;
        bool zkVerified;
        bool approvedByOwner;
        bool hasApproved;
        bool isActive;
        address[] backups;
        address parent;
    }

    struct WillData {
        address owner;
        address beneficiary;
        address vaultAddress;
        string ipfsCID;
        address[] level1;
        address[] replacementPool;
        bool isSealed;
        bool executed;
        uint256 createdAt;
    }

    // owner => will data
    mapping(address => WillData) private wills;

    // owner => linearized trustee nodes (for frontend tree reconstruction)
    mapping(address => TrusteeNode[]) private trustTrees;

    // owner => (wallet => index+1 in trustTrees[owner])
    mapping(address => mapping(address => uint256)) private trusteeIndex;

    // owner => (trustee => nullifier hash)
    mapping(address => mapping(address => uint256)) public nullifierHashes;

    event WillCreated(address indexed owner, address indexed beneficiary);
    event TrusteeAdded(address indexed owner, address trustee, address parent);
    event TrusteeApprovedByOwner(address indexed owner, address trustee);
    event WillSealed(address indexed owner);
    event ApprovalSubmitted(address indexed owner, address indexed trustee);
    event ReplacementActivated(
        address indexed owner,
        address inactive,
        address replacement
    );
    event WillExecuted(
        address indexed owner,
        address indexed beneficiary,
        string ipfsCID
    );
    event BranchAtRisk(address indexed owner, address branchRoot);

    modifier onlyWillOwner(address owner) {
        require(msg.sender == owner, "Not will owner");
        _;
    }

    modifier willExists(address owner) {
        require(wills[owner].owner != address(0), "Will does not exist");
        _;
    }

    // ---------------------------------------------------------------------
    // Core will creation & configuration
    // ---------------------------------------------------------------------

    function createWill(
        address beneficiary,
        address vaultAddress,
        string memory ipfsCID
    ) external {
        require(beneficiary != address(0), "Invalid beneficiary");
        require(vaultAddress != address(0), "Invalid vault address");
        require(
            wills[msg.sender].owner == address(0),
            "Will already exists for owner"
        );

        WillData storage w = wills[msg.sender];
        w.owner = msg.sender;
        w.beneficiary = beneficiary;
        w.vaultAddress = vaultAddress;
        w.ipfsCID = ipfsCID;
        w.createdAt = block.timestamp;

        emit WillCreated(msg.sender, beneficiary);
    }

    /**
     * Add a trustee to the trust tree.
     * - parent == address(0) => level-1 root trustee.
     * - otherwise, trustee is added as a backup under the given parent.
     */
    function addTrustee(address trustee, address parent) external {
        require(trustee != address(0), "Invalid trustee");

        WillData storage w = wills[msg.sender];
        require(w.owner != address(0), "Will not created");
        require(!w.executed, "Will already executed");

        TrusteeNode[] storage tree = trustTrees[msg.sender];

        if (parent == address(0)) {
            // Level 1 trustee
            TrusteeNode memory node = TrusteeNode({
                wallet: trustee,
                zkVerified: false,
                approvedByOwner: false,
                hasApproved: false,
                isActive: true,
                backups: new address[](0),
                parent: address(0)
            });
            tree.push(node);
            trusteeIndex[msg.sender][trustee] = tree.length; // index+1
            w.level1.push(trustee);
            emit TrusteeAdded(msg.sender, trustee, parent);
        } else {
            // Backup trustee under parent
            uint256 idx = trusteeIndex[msg.sender][parent];
            require(idx > 0, "Parent not found");

            TrusteeNode storage parentNode = tree[idx - 1];
            parentNode.backups.push(trustee);

            TrusteeNode memory node2 = TrusteeNode({
                wallet: trustee,
                zkVerified: false,
                approvedByOwner: false,
                hasApproved: false,
                isActive: true,
                backups: new address[](0),
                parent: parent
            });
            tree.push(node2);
            trusteeIndex[msg.sender][trustee] = tree.length;

            emit TrusteeAdded(msg.sender, trustee, parent);
        }
    }

    function approveTrustee(address trustee) external {
        WillData storage w = wills[msg.sender];
        require(w.owner != address(0), "Will not created");
        require(!w.executed, "Will already executed");

        uint256 idx = trusteeIndex[msg.sender][trustee];
        require(idx > 0, "Trustee not found");
        TrusteeNode storage node = trustTrees[msg.sender][idx - 1];
        node.approvedByOwner = true;

        emit TrusteeApprovedByOwner(msg.sender, trustee);
    }

    function addToReplacementPool(address member) external {
        WillData storage w = wills[msg.sender];
        require(w.owner != address(0), "Will not created");
        require(!w.executed, "Will already executed");
        require(member != address(0), "Invalid member");

        // naive: allow duplicates; frontend can de-duplicate
        w.replacementPool.push(member);
    }

    function markZKVerified(address trustee, uint256 nullifierHash) external {
        WillData storage w = wills[msg.sender];
        require(w.owner != address(0), "Will not created");
        require(!w.executed, "Will already executed");

        uint256 idx = trusteeIndex[msg.sender][trustee];
        require(idx > 0, "Trustee not found");
        TrusteeNode storage node = trustTrees[msg.sender][idx - 1];
        node.zkVerified = true;
        nullifierHashes[msg.sender][trustee] = nullifierHash;
    }

    function sealWill() external {
        WillData storage w = wills[msg.sender];
        require(w.owner != address(0), "Will not created");
        require(!w.isSealed, "Already sealed");
        require(!w.executed, "Will already executed");

        w.isSealed = true;
        emit WillSealed(msg.sender);
    }

    // ---------------------------------------------------------------------
    // Trustee approvals & replacements
    // ---------------------------------------------------------------------

    function submitApproval(address willOwner) external willExists(willOwner) {
        WillData storage w = wills[willOwner];
        require(!w.executed, "Will already executed");
        require(w.isSealed, "Will not sealed");

        uint256 idx = trusteeIndex[willOwner][msg.sender];
        require(idx > 0, "Not a trustee");

        TrusteeNode storage node = trustTrees[willOwner][idx - 1];
        require(node.isActive, "Inactive trustee");
        node.hasApproved = true;

        emit ApprovalSubmitted(willOwner, msg.sender);
    }

    function activateReplacement(
        address willOwner,
        address inactive,
        address replacement
    ) external onlyWillOwner(willOwner) willExists(willOwner) {
        WillData storage w = wills[willOwner];
        require(!w.executed, "Will already executed");

        uint256 inactiveIdx = trusteeIndex[willOwner][inactive];
        uint256 replacementIdx = trusteeIndex[willOwner][replacement];
        require(inactiveIdx > 0, "Inactive trustee not found");
        require(replacementIdx > 0, "Replacement not found");

        TrusteeNode storage inactiveNode = trustTrees[willOwner][
            inactiveIdx - 1
        ];
        TrusteeNode storage replacementNode = trustTrees[willOwner][
            replacementIdx - 1
        ];

        inactiveNode.isActive = false;
        replacementNode.isActive = true;

        emit ReplacementActivated(willOwner, inactive, replacement);
    }

    function checkFullConsensus(
        address willOwner
    ) public view willExists(willOwner) returns (bool) {
        WillData storage w = wills[willOwner];
        if (!w.isSealed || w.executed) {
            return false;
        }

        TrusteeNode[] storage tree = trustTrees[willOwner];
        for (uint256 i = 0; i < tree.length; i++) {
            if (!tree[i].isActive) continue;
            if (
                !tree[i].zkVerified ||
                !tree[i].approvedByOwner ||
                !tree[i].hasApproved
            ) {
                return false;
            }
        }
        return true;
    }

    // ---------------------------------------------------------------------
    // Execution
    // ---------------------------------------------------------------------

    function executeWill(
        address willOwner
    ) external willExists(willOwner) onlyWillOwner(willOwner) {
        WillData storage w = wills[willOwner];
        require(w.isSealed, "Will not sealed");
        require(!w.executed, "Already executed");
        require(checkFullConsensus(willOwner), "Consensus not reached");
        require(w.vaultAddress != address(0), "No vault linked");

        w.executed = true;

        // Trigger underlying NexusVault inheritance
        INexusVault(w.vaultAddress).executeInheritance();

        emit WillExecuted(willOwner, w.beneficiary, w.ipfsCID);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function getTrustTree(
        address willOwner
    ) external view returns (TrusteeNode[] memory) {
        return trustTrees[willOwner];
    }

    function getWillStatus(
        address willOwner
    ) external view returns (WillData memory) {
        return wills[willOwner];
    }
}

