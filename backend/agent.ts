import "server-only";
import { parseEventLogs, verifyMessage } from "viem";
import {
  getAgentAccount,
  isAuthorizedAgentRun,
  STIPEND_ADDRESS,
} from "./config";
import { getAgentWalletClient, publicClient, stipendAbi } from "./chain";
import { getOpenInvoices } from "./invoices";

type Decision = {
  invoiceId: string;
  merchant?: string;
  amount?: string;
  decision: "blocked" | "paid" | "rejected" | "error";
  reason?: string;
  transactionHash?: string;
};

function logDecision(decision: Decision) {
  console.info(
    JSON.stringify({
      component: "stipend-agent",
      at: new Date().toISOString(),
      ...decision,
    }),
  );
}

const RUN_SIGNATURE_WINDOW_SECONDS = 120;

export async function runAgent(
  authorization: string | null,
  signedRequest?: { timestamp: number; signature: `0x${string}` },
) {
  let authorized = isAuthorizedAgentRun(authorization);
  if (!authorized && signedRequest && Number.isInteger(signedRequest.timestamp) && /^0x[0-9a-fA-F]+$/.test(signedRequest.signature)) {
    const now = Math.floor(Date.now() / 1000);
    const timestamp = signedRequest.timestamp;
    if (Math.abs(now - timestamp) <= RUN_SIGNATURE_WINDOW_SECONDS) {
      const payer = await publicClient.readContract({
        address: STIPEND_ADDRESS,
        abi: stipendAbi,
        functionName: "payer",
      });
      const message = [
        "Stipend agent run",
        `Contract: ${STIPEND_ADDRESS}`,
        "Chain ID: 44005",
        `Timestamp: ${timestamp}`,
      ].join("\n");
      try {
        authorized = await verifyMessage({ address: payer, message, signature: signedRequest.signature });
      } catch {
        authorized = false;
      }
    }
  }

  if (!authorized) {
    return { status: 401, body: { error: "Unauthorized" } };
  }

  const { account, client: walletClient } = getAgentWalletClient();
  const invoices = await getOpenInvoices();
  const [policy, balance, paused, block] = await Promise.all([
    publicClient.readContract({
      address: STIPEND_ADDRESS,
      abi: stipendAbi,
      functionName: "policies",
      args: [account.address],
    }),
    publicClient.readContract({
      address: STIPEND_ADDRESS,
      abi: stipendAbi,
      functionName: "vaultBalance",
    }),
    publicClient.readContract({
      address: STIPEND_ADDRESS,
      abi: stipendAbi,
      functionName: "paused",
    }),
    publicClient.getBlock(),
  ]);
  const day = block.timestamp / 86_400n;
  const decisions: Decision[] = [];
  let spentThisRun = 0n;

  for (const invoice of invoices) {
    let reason: string | undefined;
    const [merchantAllowed, spentToday] = await Promise.all([
      publicClient.readContract({
        address: STIPEND_ADDRESS,
        abi: stipendAbi,
        functionName: "allowedMerchant",
        args: [account.address, invoice.merchant],
      }),
      publicClient.readContract({
        address: STIPEND_ADDRESS,
        abi: stipendAbi,
        functionName: "dailySpent",
        args: [account.address, day],
      }),
    ]);

    if (invoice.agent !== account.address)
      reason = "invoice_assigned_to_different_agent";
    else if (paused) reason = "vault_paused";
    else if (policy[5]) reason = "agent_revoked";
    else if (policy[3] === 0n || block.timestamp > policy[3])
      reason = "policy_expired";
    else if (!merchantAllowed) reason = "merchant_not_approved";
    else if (invoice.amount > policy[1]) reason = "over_per_payment_cap";
    else if (policy[4] + spentThisRun + invoice.amount > policy[0])
      reason = "over_total_budget";
    else if (spentToday + spentThisRun + invoice.amount > policy[2])
      reason = "over_daily_limit";
    else if (invoice.amount > balance - spentThisRun)
      reason = "insufficient_vault_balance";

    if (reason) {
      const result: Decision = {
        invoiceId: invoice.id.toString(),
        merchant: invoice.merchant,
        amount: invoice.amount.toString(),
        decision: "blocked",
        reason,
      };
      logDecision(result);
      decisions.push(result);
      continue;
    }

    try {
      const hash = await walletClient.writeContract({
        address: STIPEND_ADDRESS,
        abi: stipendAbi,
        functionName: "payInvoice",
        args: [invoice.id],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const events = parseEventLogs({
        abi: stipendAbi,
        logs: receipt.logs,
        strict: false,
      });
      const paid = events.some((event) => event.eventName === "InvoicePaid");
      const result: Decision = {
        invoiceId: invoice.id.toString(),
        merchant: invoice.merchant,
        amount: invoice.amount.toString(),
        decision: paid ? "paid" : "rejected",
        reason: paid ? undefined : "contract_rejected_payment",
        transactionHash: hash,
      };
      logDecision(result);
      decisions.push(result);
      if (paid) spentThisRun += invoice.amount;
    } catch (error) {
      const result: Decision = {
        invoiceId: invoice.id.toString(),
        merchant: invoice.merchant,
        amount: invoice.amount.toString(),
        decision: "error",
        reason: error instanceof Error ? error.message : "unknown_error",
      };
      logDecision(result);
      decisions.push(result);
    }
  }

  return {
    status: 200,
    body: {
      agent: getAgentAccount().address,
      processed: decisions.length,
      decisions,
    },
  };
}
