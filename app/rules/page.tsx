"use client";

import "./page.css";
import { useEffect, useState } from "react";
import { formatUnits, isAddress, parseUnits, type Address } from "viem";
import { waitForTransactionReceipt } from "wagmi/actions";
import { useAccount, useConfig, useReadContract, useWriteContract } from "wagmi";
import { PageHeader } from "@/app/components/PageHeader";
import { StatusPill } from "@/app/components/StatusPill";
import { TransactionFeedback } from "@/app/components/TransactionFeedback";
import { useAgentAddress } from "@/app/hooks/useAgentAddress";
import { useTransaction } from "@/app/hooks/useTransaction";
import { aevum, stipendAbi, stipendAddress, tokenAbi, tusd8Address } from "@/app/lib/stipend";

export default function RulesPage() {
  const { address, chainId, isConnected } = useAccount();
  const config = useConfig();
  const { agent, error: agentError } = useAgentAddress();
  const tx = useTransaction();
  const { writeContractAsync } = useWriteContract();
  const [budget, setBudget] = useState("200");
  const [cap, setCap] = useState("50");
  const [daily, setDaily] = useState("80");
  const [days, setDays] = useState("7");
  const [merchantInput, setMerchantInput] = useState("");
  const [merchants, setMerchants] = useState<Address[]>([]);
  const [amount, setAmount] = useState("");
  const [formError, setFormError] = useState("");

  const payer = useReadContract({ address: stipendAddress, abi: stipendAbi, functionName: "payer" });
  const policy = useReadContract({ address: stipendAddress, abi: stipendAbi, functionName: "policies", args: [agent ?? "0x0000000000000000000000000000000000000000"], query: { enabled: Boolean(agent) } });
  const vaultBalance = useReadContract({ address: stipendAddress, abi: stipendAbi, functionName: "vaultBalance", query: { refetchInterval: 8_000 } });
  const tokenBalance = useReadContract({ address: tusd8Address, abi: tokenAbi, functionName: "balanceOf", args: [address!], query: { enabled: Boolean(address) } });
  const allowance = useReadContract({ address: tusd8Address, abi: tokenAbi, functionName: "allowance", args: [address!, stipendAddress], query: { enabled: Boolean(address) } });
  const isPayer = Boolean(address && payer.data && address.toLowerCase() === payer.data.toLowerCase());
  const canWrite = isConnected && chainId === aevum.id && isPayer;

  useEffect(() => {
    if (!agent) return;
    const key = `stipend:merchants:${agent.toLowerCase()}`;
    try { setMerchants((JSON.parse(localStorage.getItem(key) ?? "[]") as string[]).filter((item) => isAddress(item)).map((item) => item as Address)); }
    catch { setMerchants([]); }
    if (policy.data) {
      setBudget(formatUnits(policy.data[0], 6));
      setCap(formatUnits(policy.data[1], 6));
      setDaily(formatUnits(policy.data[2], 6));
      const left = Math.max(1, Math.ceil((Number(policy.data[3]) * 1000 - Date.now()) / 86_400_000));
      setDays(String(left));
    }
  }, [agent, policy.data]);

  function cacheMerchants(next: Address[]) {
    setMerchants(next);
    if (agent) localStorage.setItem(`stipend:merchants:${agent.toLowerCase()}`, JSON.stringify(next));
  }

  async function savePolicy() {
    tx.reset();
    setFormError("");
    if (!agent) return;
    try {
      const total = parseUnits(budget, 6);
      const perPayment = parseUnits(cap, 6);
      const dailyLimit = parseUnits(daily, 6);
      const duration = Number(days);
      if (total <= 0n || perPayment <= 0n || dailyLimit <= 0n || !Number.isInteger(duration) || duration < 1) throw new Error("Enter positive limits and an expiry of at least one whole day.");
      if (perPayment > total || dailyLimit > total) throw new Error("The per-payment cap and daily limit must not exceed the total budget.");
      const expiry = BigInt(Math.floor(Date.now() / 1000) + duration * 86_400);
      await tx.execute(() => writeContractAsync({ address: stipendAddress, abi: stipendAbi, functionName: "setPolicy", args: [agent, total, perPayment, dailyLimit, expiry] }), "Spending rules saved on Aevum.");
      await policy.refetch();
    } catch (cause) {
      if (cause instanceof Error && !tx.message) setFormError(cause.message);
    }
  }

  async function addMerchant() {
    tx.reset();
    setFormError("");
    if (!agent || !isAddress(merchantInput)) { setFormError("Enter a valid merchant wallet address."); return; }
    const merchant = merchantInput as Address;
    try {
      await tx.execute(() => writeContractAsync({ address: stipendAddress, abi: stipendAbi, functionName: "addMerchant", args: [agent, merchant] }), "Merchant approved.");
      cacheMerchants([...merchants.filter((item) => item.toLowerCase() !== merchant.toLowerCase()), merchant]);
      setMerchantInput("");
    } catch { /* Feedback is shown below. */ }
  }

  async function removeMerchant(merchant: Address) {
    tx.reset();
    if (!agent) return;
    try {
      await tx.execute(() => writeContractAsync({ address: stipendAddress, abi: stipendAbi, functionName: "removeMerchant", args: [agent, merchant] }), "Merchant removed.");
      cacheMerchants(merchants.filter((item) => item !== merchant));
    } catch { /* Feedback is shown below. */ }
  }

  async function deposit() {
    tx.reset();
    setFormError("");
    if (!amount || !address) return;
    try {
      const value = parseUnits(amount, 6);
      if (value <= 0n) throw new Error("Enter an amount greater than zero.");
      if ((tokenBalance.data ?? 0n) < value) throw new Error("Your connected wallet does not have enough tUSD8.");
      await tx.execute(async () => {
        if ((allowance.data ?? 0n) < value) {
          const approval = await writeContractAsync({ address: tusd8Address, abi: tokenAbi, functionName: "approve", args: [stipendAddress, value] });
          await waitForTransactionReceipt(config, { hash: approval });
        }
        return writeContractAsync({ address: stipendAddress, abi: stipendAbi, functionName: "deposit", args: [value] });
      }, "tUSD8 deposited into the vault.");
      await tokenBalance.refetch();
      await allowance.refetch();
      setAmount("");
    } catch (cause) {
      if (cause instanceof Error && !tx.message) setFormError(cause.message);
    }
  }

  async function withdraw() {
    tx.reset();
    setFormError("");
    if (!amount) return;
    try {
      const value = parseUnits(amount, 6);
      if (value <= 0n) throw new Error("Enter an amount greater than zero.");
      await tx.execute(() => writeContractAsync({ address: stipendAddress, abi: stipendAbi, functionName: "withdraw", args: [value] }), "tUSD8 withdrawn to your wallet.");
      setAmount("");
    } catch (cause) {
      if (cause instanceof Error && !tx.message) setFormError(cause.message);
    }
  }

  return (
    <div className="rules-page">
      <PageHeader eyebrow="SPENDING POLICY" title="Boundaries make autonomy work." subtitle="Give the agent a clear allowance. Every limit is enforced by the Stipend contract before a payment moves." action={<StatusPill tone={policy.data && !policy.data[5] ? "good" : "neutral"}>{policy.data && !policy.data[5] ? "Policy configured" : "No active policy"}</StatusPill>} />
      {!isConnected && <div className="warning-box rules-notice">Connect the payer wallet that owns this vault to change rules or move funds.</div>}
      {isConnected && chainId === aevum.id && !isPayer && <div className="warning-box rules-notice">The connected wallet is not the vault payer. It can’t update this policy.</div>}
      {agentError && <div className="danger-box rules-notice">{agentError}</div>}
      <div className="rules-layout">
        <div className="rules-main-column">
          <section className="card card-pad"><div className="rules-section-title"><span className="rules-number">01</span><div><h2 className="section-label">Set the allowance</h2><p className="muted tiny">All amounts use tUSD8 with six decimal places.</p></div></div>
            <div className="rules-form-grid">
              <label className="field-label">Total budget <span className="field-wrap"><input className="field" value={budget} onChange={(e) => setBudget(e.target.value)} type="number" min="0.000001" step="0.01" /><i>tUSD8</i></span></label>
              <label className="field-label">Per-payment cap <span className="field-wrap"><input className="field" value={cap} onChange={(e) => setCap(e.target.value)} type="number" min="0.000001" step="0.01" /><i>tUSD8</i></span></label>
              <label className="field-label">Daily limit <span className="field-wrap"><input className="field" value={daily} onChange={(e) => setDaily(e.target.value)} type="number" min="0.000001" step="0.01" /><i>tUSD8</i></span></label>
              <label className="field-label">Permission expires in <span className="field-wrap"><input className="field" value={days} onChange={(e) => setDays(e.target.value)} type="number" min="1" step="1" /><i>days</i></span></label>
            </div>
            <div className="policy-summary"><span>✳</span><p>Agent may spend up to <b>{budget || "0"} tUSD8 total</b>, no more than <b>{cap || "0"} tUSD8 per payment</b>, and up to <b>{daily || "0"} tUSD8 per day</b>. Permission expires in <b>{days || "0"} days</b>.</p></div>
            {formError && <div className="danger-box rules-error">{formError}</div>}
            <button className="button button-primary" disabled={!canWrite || !agent || tx.status === "pending"} onClick={savePolicy}>{tx.status === "pending" ? "Saving…" : "Save spending rules"}<span>→</span></button>
          </section>
          <section className="card card-pad merchant-section"><div className="rules-section-title"><span className="rules-number">02</span><div><h2 className="section-label">Approved merchants</h2><p className="muted tiny">Invoices from other wallets will be rejected.</p></div></div>
            <div className="merchant-input-row"><input className="field" value={merchantInput} onChange={(e) => setMerchantInput(e.target.value)} placeholder="Merchant wallet address · 0x…" /><button className="button" disabled={!canWrite || !agent || tx.status === "pending"} onClick={addMerchant}>＋ Add merchant</button></div>
            <div className="merchant-list">{merchants.length ? merchants.map((merchant) => <div className="merchant-entry" key={merchant}><span className="merchant-address-icon">M</span><span className="merchant-address">{merchant}</span><StatusPill>Allowed</StatusPill><button className="merchant-remove" aria-label="Remove merchant" disabled={!canWrite || tx.status === "pending"} onClick={() => removeMerchant(merchant)}>×</button></div>) : <div className="empty-state">No merchant addresses cached yet. Add a merchant wallet to allow invoice payments.</div>}</div>
            <p className="merchant-cache-note">The contract keeps the authoritative allowlist. This browser remembers addresses added here because the contract does not expose a merchant list.</p>
          </section>
        </div>
        <aside className="rules-side-column">
          <section className="card vault-card"><div className="vault-title"><span className="vault-icon-large">▣</span><div><h2 className="section-label">Vault funds</h2><p className="muted tiny">Held by the Stipend contract</p></div></div><div className="vault-amount">{vaultBalance.data === undefined ? "—" : formatUnits(vaultBalance.data, 6)} tUSD8<small>Available for approved invoice payments</small></div><div className="divider" />
            <label className="field-label">Amount <span className="field-wrap"><input className="field" value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="0.000001" step="0.01" placeholder="0.00" /><i>tUSD8</i></span></label>
            <div className="vault-actions"><button className="button button-primary" disabled={!canWrite || tx.status === "pending"} onClick={deposit}>Deposit</button><button className="button" disabled={!canWrite || tx.status === "pending"} onClick={withdraw}>Withdraw</button></div>
            <p className="vault-wallet-balance">Connected wallet tUSD8: <b>{tokenBalance.data === undefined ? "—" : formatUnits(tokenBalance.data, 6)}</b></p>
            <TransactionFeedback state={tx} />
          </section>
          <section className="rules-safety-card"><span>◈</span><div><b>Protected by policy</b><p>Funds stay in the vault. Agent payments are limited by the budget, daily cap, expiry, and merchant allowlist you set.</p></div></section>
        </aside>
      </div>
    </div>
  );
}
