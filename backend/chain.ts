import "server-only";
import { createPublicClient, createWalletClient, defineChain, http } from "viem";
import { getAgentAccount } from "./config";

export const aevum = defineChain({
  id: 44_005,
  name: "Aevum Testnet",
  nativeCurrency: { name: "tQDAY", symbol: "tQDAY", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc-test.qday.info"] } },
  blockExplorers: { default: { name: "Aevum Explorer", url: "https://explorer-test.qday.info" } },
});

export const stipendAbi = [
  {
    type: "function", name: "payer", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function", name: "invoices", stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "merchant", type: "address" }, { name: "agent", type: "address" },
      { name: "amount", type: "uint256" }, { name: "paid", type: "bool" },
      { name: "closed", type: "bool" },
      { name: "blocked", type: "bool" },
    ],
  },
  {
    type: "function", name: "policies", stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [
      { name: "totalBudget", type: "uint256" }, { name: "perPaymentCap", type: "uint256" },
      { name: "dailyLimit", type: "uint256" }, { name: "expiry", type: "uint256" },
      { name: "spent", type: "uint256" }, { name: "revoked", type: "bool" },
    ],
  },
  {
    type: "function", name: "allowedMerchant", stateMutability: "view",
    inputs: [{ name: "", type: "address" }, { name: "", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function", name: "dailySpent", stateMutability: "view",
    inputs: [{ name: "", type: "address" }, { name: "", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function", name: "vaultBalance", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function", name: "paused", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function", name: "closeInvoice", stateMutability: "nonpayable",
    inputs: [{ name: "invoiceId", type: "uint256" }], outputs: [],
  },
  {
    type: "function", name: "payInvoice", stateMutability: "nonpayable",
    inputs: [{ name: "invoiceId", type: "uint256" }], outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function", name: "getOpenInvoices", stateMutability: "view",
    inputs: [
      { name: "agent", type: "address" },
      { name: "offset", type: "uint256" },
      { name: "limit", type: "uint256" },
    ],
    outputs: [
      { name: "ids", type: "uint256[]" },
      { name: "total", type: "uint256" },
    ],
  },
  {
    type: "function", name: "getBlockedInvoices", stateMutability: "view",
    inputs: [
      { name: "agent", type: "address" },
      { name: "offset", type: "uint256" },
      { name: "limit", type: "uint256" },
    ],
    outputs: [
      { name: "ids", type: "uint256[]" },
      { name: "total", type: "uint256" },
    ],
  },
  {
    type: "event", name: "InvoiceClosed", anonymous: false,
    inputs: [
      { name: "invoiceId", type: "uint256", indexed: true },
      { name: "caller", type: "address", indexed: true },
    ],
  },
  {
    type: "event", name: "InvoicePaid", anonymous: false,
    inputs: [
      { name: "invoiceId", type: "uint256", indexed: true },
      { name: "agent", type: "address", indexed: true },
      { name: "merchant", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event", name: "PaymentRejected", anonymous: false,
    inputs: [
      { name: "invoiceId", type: "uint256", indexed: true },
      { name: "agent", type: "address", indexed: true },
      { name: "reason", type: "uint8", indexed: false },
    ],
  },
] as const;

export const publicClient = createPublicClient({ chain: aevum, transport: http() });

export function getAgentWalletClient() {
  const account = getAgentAccount();
  return { account, client: createWalletClient({ account, chain: aevum, transport: http() }) };
}
