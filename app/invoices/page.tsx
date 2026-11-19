"use client";

import "./page.css";
import { useCallback, useEffect, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { useAccount, useWriteContract } from "wagmi";
import { PageHeader } from "@/app/components/PageHeader";
import { StatusPill } from "@/app/components/StatusPill";
import { TransactionFeedback } from "@/app/components/TransactionFeedback";
import { useAgentAddress } from "@/app/hooks/useAgentAddress";
import { useTransaction } from "@/app/hooks/useTransaction";
import { aevum, stipendAbi, stipendAddress } from "@/app/lib/stipend";

type Invoice = { id: string; merchant: string; agent: string; amount: string; amountUsd: string };

export default function InvoicesPage() {
  const { address, chainId, isConnected } = useAccount();
  const { agent, error: agentError } = useAgentAddress();
  const tx = useTransaction();
  const { writeContractAsync } = useWriteContract();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [amount, setAmount] = useState("");
  const canWrite = isConnected && chainId === aevum.id;

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api?action=invoices", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load invoices.");
      setInvoices(data.invoices as Invoice[]);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load invoices.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function createInvoice() {
    if (!agent || !amount) return;
    try {
      const value = parseUnits(amount, 6);
      if (value <= 0n) throw new Error("Enter an amount greater than zero.");
      await tx.execute(() => writeContractAsync({ address: stipendAddress, abi: stipendAbi, functionName: "createInvoice", args: [agent, value] }), "Invoice created on Aevum.");
      setAmount("");
      await refresh();
    } catch { /* Transaction feedback explains wallet and contract errors. */ }
  }

  return (
    <div className="invoices-page">
      <PageHeader eyebrow="INVOICE DESK" title="Every request starts here." subtitle="Merchants create invoices for your agent. It only pays when the on-chain rules allow it." action={<StatusPill tone={loading ? "neutral" : "good"}>{loading ? "Syncing chain" : `${invoices.length} open`}</StatusPill>} />
      {agentError && <div className="danger-box invoice-alert">{agentError}</div>}
      <div className="invoice-layout">
        <section className="card invoice-create-card"><div className="invoice-card-top"><div className="invoice-illustration">＋</div><div><div className="section-label">Create an invoice</div><p className="muted tiny">Invoice the configured agent wallet directly.</p></div></div>
          <div className="invoice-agent-target"><span>INVOICE RECIPIENT</span><code>{agent ?? "Loading agent address…"}</code></div>
          <label className="field-label invoice-amount-field">Invoice amount<input className="field" value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="0.000001" step="0.01" placeholder="0.00" /><small>tUSD8 · 6 decimals</small></label>
          <div className="invoice-merchant-note"><span>↳</span><p>The connected wallet becomes the merchant on-chain.<br /><b>{address ?? "Connect a wallet to create an invoice"}</b></p></div>
          <button className="button button-primary invoice-submit" disabled={!canWrite || !agent || !amount || tx.status === "pending"} onClick={createInvoice}>{tx.status === "pending" ? "Creating invoice…" : "Create invoice"}<span>→</span></button>
          {!isConnected && <div className="invoice-help">Connect a merchant wallet to create an invoice.</div>}
          {isConnected && chainId !== aevum.id && <div className="invoice-help warn">Switch to Aevum Testnet before creating invoices.</div>}
          <TransactionFeedback state={tx} />
        </section>
        <section className="card invoice-side-info"><div className="eyebrow">PAYMENT FLOW</div><h2>Built-in guardrails.</h2><p>Each invoice is checked by the Stipend contract when the agent submits payment.</p><div className="invoice-guard"><span>01</span><div><b>Merchant approval</b><small>Only wallets on the payer’s allowlist.</small></div><i>✓</i></div><div className="invoice-guard"><span>02</span><div><b>Spend limits</b><small>Per-payment, daily, and total budget.</small></div><i>✓</i></div><div className="invoice-guard"><span>03</span><div><b>Permission window</b><small>Revoked and expired policies stop payment.</small></div><i>✓</i></div></section>
      </div>
      <section className="invoice-list-section"><div className="invoice-list-heading"><div><h2>Open invoices</h2><p>Invoices waiting for the agent to review.</p></div><div className="invoice-filters"><span className="selected">Open</span><button className="refresh-button" onClick={() => void refresh()} disabled={loading}>↻ Refresh</button></div></div>
        <div className="card invoice-table-card">{loadError ? <div className="danger-box">{loadError}</div> : loading ? <div className="empty-state">Reading open invoices from Aevum…</div> : invoices.length === 0 ? <div className="empty-state"><b>No open invoices</b><br />New merchant requests will appear here.</div> : <div className="table-wrap"><table className="data-table"><thead><tr><th>INVOICE</th><th>MERCHANT</th><th>AMOUNT</th><th>STATUS</th><th>RECIPIENT</th></tr></thead><tbody>{invoices.map((invoice) => <tr key={invoice.id}><td><b className="invoice-id">#{invoice.id}</b><small>On-chain request</small></td><td><span className="invoice-merchant-cell">{invoice.merchant}</span></td><td><b>{invoice.amountUsd}</b><small>tUSD8</small></td><td><StatusPill tone="neutral">Open</StatusPill></td><td><span className="invoice-recipient">{invoice.agent.slice(0, 7)}…{invoice.agent.slice(-5)}</span></td></tr>)}</tbody></table></div>}</div>
      </section>
    </div>
  );
}
