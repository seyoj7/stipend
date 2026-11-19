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

export async function getOpenInvoices(forAgent?: Address): Promise<OpenInvoice[]> {
  const nextId = await publicClient.readContract({
    address: STIPEND_ADDRESS, abi: stipendAbi, functionName: "nextInvoiceId",
  });
  const invoices: OpenInvoice[] = [];

  // Bound concurrent reads so a large invoice history does not flood the public RPC.
  const chunkSize = 40n;
  for (let first = 1n; first < nextId; first += chunkSize) {
    const last = first + chunkSize < nextId ? first + chunkSize : nextId;
    const results = await Promise.all(
      Array.from({ length: Number(last - first) }, (_, offset) => {
        const id = first + BigInt(offset);
        return publicClient.readContract({
          address: STIPEND_ADDRESS, abi: stipendAbi, functionName: "invoices", args: [id],
        }).then((invoice) => ({ id, invoice }));
      }),
    );

    for (const { id, invoice } of results) {
      if (invoice[0] === "0x0000000000000000000000000000000000000000" || invoice[3]) continue;
      const agent = getAddress(invoice[1]);
      if (forAgent && agent !== forAgent) continue;
      invoices.push({ id, merchant: getAddress(invoice[0]), agent, amount: invoice[2] });
    }
  }

  return invoices;
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
