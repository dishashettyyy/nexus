// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * NexusVault — On-chain dead-man switch inheritance vault.
 *
 * Rules:
 * - Owner pings to reset the inactivity clock.
 * - If block.timestamp > lastPing + inactivityPeriod AND executed == false,
 *   anyone can call executeInheritance().
 * - The vault balance is split equally among all beneficiaries.
 * - ETH only originally; extended to support ERC20 with percentage splits.
 * - Automation-compatible via checkUpkeep / performUpkeep.
 * - Owner can optionally store a Fileverse CID for a will document.
 */
contract NexusVault is ReentrancyGuard {
    using SafeERC20 for IERC20;
    address public owner;
    address[] public beneficiaries;
    uint256[] public shares; // basis points per beneficiary, must sum to 10000
    uint256 public lastPing;
    uint256 public inactivityPeriod;
    bool public executed;
    string public willDocumentHash; // optional Fileverse CID

    uint256 public constant FEE_BPS = 100; // 1% protocol fee
    address public feeRecipient; // receives protocol fee
    address[] public tokenWhitelist; // approved ERC20 tokens

    event Pinged(address indexed owner, uint256 timestamp);
    event InheritanceExecuted(address[] beneficiaries, uint256 sharePerBeneficiary);
    event WillDocumentSet(string cid);
    event FundsReceived(address indexed sender, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(
        address _owner,
        address[] memory _beneficiaries,
        uint256[] memory _shares,
        uint256 _inactivityPeriod,
        address _feeRecipient
    ) {
        require(_beneficiaries.length > 0, "No beneficiaries");
        require(_inactivityPeriod > 0, "Invalid inactivity period");
        require(_beneficiaries.length == _shares.length, "length mismatch");
        require(_feeRecipient != address(0), "Invalid fee recipient");

        uint256 total;
        for (uint256 i = 0; i < _shares.length; i++) {
            total += _shares[i];
        }
        require(total == 10_000, "shares must sum to 10000");

        owner = _owner;
        beneficiaries = _beneficiaries;
        shares = _shares;
        inactivityPeriod = _inactivityPeriod;
        lastPing = block.timestamp;
        executed = false;
        feeRecipient = _feeRecipient;
    }

    receive() external payable {
        emit FundsReceived(msg.sender, msg.value);
    }

    /**
     * Owner calls this to reset the inactivity clock.
     */
    function ping() external onlyOwner {
        require(!executed, "Already executed");
        lastPing = block.timestamp;
        emit Pinged(msg.sender, block.timestamp);
    }

    /**
     * Execute inheritance: transfers equal share to each beneficiary.
     * Can be called by anyone once inactivity condition is met.
     */
    function executeInheritance() public nonReentrant {
        require(!executed, "Already executed");
        require(
            block.timestamp > lastPing + inactivityPeriod,
            "Inactivity period not elapsed"
        );
        require(address(this).balance > 0, "No ETH to distribute");
        require(beneficiaries.length > 0, "No beneficiaries");
        require(beneficiaries.length == shares.length, "shares length mismatch");

        executed = true;

        uint256 total = address(this).balance;
        uint256 fee = (total * FEE_BPS) / 10_000;
        payable(feeRecipient).transfer(fee);

        uint256 remaining = address(this).balance;
        uint256 distributed;

        for (uint256 i = 0; i < beneficiaries.length; i++) {
            uint256 shareAmount;
            if (i == beneficiaries.length - 1) {
                // last heir receives any dust
                shareAmount = remaining - distributed;
            } else {
                shareAmount = (remaining * shares[i]) / 10_000;
            }
            distributed += shareAmount;
            payable(beneficiaries[i]).transfer(shareAmount);
        }

        emit InheritanceExecuted(beneficiaries, distributed / beneficiaries.length);
    }

    /**
     * Chainlink Automation compatible — check if upkeep is needed.
     * Returns true when: inactivity elapsed AND not yet executed AND has balance.
     */
    function checkUpkeep(bytes calldata)
        external
        view
        returns (bool upkeepNeeded, bytes memory)
    {
        upkeepNeeded =
            !executed &&
            block.timestamp > lastPing + inactivityPeriod &&
            address(this).balance > 0;
        return (upkeepNeeded, "");
    }

    /**
     * Chainlink Automation compatible — perform the upkeep.
     */
    function performUpkeep(bytes calldata) external {
        executeInheritance();
    }

    /**
     * Distribute ERC20 balances after ETH inheritance has executed.
     * Requires token to be whitelisted. Uses same shares[] percentages.
     */
    function claimERC20(address token) external nonReentrant {
        require(executed, "Not yet executed");
        require(isWhitelisted(token), "Token not approved");

        IERC20 t = IERC20(token);
        uint256 bal = t.balanceOf(address(this));
        require(bal > 0, "No token balance");

        uint256 fee = (bal * FEE_BPS) / 10_000;
        t.safeTransfer(feeRecipient, fee);

        uint256 remaining = t.balanceOf(address(this));
        require(beneficiaries.length == shares.length, "shares length mismatch");

        uint256 distributed;
        for (uint256 i = 0; i < beneficiaries.length; i++) {
            uint256 shareAmount;
            if (i == beneficiaries.length - 1) {
                shareAmount = remaining - distributed;
            } else {
                shareAmount = (remaining * shares[i]) / 10_000;
            }
            distributed += shareAmount;
            t.safeTransfer(beneficiaries[i], shareAmount);
        }
    }

    /**
     * Owner can store a Fileverse CID for the will document.
     * Only the hash/CID is stored — no file content on-chain.
     */
    function setWillDocumentHash(string memory cid) external onlyOwner {
        willDocumentHash = cid;
        emit WillDocumentSet(cid);
    }

    /**
     * Owner can update beneficiaries and their percentage splits before execution.
     * Shares are expressed in basis points (total must equal 10000).
     */
    function updateBeneficiaries(
        address[] calldata _beneficiaries,
        uint256[] calldata _shares
    ) external onlyOwner {
        require(!executed, "Already executed");
        require(_beneficiaries.length > 0, "No beneficiaries");
        require(_beneficiaries.length == _shares.length, "length mismatch");

        uint256 total;
        for (uint256 i = 0; i < _shares.length; i++) {
            total += _shares[i];
        }
        require(total == 10_000, "shares must sum to 10000");

        beneficiaries = _beneficiaries;
        shares = _shares;
    }

    /**
     * Owner can cancel the vault before execution and reclaim all ETH.
     */
    function cancelVault() external onlyOwner nonReentrant {
        require(!executed, "Already executed");
        executed = true;
        payable(owner).transfer(address(this).balance);
    }

    /**
     * Owner-controlled ERC20 whitelist management.
     */
    function setTokenWhitelist(address[] calldata tokens) external onlyOwner {
        tokenWhitelist = tokens;
    }

    function isWhitelisted(address token) public view returns (bool) {
        for (uint256 i = 0; i < tokenWhitelist.length; i++) {
            if (tokenWhitelist[i] == token) {
                return true;
            }
        }
        return false;
    }

    // View helpers

    function getBeneficiaries() external view returns (address[] memory) {
        return beneficiaries;
    }

    function getTimeRemaining() external view returns (uint256) {
        uint256 expiry = lastPing + inactivityPeriod;
        if (block.timestamp >= expiry) return 0;
        return expiry - block.timestamp;
    }

    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
}

