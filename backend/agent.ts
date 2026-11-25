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

const RUN_SIGNATURE_WINDOW_SECONDS = 60;
const TRANSACTION_RECEIPT_TIMEOUT_MS = 120_000;
// This map only protects a single server instance; multi-instance deployments need a shared store.
const usedRunSignatures = new Map<string, number>();
let agentRunInProgress = false;

export async function runAgent(
  authorization: string | null,
  signedRequest?: { timestamp: number; signature: `0x${string}` },
) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  for (const [signature, firstSeen] of usedRunSignatures) {
    if (nowSeconds - firstSeen > RUN_SIGNATURE_WINDOW_SECONDS) usedRunSignatures.delete(signature);
  }

  let signedSignatureToRecord: string | undefined;
  let authorized = isAuthorizedAgentRun(authorization);
  if (!authorized && signedRequest && Number.isInteger(signedRequest.timestamp) && /^0x[0-9a-fA-F]+$/.test(signedRequest.signature)) {
    const timestamp = signedRequest.timestamp;
    if (Math.abs(nowSeconds - timestamp) <= RUN_SIGNATURE_WINDOW_SECONDS) {
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
        if (authorized) signedSignatureToRecord = signedRequest.signature.toLowerCase();
      } catch {
        authorized = false;
      }
    }
  }

  if (!authorized) {
    return { status: 401, body: { error: "Unauthorized" } };
  }

  if (signedSignatureToRecord && usedRunSignatures.has(signedSignatureToRecord)) {
    return { status: 401, body: { error: "Run request already used" } };
  }

  // Check and set synchronously after authorization so unauthenticated callers
  // cannot use the conflict response to observe whether an authorized run is active.
  if (agentRunInProgress) {
    return { status: 409, body: { error: "A run is already in progress" } };
  }
  agentRunInProgress = true;
  if (signedSignatureToRecord) usedRunSignatures.set(signedSignatureToRecord, nowSeconds);

  try {
  const { account, client: walletClient } = getAgentWalletClient();
  const invoices = await getOpenInvoices(account.address);

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
    const spentToday = await publicClient.readContract({
      address: STIPEND_ADDRESS,
      abi: stipendAbi,
      functionName: "dailySpent",
      args: [account.address, day],
    });

    if (invoice.agent !== account.address)
      reason = "invoice_assigned_to_different_agent";
    else if (paused) reason = "vault_paused";
    else if (policy[5]) reason = "agent_revoked";
    else if (policy[3] === 0n || block.timestamp > policy[3])
      reason = "policy_expired";
    else if (invoice.amount > policy[1]) reason = "over_per_payment_cap";
    else if (policy[4] + spentThisRun + invoice.amount > policy[0])
      reason = "over_total_budget";
    else if (spentToday + spentThisRun + invoice.amount > policy[2])
      reason = "over_daily_limit";
    else if (invoice.amount > balance - spentThisRun)
      reason = "insufficient_vault_balance";

    try {
      const hash = await walletClient.writeContract({
        address: STIPEND_ADDRESS,
        abi: stipendAbi,
        functionName: "payInvoice",
        args: [invoice.id],
      });
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        timeout: TRANSACTION_RECEIPT_TIMEOUT_MS,
      });
      const events = parseEventLogs({
        abi: stipendAbi,
        logs: receipt.logs,
        strict: false,
      });
      const paid = events.some((event) => event.eventName === "InvoicePaid");
      const rejected = events.some((event) => event.eventName === "PaymentRejected");
      const result: Decision = {
        invoiceId: invoice.id.toString(),
        merchant: invoice.merchant,
        amount: invoice.amount.toString(),
        decision: paid ? "paid" : rejected ? "blocked" : "rejected",
        reason: paid ? undefined : reason ?? "contract_rejected_payment",
        transactionHash: hash,
      };
      logDecision(result);
      decisions.push(result);
      if (paid) spentThisRun += invoice.amount;
    } catch (error) {
      if (error instanceof Error && error.name === "WaitForTransactionReceiptTimeoutError") {
        return {
          status: 500,
          body: {
            error: "Agent run failed while waiting for transaction confirmation.",
            agent: account.address,
            processed: decisions.length,
            decisions,
          },
        };
      }
      const result: Decision = {
        invoiceId: invoice.id.toString(),
        merchant: invoice.merchant,
        amount: invoice.amount.toString(),
        decision: reason ? "blocked" : "error",
        reason: error instanceof Error ? error.message : "unknown_error",
      };
      logDecision(result);
      decisions.push(result);
    }
  }

  return {
    status: 200,
    body: {
      agent: account.address,
      processed: decisions.length,
      decisions,
    },
  };
  } catch (error) {
    console.error("[stipend-agent] Run failed", error);
    return {
      status: 500,
      body: { error: "Agent run failed. Check the server logs." },
    };
  } finally {
    agentRunInProgress = false;
  }
}
