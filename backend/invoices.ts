import "server-only";
import { getAddress, type Address } from "viem";
import { getAgentAccount, STIPEND_ADDRESS } from "./config";
import { publicClient, stipendAbi } from "./chain";

export type OpenInvoice = {
  id: bigint;
  merchant: Address;
  agent: Address;
  amount: bigint;
};

const PAGE_SIZE = 50n;

export async function getOpenInvoices(forAgent?: Address): Promise<OpenInvoice[]> {
  const agentAddress = forAgent ?? getAgentAccount().address;
  const result: OpenInvoice[] = [];
  let offset = 0n;

  while (true) {
    const [ids, total] = await publicClient.readContract({
      address: STIPEND_ADDRESS,
      abi: stipendAbi,
      functionName: "getOpenInvoices",
      args: [agentAddress, offset, PAGE_SIZE],
    });

    for (const id of ids) {
      const invoiceData = await publicClient.readContract({
        address: STIPEND_ADDRESS,
        abi: stipendAbi,
        functionName: "invoices",
        args: [id],
      });
      result.push({
        id,
        merchant: getAddress(invoiceData[0]),
        agent: getAddress(invoiceData[1]),
        amount: invoiceData[2],
      });
    }

    offset += PAGE_SIZE;
    if (offset >= total) break;
  }

  return result;
}

export async function getAgentOpenInvoices() {
  const account = getAgentAccount();
  const invoices = await getOpenInvoices(account.address);
  return invoices.map((invoice) => {
    const whole = invoice.amount / 1_000_000n;
    const fraction = (invoice.amount % 1_000_000n).toString().padStart(6, "0");
    return {
      id: invoice.id.toString(),
      merchant: invoice.merchant,
      agent: invoice.agent,
      amount: invoice.amount.toString(),
      amountUsd: `${whole}.${fraction}`,
    };
  });
}
