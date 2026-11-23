import Link from "next/link";
import "./page.css";

const steps = [
  {
    number: "01",
    tag: "DEPOSIT",
    title: "Fund the vault",
    body: "Deposit tUSD8 into a wallet you control. The agent never gets custody of the funds.",
    metaLeft: "One-time tx",
    metaRight: "Aevum Testnet",
  },
  {
    number: "02",
    tag: "AUTHORIZE",
    title: "Set the boundaries",
    body: "Choose a budget, daily limit, per-payment cap, expiry, and approved merchants.",
    metaLeft: "Rules Engine",
    metaRight: "Non-Custodial",
  },
  {
    number: "03",
    tag: "SETTLE",
    title: "Let it settle",
    body: "Invoices are checked against your rules before an agent payment is sent on Aevum.",
    metaLeft: "Atomic check",
    metaRight: "Pay on Rule Match",
  },
];

export default function Home() {
  return (
    <div className="landing-page">
      <section className="landing-hero">
        <div className="landing-copy">
          <div className="hero-kicker">
            <span /> PROGRAMMABLE SPENDING FOR AI AGENTS
          </div>
          <h1>
            Give your agent an allowance. <em>Not your wallet.</em>
          </h1>
          <p>
            Stipend lets an AI agent pay invoices on its own, but only within
            the limits you set. Your funds stay in a vault you control.
          </p>
          <div className="hero-actions">
            <Link
              className="button button-primary hero-button"
              href="/dashboard"
            >
              Open dashboard <span>↗</span>
            </Link>
            <Link
              className="button hero-button hero-button-secondary"
              href="/rules"
            >
              Explore the rules <span>→</span>
            </Link>
          </div>
          <div className="hero-proof">
            <span className="proof-check">✓</span> Non-custodial vault <i />{" "}
            <span className="proof-check">✓</span> Per-agent limits <i />{" "}
            <span className="proof-check">✓</span> Aevum Testnet
          </div>
        </div>
      </section>

      <section className="landing-steps">
        <div className="section-intro">
          <div className="eyebrow">WORKFLOW & LIFECYCLE</div>
          <h2>How it works</h2>
          <p>
            Deposit once, set clear boundaries for your agent, and settle only when
            invoices match your approved policies.
          </p>
        </div>
        <div className="steps-container">
          <div className="step-grid">
            {steps.map((step) => (
              <article className="step-card" key={step.number}>
                <div className="step-card-header">
                  <span className="step-number">{step.number}</span>
                  <span className="step-tag">{step.tag}</span>
                </div>
                <div className="step-card-body">
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
                <div className="step-card-footer">
                  <span className="step-meta-left">{step.metaLeft}</span>
                  <span className="step-meta-pill">{step.metaRight}</span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="landing-decisions" aria-labelledby="decisions-heading">
        <div className="decisions-heading">
          <div className="eyebrow">PAYMENT DECISIONS</div>
          <h2 id="decisions-heading">Every invoice gets a clear outcome.</h2>
          <p>
            The contract checks the policy before any funds move. Eligible
            invoices are paid; invoices that break a rule are rejected with a
            reason you can inspect.
          </p>
        </div>
        <div className="decision-outcomes">
          <article className="decision-paid">
            <div className="decision-topline"><span>01 / WITHIN POLICY</span><b>PAID</b></div>
            <h3>Invoice settled</h3>
            <p>Funds move from the vault directly to the approved merchant.</p>
            <div className="decision-event">InvoicePaid <span>ON-CHAIN EVENT</span></div>
          </article>
          <article className="decision-blocked">
            <div className="decision-topline"><span>02 / OUTSIDE POLICY</span><b>REJECTED</b></div>
            <h3>Funds stay put</h3>
            <p>A failed check stops payment and records the rejection reason.</p>
            <div className="decision-event">PaymentRejected <span>WITH REASON</span></div>
          </article>
        </div>
      </section>
      <section className="landing-bottom">
        <div>
          <div className="eyebrow">YOUR VAULT. YOUR RULES.</div>
          <h2>Ready to put your agent to work?</h2>
          <p>Connect the payer wallet for your Stipend vault to get started.</p>
        </div>
        <Link href="/dashboard" className="button button-primary">
          Go to your dashboard <span>↗</span>
        </Link>
      </section>
      <p className="landing-note">
        Stipend runs on Aevum Testnet. Use test tokens only.
      </p>
    </div>
  );
}
