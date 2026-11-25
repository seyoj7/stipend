"use client";

import "./page.css";
import { useEffect, useState } from "react";
import { formatUnits, parseAbiItem, type Address } from "viem";
import { usePublicClient } from "wagmi";
import { PageHeader } from "@/app/components/PageHeader";
import { StatusPill } from "@/app/components/StatusPill";
import { useAgentAddress } from "@/app/hooks/useAgentAddress";
import { aevum, stipendAbi, stipendAddress, stipendDeploymentBlock } from "@/app/lib/stipend";

type Receipt = { invoiceId: string; merchant: Address; amount: string; hash: string; timestamp: number; status: "Paid" | "Closed" };
const paidEvent = parseAbiItem("event InvoicePaid(uint256 indexed invoiceId,address indexed agent,address indexed merchant,uint256 amount)");
const closedEvent = parseAbiItem("event InvoiceClosed(uint256 indexed invoiceId,address indexed caller)");

export default function ReceiptsPage() {
  const publicClient = usePublicClient({ chainId: aevum.id });
  const { agent, error: agentError } = useAgentAddress();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [state, setState] = useState<"loading" | "scanning" | "ready" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!agent || !publicClient) {
      setReceipts([]);
      setState(agentError ? "error" : "loading");
      setError(agentError ?? "");
      return () => { cancelled = true; };
    }
    const client = publicClient;
    const agentAddress = agent;

    async function load() {
      setState("loading");
      setError("");
      setReceipts([]);
      const timestamps = new Map<bigint, number>();
      try {
        const latestBlock = await client.getBlockNumber();
        const blockedIds: bigint[] = [];
        let blockedOffset = 0n;
        while (true) {
          const [ids, total] = await client.readContract({
            address: stipendAddress,
            abi: stipendAbi,
            functionName: "getBlockedInvoices",
            args: [agentAddress, blockedOffset, 50n],
          });
          blockedIds.push(...ids);
          blockedOffset += 50n;
          if (blockedOffset >= total) break;
        }
        const closedIds = new Set<string>();
        await Promise.all(blockedIds.map(async (id) => {
          const invoice = await client.readContract({
            address: stipendAddress,
            abi: stipendAbi,
            functionName: "invoices",
            args: [id],
          });
          if (invoice[4]) closedIds.add(id.toString());
        }));
        const ranges: { fromBlock: bigint; toBlock: bigint }[] = [];
        for (let toBlock = latestBlock; toBlock >= stipendDeploymentBlock;) {
          const fromBlock = toBlock - 999n >= stipendDeploymentBlock ? toBlock - 999n : stipendDeploymentBlock;
          ranges.push({ fromBlock, toBlock });
          if (fromBlock === stipendDeploymentBlock) break;
          toBlock = fromBlock - 1n;
        }

        setState("scanning");
        let nextRange = 0;
        const scanRange = async () => {
          while (nextRange < ranges.length && !cancelled) {
            const range = ranges[nextRange++];
            const [paidLogs, closedLogs] = await Promise.all([
              client.getLogs({ address: stipendAddress, event: paidEvent, args: { agent: agentAddress }, ...range }),
              client.getLogs({ address: stipendAddress, event: closedEvent, ...range }),
            ]);
            const relevantClosedLogs = closedLogs.filter((log) => closedIds.has(log.args.invoiceId!.toString()));
            const missingTimestamps = [...new Set([...paidLogs, ...relevantClosedLogs].map((log) => log.blockNumber).filter(
              (blockNumber): blockNumber is bigint => blockNumber !== null && !timestamps.has(blockNumber),
            ))];
            await Promise.all(missingTimestamps.map(async (blockNumber) => {
              const block = await client.getBlock({ blockNumber });
              timestamps.set(blockNumber, Number(block.timestamp));
            }));
            if (cancelled) return;
            const paidRows: Receipt[] = [...paidLogs].sort((left, right) => {
              if (left.blockNumber !== right.blockNumber) return left.blockNumber! > right.blockNumber! ? -1 : 1;
              return Number(right.logIndex ?? 0) - Number(left.logIndex ?? 0);
            }).map((log) => ({
              invoiceId: log.args.invoiceId!.toString(),
              merchant: log.args.merchant!,
              amount: log.args.amount!.toString(),
              hash: log.transactionHash!,
              timestamp: timestamps.get(log.blockNumber!) ?? 0,
              status: "Paid",
            }));
            const closedRows: Receipt[] = [...relevantClosedLogs].sort((left, right) => {
              if (left.blockNumber !== right.blockNumber) return left.blockNumber! > right.blockNumber! ? -1 : 1;
              return Number(right.logIndex ?? 0) - Number(left.logIndex ?? 0);
            }).map((log) => ({
              invoiceId: log.args.invoiceId!.toString(),
              merchant: "0x0000000000000000000000000000000000000000" as Address,
              amount: "0",
              hash: log.transactionHash!,
              timestamp: timestamps.get(log.blockNumber!) ?? 0,
              status: "Closed",
            }));
            const closedInvoiceDetails = await Promise.all(closedRows.map(async (row) => {
              const invoice = await client.readContract({
                address: stipendAddress,
                abi: stipendAbi,
                functionName: "invoices",
                args: [BigInt(row.invoiceId)],
              });
              return { ...row, merchant: invoice[0], amount: invoice[2].toString() };
            }));
            const rows = [...paidRows, ...closedInvoiceDetails];
            setReceipts((current) => [...current, ...rows].sort((left, right) => right.timestamp - left.timestamp));
          }
        };

        await Promise.all(Array.from({ length: Math.min(4, ranges.length) }, () => scanRange()));
        if (!cancelled) setState("ready");
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Could not load receipts from Aevum.");
          setState("error");
        }
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [agent, agentError, publicClient]);

  return (
    <div className="receipts-page">
      <PageHeader
        eyebrow="ON-CHAIN HISTORY"
        title="A record for every outcome."
        subtitle="Confirmed payments and closed blocked invoices, recorded on Aevum Testnet."
        action={<StatusPill tone={state === "error" ? "error" : state === "ready" ? "good" : "neutral"}>{state === "loading" ? "Starting scan" : state === "scanning" ? "Scanning history" : state === "error" ? "Scan error" : `${receipts.length} receipts`}</StatusPill>}
      />
      {(agentError || error) && <div className="danger-box receipt-error">{agentError ?? `Could not finish scanning payment history. Showing receipts found so far. ${error}`}</div>}
      <div className="receipt-summary">
        <div><span className="receipt-icon">↗</span><div><small>PAYMENTS &amp; CLOSED INVOICES</small><b>{receipts.length}</b></div></div>
        <span className="receipt-range">Since deployment · agent wallet</span>
      </div>
      {state === "scanning" && <div className="receipt-scan-status"><span className="receipt-loader" />Scanning older blocks…</div>}
      <section className="card receipt-card">
        {state === "loading" ? (
          <div className="empty-state"><span className="receipt-loader" />Reading receipt events from Aevum…</div>
        ) : receipts.length === 0 && state === "error" ? (
          <div className="empty-state">No receipts could be loaded because the history scan failed.</div>
        ) : receipts.length === 0 ? (
          <div className="receipt-empty"><span>↗</span><b>No receipt activity yet</b><p>Paid invoices and closed blocked invoices will appear here.</p></div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>TIME</th><th>INVOICE</th><th>MERCHANT</th><th>AMOUNT</th><th>STATUS</th><th>TRANSACTION</th></tr></thead>
              <tbody>{receipts.map((receipt) => (
                <tr key={`${receipt.hash}-${receipt.status}-${receipt.invoiceId}`}>
                  <td>{receipt.timestamp ? new Date(receipt.timestamp * 1000).toLocaleString() : "—"}</td>
                  <td><span className="receipt-invoice">#{receipt.invoiceId}</span></td>
                  <td><span className="receipt-merchant">{receipt.merchant.slice(0, 8)}…{receipt.merchant.slice(-5)}</span></td>
                  <td><b>{formatUnits(BigInt(receipt.amount), 6)}</b><small>tUSD8</small></td>
                  <td><StatusPill tone={receipt.status === "Paid" ? "good" : "neutral"}>{receipt.status}</StatusPill></td>
                  <td><a className="receipt-tx" href={`https://explorer-test.qday.info/tx/${receipt.hash}`} target="_blank" rel="noreferrer"><code>{receipt.hash.slice(0, 10)}…{receipt.hash.slice(-6)}</code><span>↗</span></a></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
      <div className="receipt-footnote"><span>◈</span> Payments and invoice closures are read directly from Stipend’s InvoicePaid and InvoiceClosed events.</div>
    </div>
  );
}
