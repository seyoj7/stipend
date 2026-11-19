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
        WrongAgent
    }

    mapping(address => Policy) public policies;
    mapping(address => mapping(address => bool)) public allowedMerchant;
    mapping(address => mapping(uint256 => uint256)) public dailySpent;
    mapping(uint256 => Invoice) public invoices;

    event Deposited(address indexed payer, uint256 amount);
    event Withdrawn(address indexed payer, uint256 amount);
    event PolicySet(address indexed payer, address indexed agent, uint256 totalBudget, uint256 perPaymentCap, uint256 dailyLimit, uint256 expiry);
    event MerchantAdded(address indexed agent, address indexed merchant);
    event MerchantRemoved(address indexed agent, address indexed merchant);
    event InvoiceCreated(uint256 indexed invoiceId, address indexed merchant, address indexed agent, uint256 amount);
    event InvoicePaid(uint256 indexed invoiceId, address indexed agent, address indexed merchant, uint256 amount);
    event PaymentRejected(uint256 indexed invoiceId, address indexed agent, RejectionReason reason);
    event AgentRevoked(address indexed payer, address indexed agent);

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
        policy.totalBudget = totalBudget;
        policy.perPaymentCap = perPaymentCap;
        policy.dailyLimit = dailyLimit;
        policy.expiry = expiry;
        policy.spent = 0;
        policy.revoked = false;
        emit PolicySet(msg.sender, agent, totalBudget, perPaymentCap, dailyLimit, expiry);
    }

    function addMerchant(address agent, address merchant) external onlyPayer {
        require(agent != address(0) && merchant != address(0), "Stipend: zero address");
        require(!allowedMerchant[agent][merchant], "Stipend: merchant already allowed");
        allowedMerchant[agent][merchant] = true;
        emit MerchantAdded(agent, merchant);
    }

    function removeMerchant(address agent, address merchant) external onlyPayer {
        require(allowedMerchant[agent][merchant], "Stipend: merchant not allowed");
        allowedMerchant[agent][merchant] = false;
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
        invoiceId = nextInvoiceId++;
        invoices[invoiceId] = Invoice({merchant: msg.sender, agent: agent, amount: amount, paid: false});
        emit InvoiceCreated(invoiceId, msg.sender, agent, amount);
    }

    /// @notice Only the invoice's designated agent can settle it. Failed policy checks emit
    ///         PaymentRejected and return false so the rejection remains observable on-chain.
    function payInvoice(uint256 invoiceId) external nonReentrant whenNotPaused returns (bool) {
        Invoice storage invoice = invoices[invoiceId];
        RejectionReason reason = _rejectionReason(invoiceId, invoice, msg.sender);
        if (reason != RejectionReason.None) {
            emit PaymentRejected(invoiceId, msg.sender, reason);
            return false;
        }

        Policy storage policy = policies[msg.sender];
        uint256 day = block.timestamp / 1 days;
        invoice.paid = true;
        policy.spent += invoice.amount;
        dailySpent[msg.sender][day] += invoice.amount;
        vaultBalance -= invoice.amount;
        token.safeTransfer(invoice.merchant, invoice.amount);
        emit InvoicePaid(invoiceId, msg.sender, invoice.merchant, invoice.amount);
        return true;
    }

    function _rejectionReason(uint256 invoiceId, Invoice storage invoice, address agent)
        private view returns (RejectionReason)
    {
        if (invoiceId == 0 || invoice.merchant == address(0)) return RejectionReason.WrongAgent;
        if (invoice.agent != agent) return RejectionReason.WrongAgent;
        if (invoice.paid) return RejectionReason.InvoiceAlreadyPaid;
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
