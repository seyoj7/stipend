import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { parseAbiItem, parseEventLogs } from "viem";
import { network } from "hardhat";

const units = (amount: number) => BigInt(amount) * 1_000_000n;
const paymentRejectedEvent = parseAbiItem("event PaymentRejected(uint256 indexed invoiceId,address indexed agent,uint8 reason)");
const agentReinstatedEvent = parseAbiItem("event AgentReinstated(address indexed payer,address indexed agent)");
const spentResetEvent = parseAbiItem("event SpentReset(address indexed payer,address indexed agent)");
const excessSweptEvent = parseAbiItem("event ExcessSwept(address indexed payer,uint256 amount)");

describe("Stipend", () => {
  let viem: Awaited<ReturnType<typeof network.create>>["viem"];
  let networkHelpers: Awaited<ReturnType<typeof network.create>>["networkHelpers"];
  let publicClient: any;
  let payer: any;
  let agent: any;
  let merchant: any;
  let otherMerchant: any;
  let agentB: any;
  let token: any;
  let stipend: any;

  beforeEach(async () => {
    ({ viem, networkHelpers } = await network.create());
    publicClient = await viem.getPublicClient();
    const wallets = await viem.getWalletClients();
    [payer, agent, merchant, otherMerchant, agentB] = wallets;
    token = await viem.deployContract("MockUSD8");
    stipend = await viem.deployContract("Stipend", [token.address]);
    await token.write.mint([payer.account.address, units(1_000)]);
    await token.write.approve([stipend.address, units(1_000)]);
  });

  async function fundVault(amount = 500) {
    await stipend.write.deposit([units(amount)]);
  }

  async function configure({
    budget = 100,
    cap = 100,
    daily = 100,
    duration = 86_400,
  }: { budget?: number; cap?: number; daily?: number; duration?: number } = {}) {
    const now = await publicClient.getBlock();
    await stipend.write.setPolicy([
      agent.account.address,
      units(budget),
      units(cap),
      units(daily),
      now.timestamp + BigInt(duration),
    ]);
    await stipend.write.addMerchant([agent.account.address, merchant.account.address]);
  }

  async function invoice(amount: number, invoiceMerchant = merchant, invoiceAgent = agent) {
    await stipend.write.createInvoice(
      [invoiceAgent.account.address, units(amount)],
      { account: invoiceMerchant.account },
    );
    return stipend.read.nextInvoiceId().then((nextId: bigint) => nextId - 1n);
  }

  async function pay(id: bigint, payingAgent = agent) {
    return stipend.write.payInvoice([id], { account: payingAgent.account });
  }

  async function assertRejected(id: bigint, expectedReason: number, expectedPaid = false, payingAgent = agent) {
    const merchantBefore = await token.read.balanceOf([merchant.account.address]);
    const hash = await pay(id, payingAgent);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const rejected = parseEventLogs({ abi: [paymentRejectedEvent], logs: receipt.logs, strict: false })
      .find((event) => event.eventName === "PaymentRejected");
    assert.ok(rejected, "rejected payment must emit PaymentRejected");
    assert.equal(Number(rejected.args.reason), expectedReason);
    const merchantAfter = await token.read.balanceOf([merchant.account.address]);
    assert.equal(merchantAfter, merchantBefore, "rejected invoice must not transfer tokens");
    const record = await stipend.read.invoices([id]);
    assert.equal(record[3], expectedPaid, "rejected payment must not change invoice paid state");
  }

  it("pays an approved invoice within all policy limits", async () => {
    await fundVault(100);
    await configure({ budget: 50, cap: 20, daily: 30 });
    const id = await invoice(12);

    await pay(id);

    assert.equal(await token.read.balanceOf([merchant.account.address]), units(12));
    assert.equal(await stipend.read.vaultBalance(), units(88));
    const policy = await stipend.read.policies([agent.account.address]);
    assert.equal(policy[4], units(12));
    assert.equal((await stipend.read.invoices([id]))[3], true);
  });

  it("rejects a payment above the per-payment cap", async () => {
    await fundVault();
    await configure({ budget: 100, cap: 10, daily: 100 });
    await assertRejected(await invoice(11), 4);
  });

  it("rejects a payment that would exceed the total budget", async () => {
    await fundVault();
    await configure({ budget: 10, cap: 10, daily: 10 });
    await pay(await invoice(6));
    await assertRejected(await invoice(5), 5);
  });

  it("rejects a payment that would exceed the daily limit", async () => {
    await fundVault();
    await configure({ budget: 100, cap: 100, daily: 10 });
    await pay(await invoice(6));
    await assertRejected(await invoice(5), 6);
  });

  it("rejects an invoice after policy expiry", async () => {
    await fundVault();
    await configure({ duration: 30 });
    const id = await invoice(1);
    await networkHelpers.time.increase(31);
    await assertRejected(id, 2);
  });

  it("rejects an invoice from a merchant not listed for the agent", async () => {
    await fundVault();
    await configure();
    await assert.rejects(
      invoice(1, otherMerchant),
      /Stipend: merchant not approved/,
    );
  });

  it("rejects a second payment of an already paid invoice", async () => {
    await fundVault();
    await configure();
    const id = await invoice(1);
    await pay(id);
    await assertRejected(id, 7, true);
  });

  it("rejects payments from a revoked agent", async () => {
    await fundVault();
    await configure();
    const id = await invoice(1);
    await stipend.write.revoke([agent.account.address]);
    await assertRejected(id, 1);
  });

  it("blocks invoice payments while the vault is paused", async () => {
    await fundVault();
    await configure();
    const id = await invoice(1);
    await stipend.write.pause();
    await assert.rejects(pay(id));
    assert.equal((await stipend.read.invoices([id]))[3], false);
  });

  it("rejects a payment when the vault balance is insufficient", async () => {
    await fundVault(5);
    await configure({ budget: 100, cap: 100, daily: 100 });
    await assertRejected(await invoice(6), 8);
  });

  it("rejects an invoice paid by an agent other than its assigned agent", async () => {
    await fundVault();
    await configure();
    const id = await invoice(1, merchant, agent);
    await assertRejected(id, 9, false, agentB);
  });

  it("rejects a nonexistent invoice ID as InvoiceNotFound", async () => {
    await fundVault();
    await configure();
    await assertRejected(999n, 10);
  });

  it("restricts payer-only functions to the payer", async () => {
    await stipend.write.addMerchant([agent.account.address, merchant.account.address]);
    const payerOnlyCalls = [
      () => stipend.write.deposit([units(1)], { account: agent.account }),
      () => stipend.write.addMerchant([agent.account.address, otherMerchant.account.address], { account: agent.account }),
      () => stipend.write.removeMerchant([agent.account.address, merchant.account.address], { account: agent.account }),
      () => stipend.write.revoke([agent.account.address], { account: agent.account }),
      () => stipend.write.pause({ account: agent.account }),
      () => stipend.write.unpause({ account: agent.account }),
      () => stipend.write.reinstate([agent.account.address], { account: agent.account }),
      () => stipend.write.resetSpent([agent.account.address], { account: agent.account }),
      () => stipend.write.sweepExcess({ account: agent.account }),
    ];
    for (const call of payerOnlyCalls) {
      await assert.rejects(call(), /Stipend: payer only/);
    }
  });

  it("allows payments again after the vault is unpaused", async () => {
    await fundVault();
    await configure();
    const id = await invoice(1);
    await stipend.write.pause();
    await stipend.write.unpause();
    await pay(id);
    assert.equal((await stipend.read.invoices([id]))[3], true);
    assert.equal(await token.read.balanceOf([merchant.account.address]), units(1));
  });

  it("rejects a zero policy limit", async () => {
    const now = await publicClient.getBlock();
    await assert.rejects(
      stipend.write.setPolicy([agent.account.address, 0n, units(1), units(1), now.timestamp + 10_000n]),
      /Stipend: zero limit/,
    );
  });

  it("rejects a per-payment cap above the total budget", async () => {
    const now = await publicClient.getBlock();
    await assert.rejects(
      stipend.write.setPolicy([agent.account.address, units(10), units(11), units(1), now.timestamp + 10_000n]),
      /Stipend: inconsistent limits/,
    );
  });

  it("rejects a daily limit above the total budget", async () => {
    const now = await publicClient.getBlock();
    await assert.rejects(
      stipend.write.setPolicy([agent.account.address, units(10), units(1), units(11), now.timestamp + 10_000n]),
      /Stipend: inconsistent limits/,
    );
  });

  it("rejects a policy expiry in the past", async () => {
    const now = await publicClient.getBlock();
    await assert.rejects(
      stipend.write.setPolicy([agent.account.address, units(10), units(10), units(10), now.timestamp - 1n]),
      /Stipend: expiry must be future/,
    );
  });

  it("preserves spent and revoked when setting a policy again", async () => {
    await fundVault();
    await configure();
    await pay(await invoice(5));
    await stipend.write.revoke([agent.account.address]);
    const now = await publicClient.getBlock();
    await stipend.write.setPolicy([
      agent.account.address,
      units(80),
      units(40),
      units(60),
      now.timestamp + 86_400n,
    ]);
    const policy = await stipend.read.policies([agent.account.address]);
    assert.equal(policy[4], units(5));
    assert.equal(policy[5], true);
  });

  it("rejects lowering the total budget below the amount already spent", async () => {
    await fundVault();
    await configure({ budget: 10, cap: 10, daily: 10 });
    await pay(await invoice(5));
    const now = await publicClient.getBlock();
    await assert.rejects(
      stipend.write.setPolicy([agent.account.address, units(4), units(4), units(4), now.timestamp + 10_000n]),
      /Stipend: budget below spent/,
    );
  });

  it("reinstates a revoked agent and emits AgentReinstated", async () => {
    await configure();
    await stipend.write.revoke([agent.account.address]);
    const hash = await stipend.write.reinstate([agent.account.address]);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const event = parseEventLogs({ abi: [agentReinstatedEvent], logs: receipt.logs, strict: false })
      .find((log) => log.eventName === "AgentReinstated");
    assert.ok(event);
    assert.equal(event.args.payer.toLowerCase(), payer.account.address.toLowerCase());
    assert.equal(event.args.agent.toLowerCase(), agent.account.address.toLowerCase());
    assert.equal((await stipend.read.policies([agent.account.address]))[5], false);
  });

  it("resets spent and emits SpentReset without changing revoked", async () => {
    await fundVault();
    await configure();
    await pay(await invoice(5));
    await stipend.write.revoke([agent.account.address]);
    const hash = await stipend.write.resetSpent([agent.account.address]);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const event = parseEventLogs({ abi: [spentResetEvent], logs: receipt.logs, strict: false })
      .find((log) => log.eventName === "SpentReset");
    assert.ok(event);
    assert.equal(event.args.payer.toLowerCase(), payer.account.address.toLowerCase());
    assert.equal(event.args.agent.toLowerCase(), agent.account.address.toLowerCase());
    const policy = await stipend.read.policies([agent.account.address]);
    assert.equal(policy[4], 0n);
    assert.equal(policy[5], true);
  });

  it("keeps vaultBalance equal to token balance through deposit, payment, and withdrawal", async () => {
    await fundVault(50);
    await configure({ budget: 20, cap: 20, daily: 20 });
    assert.equal(await stipend.read.vaultBalance(), await token.read.balanceOf([stipend.address]));
    await pay(await invoice(12));
    assert.equal(await stipend.read.vaultBalance(), await token.read.balanceOf([stipend.address]));
    await stipend.write.withdraw([units(8)]);
    assert.equal(await stipend.read.vaultBalance(), units(30));
    assert.equal(await stipend.read.vaultBalance(), await token.read.balanceOf([stipend.address]));
  });

  it("rejects withdrawals above the vault balance", async () => {
    await fundVault(5);
    await assert.rejects(stipend.write.withdraw([units(6)]), /Stipend: invalid amount/);
  });

  it("sweeps only directly transferred excess tokens and leaves vaultBalance unchanged", async () => {
    await fundVault(100);
    const payerBefore = await token.read.balanceOf([payer.account.address]);
    await token.write.mint([stipend.address, units(17)]);
    const hash = await stipend.write.sweepExcess();
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const event = parseEventLogs({ abi: [excessSweptEvent], logs: receipt.logs, strict: false })
      .find((log) => log.eventName === "ExcessSwept");
    assert.ok(event);
    assert.equal(event.args.payer.toLowerCase(), payer.account.address.toLowerCase());
    assert.equal(event.args.amount, units(17));
    assert.equal(await token.read.balanceOf([payer.account.address]), payerBefore + units(17));
    assert.equal(await stipend.read.vaultBalance(), units(100));
    assert.equal(await token.read.balanceOf([stipend.address]), units(100));
  });

  it("reverts when there is no excess to sweep", async () => {
    await fundVault(10);
    await assert.rejects(stipend.write.sweepExcess(), /Stipend: nothing to sweep/);
  });

  it("resets the daily limit after one day", async () => {
    await fundVault(20);
    await configure({ budget: 20, cap: 10, daily: 5, duration: 3 * 86_400 });
    await pay(await invoice(5));
    const nextId = await invoice(5);
    await networkHelpers.time.increase(86_400);
    await pay(nextId);
    assert.equal((await stipend.read.invoices([nextId]))[3], true);
  });

  it("rejects an open invoice after its merchant is removed", async () => {
    await fundVault();
    await configure();
    const id = await invoice(1);
    await stipend.write.removeMerchant([agent.account.address, merchant.account.address]);
    await assertRejected(id, 3);
  });

  it("emits InvoiceNotFound for an invoice ID with no record", async () => {
    await configure();
    await assertRejected(0n, 10);
  });

  it("rejects fee-on-transfer tokens during deposit", async () => {
    const feeToken = await viem.deployContract("FeeToken");
    const feeStipend = await viem.deployContract("Stipend", [feeToken.address]);
    await feeToken.write.mint([payer.account.address, units(100)]);
    await feeToken.write.approve([feeStipend.address, units(100)]);
    await assert.rejects(feeStipend.write.deposit([units(10)]), /Stipend: unsupported fee token/);
  });

  it("does not let the agent withdraw from the vault", async () => {
    await fundVault();
    await assert.rejects(
      stipend.write.withdraw([units(1)], { account: agent.account }),
    );
  });

  it("does not let the agent change its own policy", async () => {
    await configure();
    const before = await stipend.read.policies([agent.account.address]);
    const now = await publicClient.getBlock();
    await assert.rejects(stipend.write.setPolicy(
      [agent.account.address, units(999), units(999), units(999), now.timestamp + 10_000n],
      { account: agent.account },
    ));
    assert.deepEqual(await stipend.read.policies([agent.account.address]), before);
  });

  // --- Merchant list tests ---

  it("returns approved merchants via getApprovedMerchants", async () => {
    await stipend.write.addMerchant([agent.account.address, merchant.account.address]);
    await stipend.write.addMerchant([agent.account.address, otherMerchant.account.address]);
    const merchants = await stipend.read.getApprovedMerchants([agent.account.address]);
    assert.equal(merchants.length, 2);
    const set = new Set(merchants.map((m: string) => m.toLowerCase()));
    assert.ok(set.has(merchant.account.address.toLowerCase()));
    assert.ok(set.has(otherMerchant.account.address.toLowerCase()));
  });

  it("removes a merchant from getApprovedMerchants when removeMerchant is called", async () => {
    await stipend.write.addMerchant([agent.account.address, merchant.account.address]);
    await stipend.write.addMerchant([agent.account.address, otherMerchant.account.address]);
    await stipend.write.removeMerchant([agent.account.address, merchant.account.address]);
    const merchants = await stipend.read.getApprovedMerchants([agent.account.address]);
    assert.equal(merchants.length, 1);
    assert.equal(merchants[0].toLowerCase(), otherMerchant.account.address.toLowerCase());
  });

  it("allows re-adding a merchant after removal", async () => {
    await stipend.write.addMerchant([agent.account.address, merchant.account.address]);
    await stipend.write.removeMerchant([agent.account.address, merchant.account.address]);
    const afterRemove = await stipend.read.getApprovedMerchants([agent.account.address]);
    assert.equal(afterRemove.length, 0);
    await stipend.write.addMerchant([agent.account.address, merchant.account.address]);
    const afterReAdd = await stipend.read.getApprovedMerchants([agent.account.address]);
    assert.equal(afterReAdd.length, 1);
    assert.equal(afterReAdd[0].toLowerCase(), merchant.account.address.toLowerCase());
  });

  it("removing the first of three merchants leaves the other two", async () => {
    const wallets = await viem.getWalletClients();
    const [, , m1, m2, m3] = wallets;
    await stipend.write.addMerchant([agent.account.address, m1.account.address]);
    await stipend.write.addMerchant([agent.account.address, m2.account.address]);
    await stipend.write.addMerchant([agent.account.address, m3.account.address]);
    await stipend.write.removeMerchant([agent.account.address, m1.account.address]);
    const merchants = await stipend.read.getApprovedMerchants([agent.account.address]);
    assert.equal(merchants.length, 2);
    const set = new Set(merchants.map((m: string) => m.toLowerCase()));
    assert.ok(set.has(m2.account.address.toLowerCase()));
    assert.ok(set.has(m3.account.address.toLowerCase()));
    assert.ok(!set.has(m1.account.address.toLowerCase()));
  });

  it("removing the last of three merchants leaves the first two in order", async () => {
    const wallets = await viem.getWalletClients();
    const [, , m1, m2, m3] = wallets;
    await stipend.write.addMerchant([agent.account.address, m1.account.address]);
    await stipend.write.addMerchant([agent.account.address, m2.account.address]);
    await stipend.write.addMerchant([agent.account.address, m3.account.address]);
    await stipend.write.removeMerchant([agent.account.address, m3.account.address]);
    const merchants = await stipend.read.getApprovedMerchants([agent.account.address]);
    assert.equal(merchants.length, 2);
    assert.equal(merchants[0].toLowerCase(), m1.account.address.toLowerCase());
    assert.equal(merchants[1].toLowerCase(), m2.account.address.toLowerCase());
  });

  it("removing the middle of three merchants swaps the last into its slot", async () => {
    const wallets = await viem.getWalletClients();
    const [, , m1, m2, m3] = wallets;
    await stipend.write.addMerchant([agent.account.address, m1.account.address]);
    await stipend.write.addMerchant([agent.account.address, m2.account.address]);
    await stipend.write.addMerchant([agent.account.address, m3.account.address]);
    await stipend.write.removeMerchant([agent.account.address, m2.account.address]);
    const merchants = await stipend.read.getApprovedMerchants([agent.account.address]);
    assert.equal(merchants.length, 2);
    // After removing m2 (index 1), m3 swaps in: [m1, m3]
    assert.equal(merchants[0].toLowerCase(), m1.account.address.toLowerCase());
    assert.equal(merchants[1].toLowerCase(), m3.account.address.toLowerCase());
  });

  it("add-remove-add cycle across two agents keeps lists independent", async () => {
    await stipend.write.addMerchant([agent.account.address, merchant.account.address]);
    await stipend.write.addMerchant([agentB.account.address, otherMerchant.account.address]);
    await stipend.write.removeMerchant([agent.account.address, merchant.account.address]);
    await stipend.write.addMerchant([agent.account.address, merchant.account.address]);
    const listA = await stipend.read.getApprovedMerchants([agent.account.address]);
    const listB = await stipend.read.getApprovedMerchants([agentB.account.address]);
    assert.equal(listA.length, 1);
    assert.equal(listA[0].toLowerCase(), merchant.account.address.toLowerCase());
    assert.equal(listB.length, 1);
    assert.equal(listB[0].toLowerCase(), otherMerchant.account.address.toLowerCase());
  });

  it("returns an empty list for an agent with no merchants", async () => {
    const merchants = await stipend.read.getApprovedMerchants([agent.account.address]);
    assert.equal(merchants.length, 0);
  });

  // --- Open invoice list tests ---

  it("tracks open invoices via getOpenInvoices and removes them on payment", async () => {
    await fundVault();
    await configure();
    const id1 = await invoice(1);
    const id2 = await invoice(2);
    const id3 = await invoice(3);
    const [beforeIds, beforeTotal] = await stipend.read.getOpenInvoices([agent.account.address, 0n, 100n]);
    assert.equal(beforeTotal, 3n);
    assert.equal(beforeIds.length, 3);
    assert.ok(beforeIds.includes(id1));
    assert.ok(beforeIds.includes(id2));
    assert.ok(beforeIds.includes(id3));

    await pay(id2);

    const [afterIds, afterTotal] = await stipend.read.getOpenInvoices([agent.account.address, 0n, 100n]);
    assert.equal(afterTotal, 2n);
    assert.ok(afterIds.includes(id1));
    assert.ok(!afterIds.includes(id2));
    assert.ok(afterIds.includes(id3));
  });

  it("paginates open invoices with offset and limit", async () => {
    await fundVault();
    await configure();
    const ids: bigint[] = [];
    for (let i = 0; i < 5; i++) {
      ids.push(await invoice(1));
    }
    const [page1, total1] = await stipend.read.getOpenInvoices([agent.account.address, 0n, 2n]);
    assert.equal(total1, 5n);
    assert.equal(page1.length, 2);
    const [page2, total2] = await stipend.read.getOpenInvoices([agent.account.address, 2n, 2n]);
    assert.equal(total2, 5n);
    assert.equal(page2.length, 2);
    const [page3, total3] = await stipend.read.getOpenInvoices([agent.account.address, 4n, 2n]);
    assert.equal(total3, 5n);
    assert.equal(page3.length, 1);
    // All IDs should be unique across pages
    const all = [...page1, ...page2, ...page3];
    assert.equal(new Set(all.map((x: bigint) => x.toString())).size, 5);
  });

  it("returns empty page when offset exceeds total open invoices", async () => {
    await fundVault();
    await configure();
    await invoice(1);
    const [ids, total] = await stipend.read.getOpenInvoices([agent.account.address, 10n, 5n]);
    assert.equal(total, 1n);
    assert.equal(ids.length, 0);
  });

  it("open invoice list is scoped per agent", async () => {
    await fundVault();
    await configure();
    await stipend.write.addMerchant([agentB.account.address, merchant.account.address]);
    const now = await publicClient.getBlock();
    await stipend.write.setPolicy([agentB.account.address, units(100), units(100), units(100), now.timestamp + 86_400n]);
    const idA = await invoice(1, merchant, agent);
    const idB = await invoice(2, merchant, agentB);
    const [idsA] = await stipend.read.getOpenInvoices([agent.account.address, 0n, 100n]);
    const [idsB] = await stipend.read.getOpenInvoices([agentB.account.address, 0n, 100n]);
    assert.equal(idsA.length, 1);
    assert.equal(idsA[0], idA);
    assert.equal(idsB.length, 1);
    assert.equal(idsB[0], idB);
  });

  it("rejected payment does not remove invoice from the open list", async () => {
    await fundVault(5);
    await configure({ budget: 100, cap: 100, daily: 100 });
    const id = await invoice(6); // exceeds vault balance → will be rejected
    await assertRejected(id, 8);
    const [ids, total] = await stipend.read.getOpenInvoices([agent.account.address, 0n, 100n]);
    assert.equal(total, 1n);
    assert.equal(ids[0], id);
  });

  it("lets the merchant close a blocked invoice and removes it from the open list", async () => {
    const id = await invoice(6);
    await assertRejected(id, 8);
    await stipend.write.closeInvoice([id], { account: merchant.account });
    const [ids, total] = await stipend.read.getOpenInvoices([agent.account.address, 0n, 100n]);
    assert.equal(total, 0n);
    assert.equal(ids.length, 0);
    assert.equal((await stipend.read.invoices([id]))[4], true);
  });

  it("only allows closing blocked invoices and rejects other callers", async () => {
    const id = await invoice(1);
    await assert.rejects(
      stipend.write.closeInvoice([id], { account: agent.account }),
      /not authorized/i,
    );
    await assert.rejects(
      stipend.write.closeInvoice([id], { account: payer.account }),
      /not blocked/i,
    );
    await assertRejected(id, 8);
    await stipend.write.closeInvoice([id], { account: payer.account });
    const [, total] = await stipend.read.getOpenInvoices([agent.account.address, 0n, 100n]);
    assert.equal(total, 0n);
  });
});
