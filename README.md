# Stipend backend

The backend uses the Aevum Testnet RPC and the Stipend deployment recorded in
`contract/ignition/deployments/chain-44005/deployed_addresses.json` by default.

Copy `.env.local.example` to `.env.local`, then set `AGENT_PRIVATE_KEY` to the
agent wallet's private key, `AGENT_RUN_TOKEN` to a long random bearer token,
and `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` to a project ID from WalletConnect
Cloud. Keep the real key only in `.env.local`; that file is ignored by Git.
The agent wallet must have a policy configured in Stipend and enough tQDAY for
gas. `NEXT_PUBLIC_STIPEND_CONTRACT_ADDRESS` is the browser-facing contract
address and should match `STIPEND_CONTRACT_ADDRESS` if you override the default.

- `GET /api?action=invoices` lists unpaid invoices assigned to the configured agent.
- `GET /api?action=status` returns the configured agent address.
- `POST /api?action=run` checks invoices and attempts eligible payments. The
  dashboard authorizes a run with a short-lived signature from the on-chain
  payer wallet. A server-side cron can instead send
  `Authorization: Bearer <AGENT_RUN_TOKEN>`.

Each invoice decision is written as a structured JSON line to the server log.

The frontend is available at `/` (landing), `/dashboard`, `/rules`,
`/invoices`, `/agent`, and `/receipts`. Wallet actions require Aevum Testnet
(chain 44005); the app offers a network switch when the connected wallet is on
another chain.
