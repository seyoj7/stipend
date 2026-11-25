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

type InvoiceRecord = OpenInvoice & { paid: boolean; closed: boolean; blocked: boolean };
type InvoiceListFunction = "getOpenInvoices" | "getBlockedInvoices";

const PAGE_SIZE = 50n;

async function readInvoiceList(agent: Address, functionName: InvoiceListFunction): Promise<InvoiceRecord[]> {
  const invoices: InvoiceRecord[] = [];
  let offset = 0n;

  while (true) {
    const [ids, total] = await publicClient.readContract({
      address: STIPEND_ADDRESS,
      abi: stipendAbi,
      functionName,
      args: [agent, offset, PAGE_SIZE],
    });

    const page = await Promise.all(ids.map(async (id) => {
      const record = await publicClient.readContract({
        address: STIPEND_ADDRESS,
        abi: stipendAbi,
        functionName: "invoices",
        args: [id],
      });
      return {
        id,
        merchant: getAddress(record[0]),
        agent: getAddress(record[1]),
        amount: record[2],
        paid: record[3],
        closed: record[4],
        blocked: record[5],
      };
    }));

    invoices.push(...page);
    offset += PAGE_SIZE;
    if (offset >= total) break;
  }

  return invoices;
}

function toApiInvoice(invoice: Pick<InvoiceRecord, "id" | "merchant" | "agent" | "amount">) {
  const whole = invoice.amount / 1_000_000n;
  const fraction = (invoice.amount % 1_000_000n).toString().padStart(6, "0");
  return {
    id: invoice.id.toString(),
    merchant: invoice.merchant,
    agent: invoice.agent,
    amount: invoice.amount.toString(),
    amountUsd: `${whole}.${fraction}`,
  };
}

export async function getOpenInvoices(forAgent?: Address): Promise<OpenInvoice[]> {
  const agent = forAgent ?? getAgentAccount().address;
  const invoices = await readInvoiceList(agent, "getOpenInvoices");
  // Blocked entries remain in the contract's open array, but are no longer open in the app.
  return invoices.filter((invoice) => !invoice.blocked);
}

export async function getAgentBlockedInvoices() {
  const agent = getAgentAccount().address;
  const invoices = await readInvoiceList(agent, "getBlockedInvoices");
  return invoices.filter((invoice) => !invoice.closed).map(toApiInvoice);
}

export async function getAgentOpenInvoices() {
  const invoices = await getOpenInvoices();
  return invoices.map(toApiInvoice);
}
