// POST /api/sol-launch — launch a coin on pump.fun (Solana) with its creator fees split 80% creator / 20% Rigs.
//   { op: "prepare", creator, name, symbol, description, logo }
//     -> { mint, transactions: [base64], treasury }  unsigned by the creator (the new mint's key has signed)
//   { op: "send", mint, transactions: [base64 signed by the creator] }
//     -> { mint, signatures, split }  sent in order, each confirmed; the coin is listed once the 20% share is on-chain
// The creator's wallet signs everything and pays; Rigs never holds funds. pump.fun keeps the creator as the admin of
// the split, so Rigs re-checks it on every listing (api/sol-coins) and hides coins that drop the Rigs share.
const { Keypair, Transaction, ComputeBudgetProgram } = require("@solana/web3.js");
const { kv } = require("./_kv");
const { RIGS_SHARE_BPS, connection, pump, treasury, pubkey, readSplit, readJson } = require("./_sol");

const clean = (s, max) => String(s || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, max);
const b64 = (tx) => tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");

async function prepare(req, res, body) {
  const t = treasury();
  if (!t) return res.status(503).json({ error: "Solana launches are not enabled yet (no Rigs treasury set)." });
  const creator = pubkey(body.creator);
  const name = clean(body.name, 32);
  const symbol = clean(body.symbol, 10).toUpperCase();
  const description = clean(body.description, 300);
  const logo = /^https:\/\/\S+$/.test(body.logo || "") ? String(body.logo).slice(0, 300) : "";
  if (!creator) return res.status(400).json({ error: "Connect a Solana wallet first" });
  if (!name || !/^[A-Z0-9]{1,10}$/.test(symbol)) return res.status(400).json({ error: "Name and a 1-10 letter ticker are required" });
  if (!logo) return res.status(400).json({ error: "Upload a logo first" });

  const { PUMP_SDK } = pump();
  const mint = Keypair.generate();
  const origin = `https://${req.headers["x-forwarded-host"] || req.headers.host}`;
  const uri = `${origin}/api/sol-meta?mint=${mint.publicKey.toBase58()}`;
  await kv("SET", `solmeta:${mint.publicKey.toBase58()}`, JSON.stringify({
    name, symbol, description, image: logo, showName: true, createdOn: origin, website: origin,
  }));
  await kv("SET", `solpend:${mint.publicKey.toBase58()}`, JSON.stringify({ creator: creator.toBase58(), name, symbol, logo, at: Date.now() }), "EX", 3600);

  const create = await PUMP_SDK.createV2Instruction({ mint: mint.publicKey, name, symbol, uri, creator, user: creator, mayhemMode: false });
  const config = await PUMP_SDK.createFeeSharingConfig({ creator, mint: mint.publicKey, pool: null });
  const shares = await PUMP_SDK.updateFeeShares({
    authority: creator, mint: mint.publicKey, currentShareholders: [creator],
    newShareholders: [{ address: creator, shareBps: 10000 - RIGS_SHARE_BPS }, { address: t, shareBps: RIGS_SHARE_BPS }],
  });
  const budget = () => [ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 })];
  const { blockhash } = await connection().getLatestBlockhash("confirmed");
  const build = (ixs, withMint) => {
    const tx = new Transaction({ feePayer: creator, recentBlockhash: blockhash }).add(...budget(), ...ixs);
    if (withMint) tx.partialSign(mint);
    return tx;
  };

  // One transaction when it fits; otherwise the create first and the fee split right after it.
  let transactions;
  try {
    transactions = [b64(build([create, config, shares], true))];
  } catch {
    transactions = [b64(build([create], true)), b64(build([config, shares], false))];
  }
  return res.status(200).json({ mint: mint.publicKey.toBase58(), transactions, treasury: t.toBase58(), rigsShareBps: RIGS_SHARE_BPS });
}

/** Polls until the signature is confirmed; returns an error string, or null on success. */
async function waitFor(c, sig, timeoutMs = 45_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const { value } = await c.getSignatureStatuses([sig]);
    const st = value[0];
    if (st?.err) return JSON.stringify(st.err);
    if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) return null;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return "not confirmed in time; check the signature on Solscan";
}

async function send(req, res, body) {
  const mint = pubkey(body.mint);
  const pending = mint ? JSON.parse((await kv("GET", `solpend:${mint.toBase58()}`)) || "null") : null;
  if (!pending) return res.status(400).json({ error: "Unknown or expired launch. Start again." });
  const txs = Array.isArray(body.transactions) ? body.transactions.slice(0, 2) : [];
  if (!txs.length) return res.status(400).json({ error: "No signed transactions" });

  // Only relay transactions paid by the creator this launch was prepared for.
  const decoded = txs.map((raw) => Transaction.from(Buffer.from(String(raw), "base64")));
  if (decoded.some((tx) => !tx.feePayer || tx.feePayer.toBase58() !== pending.creator)) {
    return res.status(400).json({ error: "These transactions are not from the launch creator" });
  }

  const c = connection();
  const signatures = [];
  for (const tx of decoded) {
    const sig = await c.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
    const err = await waitFor(c, sig);
    if (err) return res.status(400).json({ error: `Transaction failed: ${err}`, signatures: [...signatures, sig] });
    signatures.push(sig);
  }

  const { feeSharingConfigPda } = pump();
  const split = readSplit(await c.getAccountInfo(feeSharingConfigPda(mint)));
  if (split.rigsBps >= RIGS_SHARE_BPS) {
    const list = JSON.parse((await kv("GET", "sol:coins")) || "[]");
    if (!list.some((x) => x.mint === mint.toBase58())) {
      list.unshift({ mint: mint.toBase58(), name: pending.name, symbol: pending.symbol, logo: pending.logo, creator: pending.creator, launchedAt: Math.floor(Date.now() / 1000), signature: signatures[0] });
      await kv("SET", "sol:coins", JSON.stringify(list.slice(0, 500)));
    }
  }
  await kv("DEL", `solpend:${mint.toBase58()}`).catch(() => {});
  return res.status(200).json({ mint: mint.toBase58(), signatures, split });
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const body = await readJson(req);
    if (body.op === "prepare") return await prepare(req, res, body);
    if (body.op === "send") return await send(req, res, body);
    return res.status(400).json({ error: "op must be prepare or send" });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err).slice(0, 300) });
  }
};
