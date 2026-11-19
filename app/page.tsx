import Link from "next/link";
import "./page.css";

const steps = [
  {
    number: "01",
    title: "Fund the vault",
    body: "Deposit tUSD8 into a wallet you control. The agent never gets custody of the funds.",
  },
  {
    number: "02",
    title: "Set the boundaries",
    body: "Choose a budget, daily limit, per-payment cap, expiry, and approved merchants.",
  },
  {
    number: "03",
    title: "Let it settle",
    body: "Invoices are checked against your rules before an agent payment is sent on Aevum.",
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
            <Link className="text-link" href="/rules">
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
          <div className="eyebrow">HOW IT WORKS</div>
          <h2>Autonomy, with a line around it.</h2>
          <p>
            Every payment has a rule behind it. You decide the boundaries before
            your agent starts.
          </p>
        </div>
        <div className="step-grid">
          {steps.map((step) => (
            <article className="step-card" key={step.number}>
              <span>{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </article>
          ))}
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
