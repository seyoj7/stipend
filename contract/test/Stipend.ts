import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { network } from "hardhat";

const units = (amount: number) => BigInt(amount) * 1_000_000n;

describe("Stipend", () => {
  let viem: Awaited<ReturnType<typeof network.create>>["viem"];
  let networkHelpers: Awaited<ReturnType<typeof network.create>>["networkHelpers"];
  let publicClient: any;
  let payer: any;
  let agent: any;
  let merchant: any;
  let otherMerchant: any;
  let token: any;
  let stipend: any;

  beforeEach(async () => {
    ({ viem, networkHelpers } = await network.create());
    publicClient = await viem.getPublicClient();
    const wallets = await viem.getWalletClients();
    [payer, agent, merchant, otherMerchant] = wallets;
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

  async function pay(id: bigint) {
    return stipend.write.payInvoice([id], { account: agent.account });
  }

  async function assertRejected(id: bigint, expectedPaid = false) {
    const merchantBefore = await token.read.balanceOf([merchant.account.address]);
    await pay(id);
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
    await assertRejected(await invoice(11));
  });

  it("rejects a payment that would exceed the total budget", async () => {
    await fundVault();
    await configure({ budget: 10, cap: 10, daily: 10 });
    await pay(await invoice(6));
    await assertRejected(await invoice(5));
  });

  it("rejects a payment that would exceed the daily limit", async () => {
    await fundVault();
    await configure({ budget: 100, cap: 100, daily: 10 });
    await pay(await invoice(6));
    await assertRejected(await invoice(5));
  });

  it("rejects an invoice after policy expiry", async () => {
    await fundVault();
    await configure({ duration: 30 });
    const id = await invoice(1);
    await networkHelpers.time.increase(31);
    await assertRejected(id);
  });

  it("rejects an invoice from a merchant not listed for the agent", async () => {
    await fundVault();
    await configure();
    await assertRejected(await invoice(1, otherMerchant));
  });

  it("rejects a second payment of an already paid invoice", async () => {
    await fundVault();
    await configure();
    const id = await invoice(1);
    await pay(id);
    await assertRejected(id, true);
  });

  it("rejects payments from a revoked agent", async () => {
    await fundVault();
    await configure();
    const id = await invoice(1);
    await stipend.write.revoke([agent.account.address]);
    await assertRejected(id);
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
    await assertRejected(await invoice(6));
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
});
