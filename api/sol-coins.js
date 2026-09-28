// GET /api/sol-coins -> { enabled, treasury, coins: [...] }
// Coins launched on pump.fun through Rigs, each with its market cap (in SOL) and a fresh read of its fee split.
// pump.fun lets a creator change the split later, so `listed` is false for any coin that no longer pays Rigs 20%.
const { kv } = require("./_kv");
const { RIGS_SHARE_BPS, connection, pump, treasury, pubkey, readSplit, readCurve } = require("./_sol");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const t = treasury();
  try {
    // No KV store yet means no listed coins, not a broken page.
    const list = JSON.parse((await kv("GET", "sol:coins").catch(() => null)) || "[]").slice(0, 100);
    if (!list.length) {
      res.setHeader("Cache-Control", "public, s-maxage=30");
      return res.status(200).json({ enabled: !!t, treasury: t ? t.toBase58() : null, rigsShareBps: RIGS_SHARE_BPS, coins: [] });
    }
    const { bondingCurvePda, feeSharingConfigPda } = pump();
    const mints = list.map((x) => pubkey(x.mint));
    const c = connection();
    const [curves, splits] = await Promise.all([
      c.getMultipleAccountsInfo(mints.map((m) => bondingCurvePda(m))),
      c.getMultipleAccountsInfo(mints.map((m) => feeSharingConfigPda(m))),
    ]);
    const coins = list.map((x, i) => {
      const curve = readCurve(curves[i]);
      const split = readSplit(splits[i]);
      return { ...x, marketCapSol: curve?.marketCapSol ?? null, graduated: !!curve?.graduated, split, listed: split.rigsBps >= RIGS_SHARE_BPS };
    });
    res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=120");
    return res.status(200).json({ enabled: !!t, treasury: t ? t.toBase58() : null, rigsShareBps: RIGS_SHARE_BPS, coins });
  } catch (e) {
    return res.status(500).json({ enabled: !!t, error: e.message, coins: [] });
  }
};
