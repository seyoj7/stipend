"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useSwitchChain } from "wagmi";
import { aevum } from "@/app/lib/stipend";

const links = [
  { href: "/", label: "Overview" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/rules", label: "Rules" },
  { href: "/invoices", label: "Invoices" },
  { href: "/agent", label: "Agent" },
  { href: "/receipts", label: "Receipts" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending: switching } = useSwitchChain();
  const wrongNetwork = isConnected && chainId !== aevum.id;

  return (
    <div className="app-frame">
      <div className="main-column">
        <header className="topbar">
          <Link className="brand" href="/" aria-label="Stipend home">
            <Image className="brand-mark" src="/favicon.ico" alt="Stipend" width={26} height={26} unoptimized priority />
            <span>Stipend</span>
          </Link>
          <nav className="side-nav" aria-label="Main navigation">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className={`nav-link ${pathname === link.href ? "active" : ""}`} aria-current={pathname === link.href ? "page" : undefined}>
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="top-actions">
            <button
              type="button"
              className="network-chip"
              onClick={() => {
                if (isConnected && switchChain) {
                  switchChain({ chainId: aevum.id });
                }
              }}
              title="Aevum Testnet"
            >
              <i />
              <span>Aevum Testnet</span>
            </button>
            <ConnectButton showBalance={false} chainStatus="icon" accountStatus={{ smallScreen: "avatar", largeScreen: "address" }} />
          </div>
        </header>
        {wrongNetwork && (
          <div className="network-alert" role="alert">
            <span><b>Wrong network.</b> Connect to Aevum Testnet (chain 44005) to use Stipend.</span>
            <button className="button button-dark" disabled={switching} onClick={() => switchChain({ chainId: aevum.id })}>
              {switching ? "Switching…" : "Switch network"}
            </button>
          </div>
        )}
        <main className="page-main">{children}</main>
        {pathname === "/" && (
          <footer className="app-footer">
            <div className="app-footer-inner">
              <span>STIPEND · AGENT SPENDING WALLET</span>
              <a href="https://explorer-test.qday.info" target="_blank" rel="noreferrer">Aevum explorer ↗</a>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}
