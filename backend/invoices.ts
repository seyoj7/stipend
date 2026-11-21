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

const STIPEND_DEPLOYMENT_BLOCK = 3_756_025n;
const LOG_BLOCK_CHUNK_SIZE = 1_000n;

type InvoiceCache = {
  scannedThrough: bigint;
  openInvoices: Map<bigint, OpenInvoice>;
  scan?: Promise<void>;
};

type InvoiceCacheGlobal = typeof globalThis & {
  __stipendInvoiceCaches?: Map<string, InvoiceCache>;
};

const invoiceCaches = ((globalThis as InvoiceCacheGlobal).__stipendInvoiceCaches ??=
  new Map<string, InvoiceCache>());

export async function getOpenInvoices(forAgent?: Address): Promise<OpenInvoice[]> {
  const agentFilter = forAgent ?? getAgentAccount().address;
  const cacheKey = `${STIPEND_ADDRESS.toLowerCase()}:${agentFilter.toLowerCase()}`;
  let cache = invoiceCaches.get(cacheKey);
  if (!cache) {
    cache = { scannedThrough: STIPEND_DEPLOYMENT_BLOCK - 1n, openInvoices: new Map() };
    invoiceCaches.set(cacheKey, cache);
  }

  while (true) {
    const latestBlock = await publicClient.getBlockNumber();
    if (cache.scannedThrough >= latestBlock) break;
    if (cache.scan) {
      await cache.scan;
      continue;
    }

    cache.scan = (async () => {
      const scanTo = await publicClient.getBlockNumber();
      for (let fromBlock = cache!.scannedThrough + 1n; fromBlock <= scanTo; fromBlock += LOG_BLOCK_CHUNK_SIZE) {
        const toBlock = fromBlock + LOG_BLOCK_CHUNK_SIZE - 1n < scanTo
          ? fromBlock + LOG_BLOCK_CHUNK_SIZE - 1n
          : scanTo;
        const [createdEvents, paidEvents] = await Promise.all([
          publicClient.getContractEvents({
            address: STIPEND_ADDRESS,
            abi: stipendAbi,
            eventName: "InvoiceCreated",
            args: { agent: agentFilter },
            fromBlock,
            toBlock,
          }),
          publicClient.getContractEvents({
            address: STIPEND_ADDRESS,
            abi: stipendAbi,
            eventName: "InvoicePaid",
            args: { agent: agentFilter },
            fromBlock,
            toBlock,
          }),
        ]);

        for (const event of createdEvents) {
          const id = event.args.invoiceId;
          if (id === undefined) continue;
          const invoice = await publicClient.readContract({
            address: STIPEND_ADDRESS, abi: stipendAbi, functionName: "invoices", args: [id],
          });
          if (invoice[3]) continue;
          const agent = getAddress(invoice[1]);
          cache!.openInvoices.set(id, {
            id,
            merchant: getAddress(invoice[0]),
            agent,
            amount: invoice[2],
          });
        }
        for (const event of paidEvents) {
          const id = event.args.invoiceId;
          if (id !== undefined) cache!.openInvoices.delete(id);
        }
        cache!.scannedThrough = toBlock;
      }
    })();
    try {
      await cache.scan;
    } finally {
      cache.scan = undefined;
    }
  }

  return [...cache.openInvoices.values()];
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
