// Shared Solana helpers for the pump.fun launch functions.
// Env: SOLANA_RPC_URL (a private RPC is recommended; the public one rate-limits),
//      SOL_TREASURY (optional override of the Rigs wallet that receives 20% of each coin's creator fees).
const { Connection, PublicKey } = require("@solana/web3.js");

const RIGS_SHARE_BPS = 2000; // 20% of creator fees; the creator keeps 8000
const DEFAULT_TREASURY = "CeEtCANnK4a5H2WHhpCqZiJMwEZSzJ7bWTLYL6ZK1hVk"; // Rigs treasury on Solana
const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

let conn = null;
const connection = () => conn || (conn = new Connection(RPC_URL, "confirmed"));
const pump = () => require("@pump-fun/pump-sdk");

function treasury() {
  try { return new PublicKey((process.env.SOL_TREASURY || DEFAULT_TREASURY).trim()); } catch { return null; }
}

function pubkey(value) {
  try { return new PublicKey(String(value || "").trim()); } catch { return null; }
}

/** The coin's pump.fun fee-sharing config: whether Rigs still receives its share and whether the split is locked. */
function readSplit(info) {
  const t = treasury();
  if (!info) return { configured: false, rigsBps: 0, locked: false };
  const cfg = pump().PUMP_SDK.decodeSharingConfig(info);
  const rigs = t ? cfg.shareholders.find((s) => s.address.equals(t)) : null;
  return {
    configured: true,
    rigsBps: rigs ? Number(rigs.shareBps) : 0,
    locked: !!cfg.adminRevoked,
    admin: cfg.admin.toBase58(),
    shareholders: cfg.shareholders.map((s) => ({ address: s.address.toBase58(), bps: Number(s.shareBps) })),
  };
}

/** Market cap in SOL from a pump.fun bonding curve account (null once graduated or unreadable). */
function readCurve(info) {
  if (!info) return null;
  const { PUMP_SDK, bondingCurveMarketCap } = pump();
  const bc = PUMP_SDK.decodeBondingCurveNullable(info);
  if (!bc) return null;
  const mcapLamports = bc.complete ? null : bondingCurveMarketCap({
    mintSupply: bc.tokenTotalSupply, virtualQuoteReserves: bc.virtualQuoteReserves, virtualTokenReserves: bc.virtualTokenReserves,
  });
  return {
    creator: bc.creator.toBase58(),
    graduated: bc.complete,
    marketCapSol: mcapLamports ? Number(mcapLamports.toString()) / 1e9 : null,
  };
}

function readJson(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => { try { resolve(JSON.parse(raw || "{}")); } catch { resolve({}); } });
  });
}

module.exports = { RIGS_SHARE_BPS, connection, pump, treasury, pubkey, readSplit, readCurve, readJson };
