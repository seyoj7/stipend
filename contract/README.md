# Stipend smart contract

Stipend is a single-payer tUSD8 vault that gives an agent a bounded permission to pay invoices on Aevum Testnet (chain ID 44005). The contract source is [`contracts/stipend.sol`](contracts/stipend.sol); it uses OpenZeppelin `SafeERC20`, `ReentrancyGuard`, and `Pausable`.

## Roles and workflow

- **Payer:** The wallet that deploys the contract. It funds and manages the vault and controls each agent policy.
- **Agent:** A wallet with a per-agent policy. It can call `payInvoice` for invoices assigned to its own address; it cannot withdraw funds or change its policy.
- **Merchant:** A wallet approved for a specific agent. It creates invoices for that agent, and receives tUSD8 when an invoice is paid.

The payer deposits tUSD8, sets an agent's total budget, per-payment cap, daily limit, and expiry, and approves merchants. An approved merchant calls `createInvoice(agent, amount)`. The contract records the caller as the invoice merchant and rejects the call unless `allowedMerchant[agent][msg.sender]` is true. The agent then calls `payInvoice(invoiceId)`. The contract checks the policy, merchant approval, invoice status, pause state, and vault balance before transferring funds.

Rejected payment checks emit `PaymentRejected` with a `RejectionReason` and return `false`. A successful payment emits `InvoicePaid`. Daily spend is tracked by UTC day (`block.timestamp / 1 days`).

## Payer controls

All of these functions are restricted to the payer:

| Function | Effect |
| --- | --- |
| `deposit(amount)` | Transfers tUSD8 into the vault and increases `vaultBalance`. |
| `withdraw(amount)` | Withdraws up to the accounted `vaultBalance` to the payer. |
| `sweepExcess()` | Sends tokens held above `vaultBalance` to the payer. Reverts if there is no excess. |
| `setPolicy(agent, totalBudget, perPaymentCap, dailyLimit, expiry)` | Sets or updates limits and expiry. It preserves `spent` and `revoked`; it does not reset spending or reinstate an agent. |
| `addMerchant(agent, merchant)` / `removeMerchant(agent, merchant)` | Adds or removes a merchant from that agent's allowlist. |
| `revoke(agent)` / `reinstate(agent)` | Revokes or restores the agent's permission. Restoring does not change its limits or spent total. |
| `resetSpent(agent)` | Sets the agent's lifetime `spent` counter to zero. It does not clear daily spend or change the revoked flag. |
| `pause()` / `unpause()` | Pauses or resumes invoice payments for the entire vault. |

## Rejection reasons

`PaymentRejected.reason` is a `uint8` enum value in this order:

| Value | Reason | Meaning |
| ---: | --- | --- |
| 0 | `None` | No rejection; payment can proceed. |
| 1 | `Revoked` | Agent permission is revoked. |
| 2 | `Expired` | The policy is expired or has no expiry. |
| 3 | `MerchantNotAllowed` | The invoice merchant is not approved for the agent. |
| 4 | `PaymentCapExceeded` | The invoice exceeds the per-payment cap. |
| 5 | `BudgetExceeded` | The invoice would exceed the total budget. |
| 6 | `DailyLimitExceeded` | The invoice would exceed the daily limit. |
| 7 | `InvoiceAlreadyPaid` | The invoice has already been paid. |
| 8 | `InsufficientVaultBalance` | The vault does not hold enough accounted tUSD8. |
| 9 | `WrongAgent` | The caller is not the agent assigned to the invoice. |
| 10 | `InvoiceNotFound` | The invoice ID has no recorded invoice. |

## Tests

The Hardhat 3 `node:test` suite is in [`test/Stipend.ts`](test/Stipend.ts) and contains **45 test cases** covering payment checks, payer-only access, policy updates, agent reinstatement and spending reset, vault accounting, merchant changes, token edge cases, merchant list tracking (add/remove/re-add ordering, per-agent independence), and open invoice list tracking (creation, payment removal, pagination, per-agent scoping).

Run the suite from this directory:

```bash
npx hardhat test
```

## Deployment

The Hardhat network is configured in [`hardhat.config.ts`](hardhat.config.ts). Deploy to Aevum Testnet with a configured `AEVUM_PRIVATE_KEY`:

```bash
npx hardhat ignition deploy ignition/modules/deploy.ts --network aevum
```
