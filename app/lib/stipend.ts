import { defineChain, getAddress } from "viem";

export const aevum = defineChain({
  id: 44_005,
  name: "Aevum Testnet",
  nativeCurrency: { name: "tQDAY", symbol: "tQDAY", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc-test.qday.info"] } },
  blockExplorers: { default: { name: "Aevum Explorer", url: "https://explorer-test.qday.info" } },
});

export const stipendAddress = getAddress(
  process.env.NEXT_PUBLIC_STIPEND_CONTRACT_ADDRESS ?? "0x812c046D4D93489fbD955c584CEC8d2b4b0aa97C",
);
export const tusd8Address = getAddress("0x456569838f1d43009A91ebA4263147Afd7233483");
export const stipendDeploymentBlock = 3_756_025n;

export const stipendAbi = [
  { type: "function", name: "payer", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "vaultBalance", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  {
    type: "function", name: "policies", stateMutability: "view", inputs: [{ name: "agent", type: "address" }],
    outputs: [
      { name: "totalBudget", type: "uint256" }, { name: "perPaymentCap", type: "uint256" },
      { name: "dailyLimit", type: "uint256" }, { name: "expiry", type: "uint256" },
      { name: "spent", type: "uint256" }, { name: "revoked", type: "bool" },
    ],
  },
  { type: "function", name: "addMerchant", stateMutability: "nonpayable", inputs: [{ name: "agent", type: "address" }, { name: "merchant", type: "address" }], outputs: [] },
  { type: "function", name: "removeMerchant", stateMutability: "nonpayable", inputs: [{ name: "agent", type: "address" }, { name: "merchant", type: "address" }], outputs: [] },
  { type: "function", name: "setPolicy", stateMutability: "nonpayable", inputs: [{ name: "agent", type: "address" }, { name: "totalBudget", type: "uint256" }, { name: "perPaymentCap", type: "uint256" }, { name: "dailyLimit", type: "uint256" }, { name: "expiry", type: "uint256" }], outputs: [] },
  { type: "function", name: "revoke", stateMutability: "nonpayable", inputs: [{ name: "agent", type: "address" }], outputs: [] },
  { type: "function", name: "reinstate", stateMutability: "nonpayable", inputs: [{ name: "agent", type: "address" }], outputs: [] },
  { type: "function", name: "resetSpent", stateMutability: "nonpayable", inputs: [{ name: "agent", type: "address" }], outputs: [] },
  { type: "function", name: "sweepExcess", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "deposit", stateMutability: "nonpayable", inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", name: "withdraw", stateMutability: "nonpayable", inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", name: "pause", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "unpause", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "createInvoice", stateMutability: "nonpayable", inputs: [{ name: "agent", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "invoiceId", type: "uint256" }] },
  { type: "function", name: "invoices", stateMutability: "view", inputs: [{ name: "invoiceId", type: "uint256" }], outputs: [{ name: "merchant", type: "address" }, { name: "agent", type: "address" }, { name: "amount", type: "uint256" }, { name: "paid", type: "bool" }] },
  { type: "function", name: "nextInvoiceId", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "allowedMerchant", stateMutability: "view", inputs: [{ name: "agent", type: "address" }, { name: "merchant", type: "address" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "dailySpent", stateMutability: "view", inputs: [{ name: "agent", type: "address" }, { name: "day", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "paused", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "bool" }] },
  { type: "event", name: "InvoicePaid", anonymous: false, inputs: [{ name: "invoiceId", type: "uint256", indexed: true }, { name: "agent", type: "address", indexed: true }, { name: "merchant", type: "address", indexed: true }, { name: "amount", type: "uint256", indexed: false }] },
  { type: "event", name: "InvoiceCreated", anonymous: false, inputs: [{ name: "invoiceId", type: "uint256", indexed: true }, { name: "merchant", type: "address", indexed: true }, { name: "agent", type: "address", indexed: true }, { name: "amount", type: "uint256", indexed: false }] },
  { type: "event", name: "MerchantAdded", anonymous: false, inputs: [{ name: "agent", type: "address", indexed: true }, { name: "merchant", type: "address", indexed: true }] },
  { type: "event", name: "MerchantRemoved", anonymous: false, inputs: [{ name: "agent", type: "address", indexed: true }, { name: "merchant", type: "address", indexed: true }] },
  { type: "event", name: "AgentReinstated", anonymous: false, inputs: [{ name: "payer", type: "address", indexed: true }, { name: "agent", type: "address", indexed: true }] },
  { type: "event", name: "SpentReset", anonymous: false, inputs: [{ name: "payer", type: "address", indexed: true }, { name: "agent", type: "address", indexed: true }] },
  { type: "event", name: "ExcessSwept", anonymous: false, inputs: [{ name: "payer", type: "address", indexed: true }, { name: "amount", type: "uint256", indexed: false }] },
] as const;

export const tokenAbi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
] as const;
