// Solana wallet (Phantom / Solflare / any wallet that injects window.solana) and pump.fun launch helpers.
import { CONFIG } from "./config.js";

const SOL_WEB3 ="https://cdn.jsdelivr.net/npm/@solana/web3.js@1.98.2/+esm";

export const SOL = {
  explorer: "https://solscan.io",
  pumpCoinUrl: "https://pump.fun/coin/",
};

export function solProvider() {
  if (window.phantom?.solana?.isPhantom) return window.phantom.solana;
  if (window.solflare?.isSolflare) return window.solflare;
  if (window.solana) return window.solana;
  return null;
}

let account = null;
const listeners = new Set();
export const getSolAccount = () => account;
export const onSolAccount = (fn) => { listeners.add(fn); fn(account); };
const setAccount = (a) => { account = a; listeners.forEach((fn) => fn(a)); };

export async function connectSol() {
  const p = solProvider();
  if (!p) throw new Error("Install Phantom or Solflare to launch on Solana");
  const r = await p.connect();
  const key = r?.publicKey || p.publicKey;
  if (!key) throw new Error("Wallet did not share an address");
  setAccount(key.toString());
  p.on?.("accountChanged", (k) => setAccount(k ? k.toString() : null));
  p.on?.("disconnect", () => setAccount(null));
  return account;
}

const fromB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const toB64 = (bytes) => { let s = ""; bytes.forEach((b) => (s += String.fromCharCode(b))); return btoa(s); };

/** Asks the wallet to sign every transaction in one prompt; returns them serialized (base64). */
export async function signAll(base64Txs) {
  const { Transaction } = await import(SOL_WEB3);
  const txs = base64Txs.map((b) => Transaction.from(fromB64(b)));
  const p = solProvider();
  const signed = p.signAllTransactions ? await p.signAllTransactions(txs) : [await p.signTransaction(txs[0])];
  return signed.map((tx) => toB64(tx.serialize()));
}

async function post(path, body) {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

/** Launches on pump.fun: the server prepares the transactions, the wallet signs, the server sends them in order. */
export async function launchOnPump({ name, symbol, description, logo }, onStep = () => {}) {
  const creator = account || (await connectSol());
  onStep("Preparing the launch…");
  const prep = await post("/api/sol-launch", { op: "prepare", creator, name, symbol, description, logo });
  onStep("Confirm in your wallet…");
  const signed = await signAll(prep.transactions);
  onStep("Sending to Solana…");
  const sent = await post("/api/sol-launch", { op: "send", mint: prep.mint, transactions: signed });
  return { ...sent, treasury: prep.treasury };
}

let solUsd = null;
/** SOL price in dollars (cached a minute), or null. */
export async function solPriceUsd() {
  if (solUsd && Date.now() - solUsd.at < 60_000) return solUsd.usd;
  try {
    const j = await (await fetch("/api/eth-usd?asset=SOL")).json();
    if (j.usd > 0) solUsd = { usd: j.usd, at: Date.now() };
  } catch { /* offline */ }
  return solUsd?.usd ?? null;
}

/** Coins launched on pump.fun through Rigs (with market cap and split status), or an empty list. */
export async function loadSolCoins() {
  // The treasury in config.js opens launches even when the coin list can't be read (KV or RPC down).
  const fallback = { enabled: !!CONFIG.solana?.treasury, treasury: CONFIG.solana?.treasury || null, coins: [] };
  try {
    const r = await fetch("/api/sol-coins");
    const j = await r.json();
    return { ...fallback, ...j, enabled: !!(j.enabled || fallback.enabled), treasury: j.treasury || fallback.treasury, coins: j.coins || [] };
  } catch {
    return fallback;
  }
}
