// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @title Stipend
/// @notice A payer-funded tUSD8 vault that lets authorized agents settle approved invoices.
contract Stipend is ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    address public immutable payer;
    uint256 public vaultBalance;
    uint256 public nextInvoiceId = 1;

    struct Policy {
        uint256 totalBudget;
        uint256 perPaymentCap;
        uint256 dailyLimit;
        uint256 expiry;
        uint256 spent;
        bool revoked;
    }

    struct Invoice {
        address merchant;
        address agent;
        uint256 amount;
        bool paid;
        bool closed;
        bool blocked;
    }

    enum RejectionReason {
        None,
        Revoked,
        Expired,
        MerchantNotAllowed,
        PaymentCapExceeded,
        BudgetExceeded,
        DailyLimitExceeded,
        InvoiceAlreadyPaid,
        InsufficientVaultBalance,
        WrongAgent,
        InvoiceNotFound
    }

    mapping(address => Policy) public policies;
    mapping(address => mapping(address => bool)) public allowedMerchant;
    mapping(address => mapping(uint256 => uint256)) public dailySpent;
    mapping(uint256 => Invoice) public invoices;

    // --- Merchant list per agent ---
    mapping(address => address[]) private _merchantList;
    mapping(address => mapping(address => uint256)) private _merchantIndex;

    // --- Open invoice list per agent ---
    mapping(address => uint256[]) private _openInvoiceList;
    mapping(address => mapping(uint256 => uint256)) private _openInvoiceIndex;
    mapping(address => uint256[]) private _blockedInvoiceList;

    event Deposited(address indexed payer, uint256 amount);
    event Withdrawn(address indexed payer, uint256 amount);
    event PolicySet(address indexed payer, address indexed agent, uint256 totalBudget, uint256 perPaymentCap, uint256 dailyLimit, uint256 expiry);
    event MerchantAdded(address indexed agent, address indexed merchant);
    event MerchantRemoved(address indexed agent, address indexed merchant);
    event InvoiceCreated(uint256 indexed invoiceId, address indexed merchant, address indexed agent, uint256 amount);
    event InvoicePaid(uint256 indexed invoiceId, address indexed agent, address indexed merchant, uint256 amount);
    event InvoiceClosed(uint256 indexed invoiceId, address indexed caller);
    event PaymentRejected(uint256 indexed invoiceId, address indexed agent, RejectionReason reason);
    event AgentRevoked(address indexed payer, address indexed agent);
    event AgentReinstated(address indexed payer, address indexed agent);
    event SpentReset(address indexed payer, address indexed agent);
    event ExcessSwept(address indexed payer, uint256 amount);

    modifier onlyPayer() {
        require(msg.sender == payer, "Stipend: payer only");
        _;
    }

    constructor(address tokenAddress) {
        require(tokenAddress != address(0), "Stipend: zero token");
        token = IERC20(tokenAddress);
        payer = msg.sender;
    }

    function deposit(uint256 amount) external onlyPayer nonReentrant {
        require(amount > 0, "Stipend: zero amount");
        uint256 beforeBalance = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = token.balanceOf(address(this)) - beforeBalance;
        require(received == amount, "Stipend: unsupported fee token");
        vaultBalance += received;
        emit Deposited(msg.sender, received);
    }

    function withdraw(uint256 amount) external onlyPayer nonReentrant {
        require(amount > 0 && amount <= vaultBalance, "Stipend: invalid amount");
        vaultBalance -= amount;
        token.safeTransfer(payer, amount);
        emit Withdrawn(payer, amount);
    }

    function sweepExcess() external onlyPayer nonReentrant {
        uint256 excess = token.balanceOf(address(this)) - vaultBalance;
        require(excess > 0, "Stipend: nothing to sweep");
        token.safeTransfer(payer, excess);
        emit ExcessSwept(payer, excess);
    }

    function setPolicy(
        address agent,
        uint256 totalBudget,
        uint256 perPaymentCap,
        uint256 dailyLimit,
        uint256 expiry
    ) external onlyPayer {
        require(agent != address(0), "Stipend: zero agent");
        require(totalBudget > 0 && perPaymentCap > 0 && dailyLimit > 0, "Stipend: zero limit");
        require(perPaymentCap <= totalBudget && dailyLimit <= totalBudget, "Stipend: inconsistent limits");
        require(expiry > block.timestamp, "Stipend: expiry must be future");
        Policy storage policy = policies[agent];
        require(totalBudget >= policy.spent, "Stipend: budget below spent");
        policy.totalBudget = totalBudget;
        policy.perPaymentCap = perPaymentCap;
        policy.dailyLimit = dailyLimit;
        policy.expiry = expiry;
        emit PolicySet(msg.sender, agent, totalBudget, perPaymentCap, dailyLimit, expiry);
    }

    function reinstate(address agent) external onlyPayer {
        policies[agent].revoked = false;
        emit AgentReinstated(msg.sender, agent);
    }

    function resetSpent(address agent) external onlyPayer {
        policies[agent].spent = 0;
        emit SpentReset(msg.sender, agent);
    }

    function addMerchant(address agent, address merchant) external onlyPayer {
        require(agent != address(0) && merchant != address(0), "Stipend: zero address");
        require(!allowedMerchant[agent][merchant], "Stipend: merchant already allowed");
        allowedMerchant[agent][merchant] = true;
        _merchantList[agent].push(merchant);
        _merchantIndex[agent][merchant] = _merchantList[agent].length; // 1-based
        emit MerchantAdded(agent, merchant);
    }

    function removeMerchant(address agent, address merchant) external onlyPayer {
        require(allowedMerchant[agent][merchant], "Stipend: merchant not allowed");
        allowedMerchant[agent][merchant] = false;
        // Swap-and-pop from the merchant list (1-based index)
        uint256 idx = _merchantIndex[agent][merchant];
        uint256 lastIdx = _merchantList[agent].length;
        if (idx != lastIdx) {
            address lastMerchant = _merchantList[agent][lastIdx - 1];
            _merchantList[agent][idx - 1] = lastMerchant;
            _merchantIndex[agent][lastMerchant] = idx;
        }
        _merchantList[agent].pop();
        _merchantIndex[agent][merchant] = 0;
        emit MerchantRemoved(agent, merchant);
    }

    function revoke(address agent) external onlyPayer {
        policies[agent].revoked = true;
        emit AgentRevoked(msg.sender, agent);
    }

    function pause() external onlyPayer {
        _pause();
    }

    function unpause() external onlyPayer {
        _unpause();
    }

    /// @notice A merchant creates an invoice for one agent; the caller is stored as merchant.
    function createInvoice(address agent, uint256 amount) external returns (uint256 invoiceId) {
        require(agent != address(0) && amount > 0, "Stipend: invalid invoice");
        require(allowedMerchant[agent][msg.sender], "Stipend: merchant not approved");
        invoiceId = nextInvoiceId++;
        invoices[invoiceId] = Invoice({merchant: msg.sender, agent: agent, amount: amount, paid: false, closed: false, blocked: false});
        // Add to agent's open invoice list
        _openInvoiceList[agent].push(invoiceId);
        _openInvoiceIndex[agent][invoiceId] = _openInvoiceList[agent].length; // 1-based
        emit InvoiceCreated(invoiceId, msg.sender, agent, amount);
    }

    /// @notice Closes an unpaid invoice so it no longer appears in the agent's open list.
    /// @dev Only the payer or the invoice's merchant may close it.
    function closeInvoice(uint256 invoiceId) external {
        Invoice storage invoice = invoices[invoiceId];
        require(invoice.merchant != address(0), "Stipend: invoice not found");
        require(msg.sender == payer || msg.sender == invoice.merchant, "Stipend: not authorized");
        require(!invoice.paid, "Stipend: invoice already paid");
        require(!invoice.closed, "Stipend: invoice already closed");
        require(invoice.blocked, "Stipend: invoice is not blocked");
        invoice.closed = true;
        _removeOpenInvoice(invoice.agent, invoiceId);
        emit InvoiceClosed(invoiceId, msg.sender);
    }

    /// @notice Only the invoice's designated agent can settle it. Failed policy checks emit
    ///         PaymentRejected and return false so the rejection remains observable on-chain.
    function payInvoice(uint256 invoiceId) external nonReentrant whenNotPaused returns (bool) {
        Invoice storage invoice = invoices[invoiceId];
        RejectionReason reason = _rejectionReason(invoiceId, invoice, msg.sender);
        if (reason != RejectionReason.None) {
            if (
                !invoice.blocked && invoice.merchant != address(0) &&
                !invoice.paid && !invoice.closed && invoice.agent == msg.sender
            ) {
                invoice.blocked = true;
                _blockedInvoiceList[invoice.agent].push(invoiceId);
            }
            emit PaymentRejected(invoiceId, msg.sender, reason);
            return false;
        }

        Policy storage policy = policies[msg.sender];
        uint256 day = block.timestamp / 1 days;
        invoice.paid = true;
        policy.spent += invoice.amount;
        dailySpent[msg.sender][day] += invoice.amount;
        vaultBalance -= invoice.amount;
        // Remove from agent's open invoice list
        _removeOpenInvoice(invoice.agent, invoiceId);
        token.safeTransfer(invoice.merchant, invoice.amount);
        emit InvoicePaid(invoiceId, msg.sender, invoice.merchant, invoice.amount);
        return true;
    }

    // --- Read functions ---

    /// @notice Returns all approved merchants for an agent.
    function getApprovedMerchants(address agent) external view returns (address[] memory) {
        return _merchantList[agent];
    }

    /// @notice Returns a page of open invoice IDs for an agent.
    /// @param agent  The agent address.
    /// @param offset Zero-based starting index into the open invoice list.
    /// @param limit  Maximum number of invoice IDs to return.
    /// @return ids   The slice of open invoice IDs.
    /// @return total The total number of open invoices for this agent.
    function getOpenInvoices(address agent, uint256 offset, uint256 limit)
        external view returns (uint256[] memory ids, uint256 total)
    {
        total = _openInvoiceList[agent].length;
        if (offset >= total || limit == 0) {
            return (new uint256[](0), total);
        }
        uint256 end = offset + limit;
        if (end > total) end = total;
        uint256 count = end - offset;
        ids = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            ids[i] = _openInvoiceList[agent][offset + i];
        }
    }

    /// @notice Returns a page of invoices that have had at least one rejected payment attempt.
    function getBlockedInvoices(address agent, uint256 offset, uint256 limit)
        external view returns (uint256[] memory ids, uint256 total)
    {
        total = _blockedInvoiceList[agent].length;
        if (offset >= total || limit == 0) return (new uint256[](0), total);
        uint256 end = offset + limit;
        if (end > total) end = total;
        ids = new uint256[](end - offset);
        for (uint256 i = 0; i < ids.length; i++) ids[i] = _blockedInvoiceList[agent][offset + i];
    }

    // --- Internal helpers ---

    function _removeOpenInvoice(address agent, uint256 invoiceId) private {
        uint256 idx = _openInvoiceIndex[agent][invoiceId];
        if (idx == 0) return; // not in list
        uint256 lastIdx = _openInvoiceList[agent].length;
        if (idx != lastIdx) {
            uint256 lastInvoiceId = _openInvoiceList[agent][lastIdx - 1];
            _openInvoiceList[agent][idx - 1] = lastInvoiceId;
            _openInvoiceIndex[agent][lastInvoiceId] = idx;
        }
        _openInvoiceList[agent].pop();
        _openInvoiceIndex[agent][invoiceId] = 0;
    }

    function _rejectionReason(uint256 invoiceId, Invoice storage invoice, address agent)
        private view returns (RejectionReason)
    {
        if (invoiceId == 0 || invoice.merchant == address(0)) return RejectionReason.InvoiceNotFound;
        if (invoice.agent != agent) return RejectionReason.WrongAgent;
        if (invoice.paid) return RejectionReason.InvoiceAlreadyPaid;
        if (invoice.closed) return RejectionReason.InvoiceNotFound;
        Policy storage policy = policies[agent];
        if (policy.revoked) return RejectionReason.Revoked;
        if (block.timestamp > policy.expiry || policy.expiry == 0) return RejectionReason.Expired;
        if (!allowedMerchant[agent][invoice.merchant]) return RejectionReason.MerchantNotAllowed;
        if (invoice.amount > policy.perPaymentCap) return RejectionReason.PaymentCapExceeded;
        if (policy.spent >= policy.totalBudget || invoice.amount > policy.totalBudget - policy.spent) return RejectionReason.BudgetExceeded;
        uint256 spentToday = dailySpent[agent][block.timestamp / 1 days];
        if (spentToday >= policy.dailyLimit || invoice.amount > policy.dailyLimit - spentToday) return RejectionReason.DailyLimitExceeded;
        if (invoice.amount > vaultBalance) return RejectionReason.InsufficientVaultBalance;
        return RejectionReason.None;
    }
}
