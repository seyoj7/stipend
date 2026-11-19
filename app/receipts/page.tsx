"use client";

import "./page.css";
import { useEffect, useState } from "react";
import { formatUnits, parseAbiItem, type Address } from "viem";
import { usePublicClient } from "wagmi";
import { PageHeader } from "@/app/components/PageHeader";
import { StatusPill } from "@/app/components/StatusPill";
import { useAgentAddress } from "@/app/hooks/useAgentAddress";
import { aevum, stipendAddress, stipendDeploymentBlock } from "@/app/lib/stipend";

type Receipt = { invoiceId: string; merchant: Address; amount: string; hash: string; timestamp: number };
const paidEvent = parseAbiItem("event InvoicePaid(uint256 indexed invoiceId,address indexed agent,address indexed merchant,uint256 amount)");

export default function ReceiptsPage() {
  const publicClient = usePublicClient({ chainId: aevum.id });
  const { agent, error: agentError } = useAgentAddress();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!agent || !publicClient) return;
    let cancelled = false;
    async function load() {
      setState("loading");
      setError("");
      try {
        const latest = await publicClient!.getBlockNumber();
        const first = latest > stipendDeploymentBlock + 5_000n ? latest - 5_000n : stipendDeploymentBlock;
        const logs = [];
        for (let from = first; from <= latest; from += 1_000n) {
          const to = from + 999n < latest ? from + 999n : latest;
          logs.push(...await publicClient!.getLogs({ address: stipendAddress, event: paidEvent, args: { agent: agent! }, fromBlock: from, toBlock: to }));
        }
        const timestamps = new Map<bigint, number>();
        await Promise.all([...new Set(logs.map((log) => log.blockNumber))].map(async (blockNumber) => {
          if (blockNumber === null) return;
          const block = await publicClient!.getBlock({ blockNumber });
          timestamps.set(blockNumber, Number(block.timestamp));
        }));
        const rows = logs.map((log) => ({
          invoiceId: log.args.invoiceId!.toString(),
          merchant: log.args.merchant!,
          amount: log.args.amount!.toString(),
          hash: log.transactionHash!,
          timestamp: timestamps.get(log.blockNumber!) ?? 0,
        })).sort((a, b) => b.timestamp - a.timestamp);
        if (!cancelled) { setReceipts(rows); setState("ready"); }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Could not load receipts from Aevum.");
          setState("error");
        }
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [agent, publicClient]);

  return (
    <div className="receipts-page">
      <PageHeader eyebrow="ON-CHAIN HISTORY" title="A receipt for every payment." subtitle="Confirmed agent payments, recorded on Aevum Testnet and linked to the explorer." action={<StatusPill tone={state === "error" ? "error" : state === "loading" ? "neutral" : "good"}>{state === "loading" ? "Syncing chain" : state === "error" ? "Sync error" : `${receipts.length} recent`}</StatusPill>} />
      {(agentError || error) && <div className="danger-box receipt-error">{agentError ?? error}</div>}
      <div className="receipt-summary"><div><span className="receipt-icon">↗</span><div><small>RECENT CONFIRMED PAYMENTS</small><b>{receipts.length}</b></div></div><span className="receipt-range">Last 5,000 blocks · agent wallet</span></div>
      <section className="card receipt-card">
        {state === "loading" ? <div className="empty-state"><span className="receipt-loader" />Reading payment events from Aevum…</div> : state === "error" ? <div className="empty-state">Couldn’t load payment events. Try refreshing the page.</div> : receipts.length === 0 ? <div className="receipt-empty"><span>↗</span><b>No payments yet</b><p>Once the agent pays an invoice, its confirmed transaction will appear here.</p></div> : <div className="table-wrap"><table className="data-table"><thead><tr><th>TIME</th><th>INVOICE</th><th>MERCHANT</th><th>AMOUNT</th><th>TRANSACTION</th></tr></thead><tbody>{receipts.map((receipt) => <tr key={receipt.hash}><td>{receipt.timestamp ? new Date(receipt.timestamp * 1000).toLocaleString() : "—"}</td><td><span className="receipt-invoice">#{receipt.invoiceId}</span></td><td><span className="receipt-merchant">{receipt.merchant.slice(0, 8)}…{receipt.merchant.slice(-5)}</span></td><td><b>{formatUnits(BigInt(receipt.amount), 6)}</b><small>tUSD8</small></td><td><a className="receipt-tx" href={`https://explorer-test.qday.info/tx/${receipt.hash}`} target="_blank" rel="noreferrer"><code>{receipt.hash.slice(0, 10)}…{receipt.hash.slice(-6)}</code><span>↗</span></a></td></tr>)}</tbody></table></div>}
      </section>
      <div className="receipt-footnote"><span>◈</span> Receipt records are read directly from Stipend’s InvoicePaid events.</div>
    </div>
  );
}
