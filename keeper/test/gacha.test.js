// Gacha pass of the external keeper against stubbed chain, bridge, Solana wallet and machine.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ExternalKeeper } from "../src/external.js";
import { machineId, signSerialized } from "../src/gacha.js";
import { Keypair, Transaction, SystemProgram, PublicKey } from "@solana/web3.js";

const SOL = 792703809;
const ETH = 10n ** 18n;
const MACHINE = { code: "pokemon_50", name: "Pokémon $50", priceUsd: 50 };

function setup(state) {
  const sent = [];
  const vault = { pendingAmount: 0n, pendingReadyAt: 0n, totalWithdrawn: 0n, totalSpent: 0n, balance: 0n, ...state.vault };
  const client = {
    readContract: async ({ functionName }) => vault[functionName] ?? 0n,
    getBalance: async () => vault.balance,
    getBlock: async () => ({ timestamp: state.now ?? 10_000n }),
    getContractEvents: async () => [],
  };
  const solana = {
    usdc: state.usdc ?? 0n,
    toBytes32: () => `0x${"ab".repeat(32)}`,
    tokenBalance: async (mint) => (mint === "CARDMINT" ? 1n : solana.usdc),
    balance: async () => 50_000_000n,
    holds: async () => true,
    burn: async () => {},
  };
  const pulls = [];
  const gacha = {
    isOpen: async () => state.open ?? true,
    pull: async (code) => { pulls.push(code); return { mint: "CARDMINT", memo: "m1", paySignature: "PAYSIG", sendSignature: "SEND", rarity: "Rare", name: "Charizard" }; },
  };
  const bridged = [];
  const bridge = {
    quote: async (_c, amount) => ({ amountIn: (amount * ETH) / 2_000_000_000n, amountOut: amount }), // 1 ETH = $2000
    send: async (_c, wei, currency) => { bridged.push({ wei, currency }); solana.usdc += (wei * 2_000_000_000n) / ETH; },
  };
  const receipts = [];
  const k = new ExternalKeeper({
    cfg: { dryRun: false, maxCeiling: 5n * ETH, startBlock: 0n, chainId: 4663 },
    client, account: { address: "0x1" }, collections: [], machines: [MACHINE], solana, gacha, bridge,
    send: async (label, req) => { sent.push(req.functionName); if (req.functionName === "recordPurchase") vault.totalSpent += req.args[1]; },
    receipts: (...a) => receipts.push(a),
  });
  const l = { id: "e0", vault: "0xv", chainId: SOL, collection32: machineId("pokemon_50"), policy: "raffle" };
  return { k, l, sent, pulls, bridged, receipts, vault };
}

test("recognises a listed machine as a gacha coin", () => {
  const { k } = setup({});
  assert.equal(k.meta(SOL, machineId("pokemon_50")).gacha, true);
  assert.equal(k.meta(SOL, machineId("unknown")), undefined);
});

test("announces one pack worth of ETH (+1%) when the vault can pay for it", async () => {
  const { k, l, sent, vault } = setup({ vault: { balance: ETH } });
  await k.tick(l);
  assert.deepEqual(sent, ["announceWithdrawal"]);
  assert.equal(vault.pendingAmount, 0n);
});

test("waits while the vault is short of one pack, or the machine is closed", async () => {
  const a = setup({ vault: { balance: ETH / 100n } }); // $20
  await a.k.tick(a.l);
  assert.deepEqual(a.sent, []);
  const b = setup({ vault: { balance: ETH }, open: false });
  await b.k.tick(b.l);
  assert.deepEqual(b.sent, []);
});

test("after the delay: withdraws, bridges to USDC, rips the pack and records the pull", async () => {
  const w = (25n * ETH * 101n) / 100_000n; // $50 + 1%
  const { k, l, sent, pulls, bridged, receipts } = setup({ vault: { pendingAmount: w, pendingReadyAt: 1n, totalWithdrawn: w } });
  await k.tick(l);
  assert.deepEqual(sent, ["executeWithdrawal", "recordPurchase"]);
  assert.equal(bridged.length, 1);
  assert.equal(bridged[0].currency, "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
  assert.deepEqual(pulls, ["pokemon_50"]);
  assert.equal(receipts[0][3].name, "Charizard");
});

test("spends moved funds whole so USDC dust never strands a vault", async () => {
  const { k, l, sent, vault } = setup({ vault: { totalWithdrawn: ETH / 40n, totalSpent: 0n }, usdc: 60_000_000n });
  await k.tick(l);
  assert.deepEqual(sent, ["recordPurchase"]);
  assert.equal(vault.totalSpent, vault.totalWithdrawn);
});

test("keeps Collector Crypt's signature when co-signing their payment transaction", () => {
  const cc = Keypair.generate(), me = Keypair.generate();
  const tx = new Transaction({ feePayer: cc.publicKey, recentBlockhash: new PublicKey(new Uint8Array(32).fill(1)).toBase58() })
    .add(SystemProgram.transfer({ fromPubkey: me.publicKey, toPubkey: cc.publicKey, lamports: 1 }));
  tx.partialSign(cc);
  const b64 = tx.serialize({ requireAllSignatures: false }).toString("base64");
  const out = Transaction.from(Buffer.from(signSerialized(b64, me), "base64"));
  assert.ok(out.verifySignatures());
});
