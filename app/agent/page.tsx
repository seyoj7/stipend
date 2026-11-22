"use client";

import "./page.css";
import { useCallback, useEffect, useState } from "react";
import { useAccount, useReadContract, useSignMessage } from "wagmi";
import type { Address } from "viem";
import { PageHeader } from "@/app/components/PageHeader";
import { StatusPill } from "@/app/components/StatusPill";
import { useAgentAddress } from "@/app/hooks/useAgentAddress";
import { aevum, stipendAbi, stipendAddress } from "@/app/lib/stipend";

type Decision = { invoiceId: string; merchant?: Address; amount?: string; decision: "blocked" | "paid" | "rejected" | "error"; reason?: string; transactionHash?: string };
type Invoice = { id: string; merchant: Address; agent: Address; amountUsd: string };
const rejectionReasonLabels = ["None", "Revoked", "Expired", "Merchant not allowed", "Payment cap exceeded", "Budget exceeded", "Daily limit exceeded", "Invoice already paid", "Insufficient vault balance", "Wrong agent", "Invoice not found"];
function reasonLabel(reason?: string) {
  if (!reason) return undefined;
  if (/^\d+$/.test(reason)) return rejectionReasonLabels[Number(reason)];
  if (reason === "InvoiceNotFound" || reason === "invoice_not_found") return rejectionReasonLabels[10];
  return reason.replaceAll("_", " ");
}

export default function AgentPage() {
  const { address, chainId, isConnected } = useAccount();
  const { agent, error: agentError } = useAgentAddress();
  const { signMessageAsync, isPending: signing } = useSignMessage();
  const payer = useReadContract({ address: stipendAddress, abi: stipendAbi, functionName: "payer" });
  const policy = useReadContract({ address: stipendAddress, abi: stipendAbi, functionName: "policies", args: [agent ?? "0x0000000000000000000000000000000000000000"], query: { enabled: Boolean(agent) } });
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [runState, setRunState] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const canRun = Boolean(isConnected && address && payer.data && address.toLowerCase() === payer.data.toLowerCase() && chainId === aevum.id && agent);

  const loadInvoices = useCallback(async () => {
    try {
      const response = await fetch("/api?action=invoices", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not read invoices.");
      setInvoices(data.invoices as Invoice[]);
      setLoadError("");
    } catch (error) { setLoadError(error instanceof Error ? error.message : "Could not read invoices."); }
  }, []);
  useEffect(() => { void loadInvoices(); }, [loadInvoices]);

  async function runNow() {
    if (!canRun) return;
    setRunState("pending");
    setMessage("Approve the run request with your payer wallet…");
    setDecisions([]);
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const signedMessage = ["Stipend agent run", `Contract: ${stipendAddress}`, "Chain ID: 44005", `Timestamp: ${timestamp}`].join("\n");
      const signature = await signMessageAsync({ message: signedMessage });
      setMessage("Signature verified. The agent is checking open invoices…");
      const response = await fetch("/api?action=run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timestamp, signature }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "The agent run failed.");
      setDecisions(result.decisions as Decision[]);
      const paidCount = (result.decisions as Decision[]).filter((item) => item.decision === "paid").length;
      setRunState("success");
      setMessage(paidCount ? `Run complete · ${paidCount} invoice${paidCount === 1 ? "" : "s"} paid` : "Run complete · no eligible invoices to pay");
      await loadInvoices();
    } catch (error) {
      setRunState("error");
      setMessage(error instanceof Error ? error.message.split("\n")[0] : "Agent run failed.");
    }
  }

  const active = Boolean(policy.data && !policy.data[5] && BigInt(Math.floor(Date.now() / 1000)) <= policy.data[3]);
  const paidCount = decisions.filter((item) => item.decision === "paid").length;
  const blockedCount = decisions.filter((item) => item.decision === "blocked" || item.decision === "rejected").length;

  return (
    <div className="agent-page">
      <PageHeader eyebrow="AGENT CONTROL" title="Let it work. Keep the controls." subtitle="The agent reviews each invoice against the vault policy and only submits payments that fit every rule." action={<StatusPill tone={active ? "good" : "warning"}>{active ? "Permission active" : "Needs policy"}</StatusPill>} />
      {(agentError || loadError) && <div className="danger-box agent-alert">{agentError ?? loadError}</div>}
      <section className="card agent-command-card"><div className="agent-command-main"><div className="agent-glyph">✳</div><div className="agent-command-copy"><div className="agent-status-line"><span className="eyebrow">STIPEND AGENT</span>{active && <span className="live-dot"><i /> READY</span>}</div><h2>Invoice payment agent</h2><p>Reviews open invoices, checks limits, and pays eligible merchants from the vault.</p></div></div><div className="agent-command-side"><span className="agent-wallet-label">AGENT WALLET</span><code>{agent ?? "Loading agent…"}</code><button className="button button-primary run-button" disabled={!canRun || signing || runState === "pending"} onClick={runNow}>{signing || runState === "pending" ? <><span className="spinner" /> Running…</> : <>Run agent now <span>→</span></>}</button></div>
        {!isConnected && <div className="agent-command-notice">Connect the payer wallet to authorize a run.</div>}
        {isConnected && chainId !== aevum.id && <div className="agent-command-notice">Switch to Aevum Testnet to run the agent.</div>}
        {isConnected && chainId === aevum.id && address && payer.data && address.toLowerCase() !== payer.data.toLowerCase() && <div className="agent-command-notice">Only the payer wallet can authorize an agent run.</div>}
        {runState !== "idle" && <div className={`agent-run-status ${runState}`} role={runState === "error" ? "alert" : "status"}><span>{runState === "pending" ? "◌" : runState === "success" ? "✓" : "!"}</span>{message}</div>}
      </section>
      <section className="agent-stats-row"><article className="card agent-stat"><span className="agent-stat-icon waiting">◷</span><div><small>OPEN INVOICES</small><b>{invoices.length}</b><span>Waiting for review</span></div></article><article className="card agent-stat"><span className="agent-stat-icon paid">✓</span><div><small>PAID THIS RUN</small><b>{paidCount}</b><span>Settled on Aevum</span></div></article><article className="card agent-stat"><span className="agent-stat-icon blocked">⊘</span><div><small>BLOCKED THIS RUN</small><b>{blockedCount}</b><span>Outside policy limits</span></div></article></section>
      <section className="card agent-log-card"><div className="agent-log-heading"><div><h2>Decision log</h2><p>Each invoice receives an explicit policy check.</p></div><StatusPill tone="neutral">{decisions.length} decisions</StatusPill></div>
        {decisions.length ? <div className="decision-list">{decisions.map((decision, index) => <div className="decision-row" key={`${decision.invoiceId}-${index}`}><span className={`decision-mark ${decision.decision}`}>{decision.decision === "paid" ? "✓" : decision.decision === "blocked" || decision.decision === "rejected" ? "⊘" : "!"}</span><div className="decision-details"><b>{decision.decision === "paid" ? `Paid invoice #${decision.invoiceId}` : decision.decision === "blocked" ? `Blocked invoice #${decision.invoiceId}` : decision.decision === "rejected" ? `Rejected invoice #${decision.invoiceId}` : `Payment error · invoice #${decision.invoiceId}`}</b><small>{reasonLabel(decision.reason) ?? `Paid ${decision.amount ? (Number(decision.amount) / 1_000_000).toFixed(2) : ""} tUSD8 to ${decision.merchant ?? "merchant"}`}</small></div>{decision.transactionHash && <a href={`https://explorer-test.qday.info/tx/${decision.transactionHash}`} target="_blank" rel="noreferrer">View tx ↗</a>}</div>)}</div> : <div className="agent-empty"><span>✳</span><b>No decisions yet</b><p>Run the agent to evaluate open invoices against your active policy.</p></div>}
      </section>
      <div className="agent-sign-note"><span>◈</span> Your payer wallet authorizes the run. The agent’s signing key stays on the server.</div>
    </div>
  );
}
