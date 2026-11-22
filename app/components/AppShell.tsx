"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
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
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending: switching } = useSwitchChain();
  const wrongNetwork = isConnected && chainId !== aevum.id;

  useEffect(() => setMounted(true), []);

  return (
    <div className="app-frame">
      <div className="main-column">
        <header className="topbar">
          <Link className="brand" href="/" aria-label="Stipend home">
            <Image
              className="brand-mark"
              src="/favicon.ico"
              alt="Stipend"
              width={26}
              height={26}
              unoptimized
              priority
            />
            <span>Stipend</span>
          </Link>
          <nav className="side-nav" aria-label="Main navigation">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`nav-link ${pathname === link.href ? "active" : ""}`}
                aria-current={pathname === link.href ? "page" : undefined}
              >
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
            {mounted ? (
              <ConnectButton
                showBalance={false}
                chainStatus="icon"
                accountStatus={{
                  smallScreen: "avatar",
                  largeScreen: "address",
                }}
              />
            ) : (
              <span className="wallet-connect-placeholder" aria-hidden="true">
                Connect Wallet
              </span>
            )}
          </div>
        </header>
        {wrongNetwork && (
          <div className="network-alert" role="alert">
            <span>
              <b>Wrong network.</b> Connect to Aevum Testnet (chain 44005) to
              use Stipend.
            </span>
            <button
              className="button button-dark"
              disabled={switching}
              onClick={() => switchChain({ chainId: aevum.id })}
            >
              {switching ? "Switching…" : "Switch network"}
            </button>
          </div>
        )}
        <main className="page-main">{children}</main>
        {pathname === "/" && (
          <footer className="app-footer">
            <div className="app-footer-inner">
              <span>STIPEND · AGENT SPENDING WALLET</span>
              <div className="footer-links">
              <a
                href="https://explorer-test.qday.info"
                target="_blank"
                rel="noreferrer"
              >
                Aevum explorer ↗
              </a>
              <a href="https://github.com/seyoj7/stipend" target="_blank" rel="noreferrer" aria-label="Stipend on GitHub">
                <svg aria-hidden="true" viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
                  <path d="M12 .9a11.1 11.1 0 0 0-3.51 21.63c.56.1.76-.24.76-.54v-2.1c-3.1.68-3.76-1.32-3.76-1.32-.5-1.3-1.24-1.64-1.24-1.64-1.02-.7.08-.69.08-.69 1.13.08 1.72 1.16 1.72 1.16 1 .1.75 2.21 3.7 1.57.1-.73.4-1.23.7-1.52-2.48-.29-5.08-1.24-5.08-5.52 0-1.22.44-2.21 1.16-2.99-.12-.29-.5-1.42.11-2.95 0 0 .95-.3 3.05 1.14a10.6 10.6 0 0 1 5.55 0c2.12-1.44 3.06-1.14 3.06-1.14.6 1.53.23 2.66.11 2.95.72.78 1.16 1.77 1.16 2.99 0 4.3-2.61 5.23-5.1 5.51.4.35.75 1.02.75 2.06v3.05c0 .3.2.65.77.54A11.1 11.1 0 0 0 12 .9Z" />
                </svg>
                GitHub
              </a>
              </div>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}
