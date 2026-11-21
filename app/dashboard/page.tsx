"use client";

import "./page.css";
import Link from "next/link";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { formatUnits } from "viem";
import { PageHeader } from "@/app/components/PageHeader";
import { StatusPill } from "@/app/components/StatusPill";
import { TransactionFeedback } from "@/app/components/TransactionFeedback";
import { useAgentAddress } from "@/app/hooks/useAgentAddress";
import { useTransaction } from "@/app/hooks/useTransaction";
import { aevum, stipendAbi, stipendAddress } from "@/app/lib/stipend";

function usd(amount?: bigint) { return amount === undefined ? "—" : formatUnits(amount, 6); }
const noAgent = "0x0000000000000000000000000000000000000000" as const;

export default function DashboardPage() {
  const { address, chainId, isConnected } = useAccount();
  const { agent } = useAgentAddress();
  const tx = useTransaction();
  const { writeContractAsync } = useWriteContract();
  const payer = useReadContract({ address: stipendAddress, abi: stipendAbi, functionName: "payer" });
  const paused = useReadContract({ address: stipendAddress, abi: stipendAbi, functionName: "paused", query: { refetchInterval: 8_000 } });
  const balance = useReadContract({ address: stipendAddress, abi: stipendAbi, functionName: "vaultBalance", query: { refetchInterval: 8_000 } });
  const policy = useReadContract({ address: stipendAddress, abi: stipendAbi, functionName: "policies", args: [agent ?? noAgent], query: { enabled: Boolean(agent), refetchInterval: 8_000 } });
  const day = BigInt(Math.floor(Date.now() / 86_400_000));
  const dailySpent = useReadContract({ address: stipendAddress, abi: stipendAbi, functionName: "dailySpent", args: [agent ?? noAgent, day], query: { enabled: Boolean(agent), refetchInterval: 8_000 } });
  const isPayer = Boolean(address && payer.data && address.toLowerCase() === payer.data.toLowerCase());
  const currentPolicy = policy.data;
  const active = Boolean(currentPolicy && !currentPolicy[5] && BigInt(Math.floor(Date.now() / 1000)) <= currentPolicy[3]);
  const percent = currentPolicy?.[0] ? Math.min(100, Number((currentPolicy[4] * 10_000n) / currentPolicy[0]) / 100) : 0;

  async function revokeAgent() {
    if (!agent) return;
    try {
      await tx.execute(() => writeContractAsync({ address: stipendAddress, abi: stipendAbi, functionName: "revoke", args: [agent] }), "Agent permission revoked.");
      await policy.refetch();
    } catch { /* Feedback is shown by the transaction panel. */ }
  }

  async function toggleVaultPause() {
    if (!isPayer || paused.data === undefined) return;
    const functionName = paused.data ? "unpause" : "pause";
    try {
      await tx.execute(
        () => writeContractAsync({ address: stipendAddress, abi: stipendAbi, functionName }),
        paused.data ? "Vault unpaused." : "Vault paused.",
      );
      await paused.refetch();
    } catch { /* Feedback is shown by the transaction panel. */ }
  }

  return (
    <div className="dashboard-page">
      <PageHeader eyebrow="ACCOUNT OVERVIEW" title="Your allowance, at a glance." subtitle="See how much is funded, what your agent has spent, and how much permission remains." action={<span className="dash-network"><i /> AEVUM TESTNET</span>} />
      {paused.data && <div className="warning-box dash-notice dash-paused-notice"><StatusPill tone="warning">Vault paused</StatusPill><span>Agent payments are currently disabled until the payer unpauses the vault.</span></div>}
      {!isConnected && <div className="warning-box dash-notice">Connect the payer wallet for this vault to manage its allowance.</div>}
      {isConnected && chainId === aevum.id && !isPayer && <div className="warning-box dash-notice">This connected wallet is not the payer that owns this Stipend vault. Read-only information is still available.</div>}
      <section className="dash-top-grid">
        <article className="card allowance-panel">
          <div className="panel-head"><div><div className="stat-label">AGENT ALLOWANCE</div><h2>Spending permission</h2></div>{currentPolicy && <StatusPill tone={active ? "good" : "error"}>{active ? "Active" : currentPolicy[5] ? "Revoked" : "Expired"}</StatusPill>}</div>
          <div className="allowance-overview">
            <div className="progress-donut" style={{ "--used": `${percent}%` } as React.CSSProperties}><div><b>{usd(currentPolicy?.[0] ? currentPolicy[0] - currentPolicy[4] : undefined)}</b><small>tUSD8 left</small></div></div>
            <div className="allowance-stats"><div className="stat-label">TOTAL SPENT</div><div className="spent-figure">{usd(currentPolicy?.[4])} <small>/ {usd(currentPolicy?.[0])}</small></div><div className="progress-track"><span style={{ width: `${percent}%` }} /></div><div className="stat-note">{percent.toFixed(1)}% of the total allowance used</div></div>
          </div>
          <div className="allowance-footer"><div><span>Per payment</span><b>{usd(currentPolicy?.[1])} <small>tUSD8</small></b></div><div><span>Daily limit</span><b>{usd(currentPolicy?.[2])} <small>tUSD8</small></b></div><div><span>Permission</span><b>{currentPolicy ? `${new Date(Number(currentPolicy[3]) * 1000).toLocaleDateString()}` : "—"}</b></div></div>
        </article>
        <div className="dash-stat-stack">
          <article className="card stat-card"><span className="stat-icon vault-icon">▣</span><div className="stat-label">VAULT BALANCE</div><div className="stat-value">{usd(balance.data)} <small>tUSD8</small></div><div className="stat-note">Deposited funds held by Stipend</div><Link href="/rules" className="stat-link">Manage funds →</Link></article>
          <article className="card stat-card"><span className="stat-icon daily-icon">◷</span><div className="stat-label">USED TODAY</div><div className="stat-value">{usd(dailySpent.data)} <small>/ {usd(currentPolicy?.[2])}</small></div><div className="stat-note">Your limit resets at 00:00 UTC</div></article>
        </div>
      </section>
      <section className="dash-bottom-grid">
        <article className="card card-pad"><div className="section-head"><div><h2 className="section-label">Agent wallet</h2><p className="muted tiny">The only address permitted to pay invoices.</p></div><StatusPill tone={agent ? "good" : "warning"}>{agent ? "Connected" : "Loading"}</StatusPill></div><div className="agent-address">{agent ?? "Loading agent address…"}</div><div className="address-caption">AGENT · AEVUM 44005</div><div className="divider" /><div className="agent-actions"><Link className="button button-quiet" href="/rules">Edit spending rules</Link><div className="agent-action-buttons"><button className="button button-danger" disabled={!isPayer || !agent || currentPolicy?.[5] || tx.status === "pending"} onClick={revokeAgent}>Revoke agent</button>{paused.data !== undefined && <button className={`button ${paused.data ? "button-primary" : "button-quiet"}`} disabled={!isPayer || tx.status === "pending"} onClick={toggleVaultPause}>{paused.data ? "Unpause vault" : "Pause vault"}</button>}</div></div><TransactionFeedback state={tx} />{isConnected && chainId !== aevum.id && <div className="tiny muted" style={{ marginTop: 10 }}>Switch to Aevum Testnet to send transactions.</div>}</article>
        <article className="card card-pad recent-card"><div className="section-head"><div><h2 className="section-label">Keep the limits clear.</h2><p className="muted tiny">Your agent stays inside the policy on every invoice.</p></div><span className="shield-icon">⌑</span></div><div className="limit-row"><span>Per payment cap</span><b>{usd(currentPolicy?.[1])} <small>tUSD8</small></b></div><div className="limit-row"><span>Daily spending</span><b>{usd(dailySpent.data)} <small>/ {usd(currentPolicy?.[2])}</small></b></div><div className="limit-row"><span>Approved merchants</span><b>Rules <span className="green-arrow">↗</span></b></div><Link className="button button-primary full-button" href="/invoices">Review invoices <span>→</span></Link></article>
      </section>
      <div className="dash-footnote"><span>◈</span> Funds remain in your vault. Revoke agent permission at any time.</div>
    </div>
  );
}
