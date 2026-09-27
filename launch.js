// Five-step market launcher: Intent → Hook → Details → Price & fees → Review.
// Two engines: Pons V2 bonding curve (PonsLauncher, 80/20 creator fees) and an instant
// Uniswap v4 market on the Rigs hook (RigsLauncher). The draft lives in localStorage.
import {
  CONFIG, ABI, $, esc, toast, friendlyError, client, live, v4live, write, getAccount, connect, onAccount,
  parseEther, toHex, zeroAddress, eth, addrLink, isAddress, getAddress, tokenInfo, ensureAllowance,
} from "./web3.js";
import { uploadLogo } from "./upload.js";
import { formatUnits, parseUnits } from "https://cdn.jsdelivr.net/npm/viem@2.21.0/+esm";
import { BLOCKS, BASE_FEES, blockIcon, defaultValues, configFor, conflictsFor, startTickFor } from "./hooks-data.js";

const STEPS = ["Intent", "Hook", "Details", "Price & fees", "Review"];
const SUPPLY = 1_000_000_000;
const KEY = "rigs-launch-draft";
const PRESETS = {
  none: { name: "No extra rules", on: [], note: "Base fee only." },
  fair: { name: "Fair launch", on: ["anti-snipe", "lp-rewards"], note: "Caps snipers at open, rewards early LPs." },
  deflation: { name: "Deflationary", on: ["auto-burn", "surge-fee"], note: "Burns on buys, taxes whales harder." },
  lottery: { name: "Buy lottery", on: ["anti-snipe", "nth-buy-pot"], note: "Every Nth buy wins the pot." },
};

const fresh = () => ({
  step: 1, intent: "new", mode: "pons", hookTab: "custom", baseFee: 0.3, on: [], values: defaultValues(), focus: null,
  name: "", symbol: "", description: "", logo: "", twitter: "", telegram: "", discord: "", website: "",
  tax: 100, devBuy: "", mcap: 10,
  tokenAddr: "", tokenAmount: "", ethPerToken: "",
});
let d = (() => { try { return { ...fresh(), ...JSON.parse(localStorage.getItem(KEY)) }; } catch { return fresh(); } })();
const on = () => new Set(d.on);
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* storage blocked */ } };
let pons = { fee: null, maxTax: 500 };
let subject = null; // { address, name, symbol, decimals, balance } for existing assets
const existing = () => d.intent === "existing";
const amountRaw = () => { try { return subject && d.tokenAmount ? parseUnits(String(d.tokenAmount), subject.decimals) : null; } catch { return null; } };

/** Opening tick for an existing token priced at `ethPerToken` ETH: raw token units per wei, spacing 60. */
function existingTick() {
  const p = Number(d.ethPerToken);
  if (!subject || !(p > 0)) return NaN;
  const rawPerWei = (1 / p) * 10 ** (subject.decimals - 18);
  return Math.floor(Math.floor(Math.log(rawPerWei) / Math.log(1.0001)) / 60) * 60;
}

async function loadSubject() {
  subject = null;
  if (!isAddress(d.tokenAddr || "")) return render();
  const info = await tokenInfo(getAddress(d.tokenAddr));
  const balance = getAccount() ? await client.readContract({ address: info.address, abi: ABI.erc20Full, functionName: "balanceOf", args: [getAccount()] }).catch(() => null) : null;
  subject = info.symbol ? { ...info, balance } : null;
  if (!subject) toast("That address is not an ERC-20 token on this chain");
  render();
}

// ---------------------------------------------------------------- validation

function errors() {
  const e = [];
  if (existing() && d.mode !== "instant") e.push(["Existing assets open as instant markets.", 1]);
  if (existing()) {
    if (!subject) e.push(["Enter the token contract address.", 1]);
    else if (!(amountRaw() > 0n)) e.push(["Enter how many tokens to put in the pool.", 1]);
    else if (subject.balance != null && amountRaw() > subject.balance) e.push(["You do not hold that many tokens.", 1]);
  }
  if (d.mode === "pons" && !live) e.push(["The Pons launcher is not deployed.", 1]);
  if (d.mode === "instant" && !v4live) e.push(["The v4 launcher is not deployed.", 1]);
  if (d.mode === "instant") conflictsFor(d.baseFee, on(), d.values).forEach((c) => e.push([c, 2]));
  if (!existing() && !d.name.trim()) e.push(["Name is required.", 3]);
  if (!existing() && !/^[A-Za-z0-9]{1,12}$/.test(d.symbol.trim())) e.push([d.symbol ? "Ticker: letters and digits only, up to 12." : "Ticker is required.", 3]);
  if (d.logo && !/^https:\/\//.test(d.logo)) e.push(["Logo must be an https:// link.", 3]);
  if (d.mode === "pons" && d.devBuy && !(Number(d.devBuy) >= 0)) e.push(["Dev buy must be a number.", 4]);
  if (d.mode === "instant" && !existing()) {
    const t = startTickFor(SUPPLY, Number(d.mcap));
    if (!(Number(d.mcap) > 0) || !(t > -887220 && t <= 887220)) e.push(["Opening valuation is out of range.", 4]);
  }
  if (existing()) {
    const t = existingTick();
    if (!(t > -887220 && t <= 887220)) e.push(["Set an opening price per token.", 4]);
  }
  return e;
}
const stepErrors = (n) => errors().filter(([, s]) => s === n);

// ---------------------------------------------------------------- math shown to the user

function buyerPays() {
  const s = on();
  const take = (id, k) => (s.has(id) ? d.values[id][k] : 0);
  const buy = d.baseFee + take("auto-burn", "burnBps") + take("lp-rewards", "lpBps") + take("nth-buy-pot", "potBps");
  const sell = d.baseFee + take("lp-rewards", "lpBps") + take("nth-buy-pot", "potBps");
  return { buy, sell };
}
const pct = (n) => `${+n.toFixed(2)}%`;
const devBuyWei = () => { try { return d.devBuy ? parseEther(String(d.devBuy)) : 0n; } catch { return null; } };

// ---------------------------------------------------------------- step views

const option = (key, val, title, sub, tags, disabled, icon) => `
  <button class="opt${d[key] === val ? " on" : ""}" data-set="${key}" data-val="${val}" ${disabled ? "disabled" : ""}>
    <span class="opt-ic">${icon}</span><span class="opt-check"></span>
    <b>${title}</b><code>${sub}</code>
    ${tags ? `<span class="opt-tags">${tags.map((t) => `<span>${t}</span>`).join("")}</span>` : ""}
  </button>`;

function stepIntent() {
  const pIcon = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="13" r="7"/><path d="M11 10v6M8 13h6M18 3l1 2 2 1-2 1-1 2-1-2-2-1 2-1z"/></svg>';
  const eIcon = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="8" cy="12" r="5"/><circle cx="16" cy="12" r="5"/></svg>';
  const curve = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 20C10 20 14 14 21 4M3 20h18"/></svg>';
  const inst = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="8.5" y="14" width="7" height="7" rx="1.5"/><path d="M6.5 10v2h11v-2M12 12v2"/></svg>';
  return `
    <h2 class="wiz-h">What are you launching?</h2>
    <div class="opts">
      ${option("intent", "new", "NEW TOKEN", "fresh supply, minted at launch", null, false, pIcon)}
      ${option("intent", "existing", "EXISTING ASSET", "open a hooked pool for a token", null, !v4live, eIcon)}
    </div>
    <div class="row2 wiz-row">
      ${existing() ? `<div class="stack"><p class="form-h">Subject token <span class="info" title="The existing ERC-20 to open a market for">i</span></p>
        <input class="filter mono wide" data-field="tokenAddr" placeholder="0x… token contract" value="${esc(d.tokenAddr)}" />
        ${subject ? `<p class="small">${esc(subject.name)} · $${esc(subject.symbol)} · ${subject.decimals} decimals${subject.balance != null ? ` · you hold ${Number(formatUnits(subject.balance, subject.decimals)).toLocaleString("en-US")}` : ""}</p>` : `<p class="dim small">Paste the address, then press Load.</p>`}
        <button class="btn btn-dark btn-xs" data-load-token>Load token</button>
        <label class="form-h">Tokens to put in the pool<span class="inp"><input data-field="tokenAmount" type="number" min="0" placeholder="0" value="${esc(d.tokenAmount)}" /><em>${subject ? esc(subject.symbol) : ""}</em></span></label>
        <p class="dim small">These tokens are locked in the pool for good. You receive its LP fees.</p></div>`
      : `<div><p class="form-h">Subject token <span class="info" title="The token being launched">i</span></p><p class="muted small">Your new token. Name and ticker are set in Details.</p></div>`}
      <label class="form-h">Quote token <span class="info" title="What buyers pay with">i</span><select class="filter sel wide" disabled><option>ETH · native</option></select></label>
    </div>
    <h3 class="wiz-h3">Choose how the market opens</h3>
    <div class="opts">
      ${option("mode", "pons", "BONDING CURVE", "Pons V2 → locked Uniswap v4", ["Pons V2", "80% creator fees", live ? "live" : "not deployed"], existing(), curve)}
      ${option("mode", "instant", "INSTANT MARKET", "Rigs hook on Uniswap v4", ["Custom hook", "Supply locked", v4live ? "live" : "not deployed"], false, inst)}
    </div>
    <p class="muted small">${d.mode === "pons"
      ? "The coin trades on a Pons V2 curve until it sells out, then graduates into a locked Uniswap v4 pool. Creator fees go to its own fee splitter: 80% to you, 20% to the Rigs treasury."
      : "The whole supply opens at once in a Uniswap v4 pool running your hook rules. The liquidity is locked forever and its LP fees go to you."}</p>`;
}

function stepHook() {
  if (d.mode === "pons") {
    return `<h2 class="wiz-h">Hook</h2>
      <div class="notebox"><b>Bonding-curve markets use Pons V2's rules.</b><p class="muted small">Pons handles the curve, its launch snipe tax and graduation into a locked Uniswap v4 pool. Rigs rule blocks apply to instant markets.</p>
      <button class="btn btn-dark btn-sm" data-set="mode" data-val="instant">Switch to an instant market</button></div>`;
  }
  const s = on();
  const { buy, sell } = buyerPays();
  const block = (b) => {
    const active = s.has(b.id);
    return `<div class="rule-row${active ? " focus" : ""}">
      ${blockIcon(b)}<div><b>${b.name}</b><small>${b.short}</small></div>
      <a class="info" href="hook.html?id=${b.id}" target="_blank" title="Details">i</a>
      <button class="plus${active ? " on" : ""}" data-toggle="${b.id}" aria-label="${active ? "Remove" : "Add"} ${b.name}">${active ? "✓" : "+"}</button>
    </div>${active ? `<div class="tune-grid inline-tune">${b.params.map((p) => `<label>${p.label}<span class="inp"><input type="number" data-block="${b.id}" data-param="${p.key}" min="${p.min}" max="${p.max}" step="${p.step}" value="${d.values[b.id][p.key]}" /><em>${p.unit}</em></span></label>`).join("")}</div>` : ""}`;
  };
  return `<h2 class="wiz-h">Choose a hook</h2>
    <div class="subtabs"><button class="${d.hookTab === "custom" ? "on" : ""}" data-set="hookTab" data-val="custom">Build a custom hook</button><button class="${d.hookTab === "presets" ? "on" : ""}" data-set="hookTab" data-val="presets">Choose a preset</button></div>
    ${d.hookTab === "presets" ? `<div class="opts">${Object.entries(PRESETS).map(([k, p]) => `
      <button class="opt${JSON.stringify([...p.on].sort()) === JSON.stringify([...d.on].sort()) ? " on" : ""}" data-preset="${k}"><span class="opt-check"></span><b>${p.name}</b><small class="muted">${p.note}</small>
      <span class="opt-tags">${p.on.map((id) => `<span>${BLOCKS.find((b) => b.id === id).name}</span>`).join("") || "<span>base fee</span>"}</span></button>`).join("")}</div>`
    : `<div class="notebox"><p class="muted small">Add rules below, pick a preset, or open a plain pool at the base fee with no rules.</p><button class="btn btn-dark btn-sm" data-preset="none">No extra rules</button></div>
    <div class="subcard"><p class="form-h">Base LP fee</p><p class="muted small">Charged on every swap and paid in full to liquidity in range. Fixed when the pool opens.</p>
      <div class="fee-tiers">${BASE_FEES.map((t) => `<button class="tier${d.baseFee === t.fee ? " on" : ""}" data-fee="${t.fee}"><b class="mono">${t.fee.toFixed(2)}%</b><small>${t.label}</small></button>`).join("")}</div>
      <label class="custom-fee">Custom <input id="customFee" type="number" min="0" max="10" step="0.01" value="${d.baseFee}" /> %</label></div>
    <div class="subcard"><p class="form-h">What a buyer pays</p>
      <div class="kv"><span>Base fee</span><b>${pct(d.baseFee)}</b></div>
      <div class="kv"><span>Buy total</span><b>${pct(buy)}</b></div><div class="kv"><span>Sell total</span><b>${pct(sell)}</b></div></div>
    <div class="subcard"><p class="form-h">Hook blocks · click to add</p><div class="rule-list">${BLOCKS.map(block).join("")}</div>
      <p class="muted small">One block per behavior. Open <a class="link-pink" href="builder.html">the Builder</a> for the diagram and swap flow.</p></div>`}
    <details class="subcard"><summary class="form-h">Suggested settings</summary><ul class="recs">
      <li><b>Base fee</b> · 0.30% for most new tokens; 1% for very thin markets.</li>
      <li><b>Anti-Snipe</b> · On for new tokens: a short window with a max buy.</li>
      <li><b>Auto Burn</b> · 1–2% if you want supply to shrink with volume.</li>
      <li><b>LP Rewards</b> · 0.5–1% to reward in-range liquidity.</li>
      <li><b>Nth-Buy Pot</b> · Optional; set a minimum buy so dust buys do not count.</li></ul></details>`;
}

function preview() {
  const sym = (d.symbol || "TKR").toUpperCase();
  const av = /^https:\/\//.test(d.logo) ? `<img src="${esc(d.logo)}" alt="" />` : esc(sym.slice(0, 2));
  const rules = d.mode === "instant" ? BLOCKS.filter((b) => on().has(b.id)).map((b) => `<span class="chip">${b.name}</span>`).join("") || '<span class="dim small">no hook blocks</span>' : '<span class="chip">Pons V2 curve</span>';
  return `<div class="card-prev"><div class="coin-av">${av}</div><div><b>${esc(d.name || "Your token")}</b><span class="tkr">$${esc(sym)}</span> <span class="dim small">by you</span></div><span class="badge gray">Before launch</span>
    <div class="chips">${rules}</div><p class="dim small">price · FDV · volume appear here once it trades</p></div>`;
}

const field = (k, label, max, ph, type = "text") => `<label>${label}<input data-field="${k}" type="${type}" maxlength="${max}" placeholder="${ph}" value="${esc(d[k])}" /><small class="dim count" data-count="${k}">${d[k].length}/${max} characters</small></label>`;

function stepDetails() {
  if (existing()) {
    return `<h2 class="wiz-h">Details</h2><div class="notebox"><b>${subject ? `${esc(subject.name)} · $${esc(subject.symbol)}` : "No token loaded"}</b>
      <p class="muted small">An existing token keeps its own name, ticker and logo. ${subject ? `Contract ${addrLink(subject.address)}.` : "Load it in step 1."}</p></div>`;
  }
  return `<p class="form-h">Discover card preview</p><div id="prev">${preview()}</div>
    <div class="form wiz-form">
      ${field("name", "Name", 48, "Hook Frog")}
      ${field("symbol", "Ticker", 12, "HFROG")}
      <p class="form-h">${d.mode === "instant" ? `Fixed supply · ${SUPPLY.toLocaleString("en-US")} tokens` : "Supply is set by Pons V2"}</p>
      ${field("description", "One-liner", 160, "What is it about?")}
      ${field("logo", "Logo, optional", 300, "https://…/logo.png", "url")}
      <div class="upload-row"><label class="btn btn-dark btn-sm upload-btn">Upload an image<input type="file" id="logoFile" accept="image/png,image/jpeg,image/webp,image/gif" hidden /></label><span class="dim small">PNG, JPEG, WebP or GIF · resized to 512 px</span></div>
      <details class="small"><summary class="dim">Where the image is stored</summary><p class="dim small">Uploads are stored by Rigs (Vercel KV) and served from this site. The link is saved with your coin on Pons; for instant markets it shows on Rigs only.</p></details>
      <details class="socials"${d.twitter || d.telegram || d.discord || d.website ? " open" : ""}><summary>Token links, optional</summary><div class="row2">
        ${field("twitter", "X / Twitter", 120, "https://x.com/…")}${field("telegram", "Telegram", 120, "https://t.me/…")}
        ${field("discord", "Discord", 120, "https://discord.gg/…")}${field("website", "Website", 120, "https://…")}</div></details>
      ${d.mode === "instant" ? '<p class="dim small">Instant markets store only name and ticker on-chain; the one-liner, logo and links show on Rigs.</p>' : ""}
    </div>`;
}

function stepFees() {
  if (d.mode === "pons") {
    const buy = devBuyWei();
    return `<div class="subcard"><p class="form-h">Launch fee</p><div class="kv"><span>Paid to Pons</span><b>${pons.fee == null ? "—" : eth(pons.fee, 6) + " ETH"}</b></div></div>
      <div class="subcard"><p class="form-h">Creator tax <span class="dim">${(d.tax / 100).toFixed(2)}%</span></p>
        <input class="range" type="range" data-field="tax" min="0" max="${pons.maxTax}" step="10" value="${d.tax}" />
        <p class="muted small">Charged by Pons on trades and paid to your coin's fee splitter. Pons allows up to ${(pons.maxTax / 100).toFixed(2)}%.</p></div>
      <div class="subcard"><p class="form-h">Dev buy</p><p class="muted small">Your own first buy on the curve, in the launch transaction. Leave empty to skip.</p>
        <label class="inp"><input data-field="devBuy" type="number" min="0" step="0.001" placeholder="0" value="${esc(d.devBuy)}" /><em>ETH</em></label>
        <div class="kv"><span>You pay</span><b>${pons.fee == null || buy == null ? "—" : eth(pons.fee + buy, 6) + " ETH"}</b></div></div>
      <div class="subcard"><p class="form-h">Creator fees</p>
        <div class="split"><div class="split-bar"><span style="width:80%"></span></div><div class="split-legend"><span><i class="c1"></i>80% to you</span><span><i class="c2"></i>20% Rigs treasury</span></div></div>
        <p class="muted small">On Pons, the coin's creator-fee recipient is its own fee splitter contract, not your wallet. It can never be changed. Claim your 80% in <a class="link-pink" href="portfolio.html">Portfolio</a>.</p></div>`;
  }
  if (existing()) {
    const amt = Number(d.tokenAmount) || 0;
    return `<div class="subcard"><p class="form-h">Opening price</p><p class="dim small mono">ETH per ${subject ? esc(subject.symbol) : "token"}</p>
        <label class="inp"><input data-field="ethPerToken" type="number" min="0" step="any" placeholder="0.000001" value="${esc(d.ethPerToken)}" /><em>ETH</em></label>
        <p class="muted small">${amt && Number(d.ethPerToken) > 0 ? `Your ${amt.toLocaleString("en-US")} tokens are worth ${(amt * Number(d.ethPerToken)).toPrecision(4)} ETH at the opening price.` : "Set the price the pool opens at. Buys move the price up from here."}</p></div>
      <div class="subcard"><p class="form-h">Founding position</p><p class="muted small">Your tokens open as one position above the opening price, locked forever in the launcher. Its LP fees go to you whenever anyone collects them. Any rounding dust is returned to you.</p></div>`;
  }
  const perToken = Number(d.mcap) / SUPPLY;
  return `<div class="subcard"><p class="form-h">Opening valuation</p><p class="dim small mono">ETH · whole units</p>
      <label class="inp"><input data-field="mcap" type="number" min="0.001" step="0.1" value="${esc(d.mcap)}" /><em>ETH</em></label>
      <p class="muted small">= ${perToken > 0 ? perToken.toPrecision(3) : "—"} ETH per token · ${SUPPLY.toLocaleString("en-US")} tokens</p></div>
    <div class="subcard"><p class="form-h">Founding position</p><p class="muted small">The whole supply opens as one position above the opening price, owned by the launcher and locked forever. Its LP fees go to the creator (you) whenever anyone collects them.</p>
      <div class="kv"><span>Fee recipient</span><b>${getAccount() ? addrLink(getAccount()) : "connect a wallet"}</b></div></div>
    <div class="subcard"><p class="form-h">Dev buy</p><p class="muted small">Instant markets have no same-transaction dev buy. Buy right after launch like anyone else; with Anti-Snipe on, the cap applies to you too.</p></div>`;
}

function stepReview() {
  const errs = errors();
  const acct = getAccount();
  const row = (k, v, step) => `<div class="rv"><div><small>${k}</small><b>${v}</b></div>${step ? `<button class="link-pink" data-go="${step}">Edit</button>` : ""}</div>`;
  const hook = d.mode === "instant" ? (BLOCKS.filter((b) => on().has(b.id)).map((b) => b.name).join(", ") || "Base fee only") : "Pons V2 curve rules";
  return `<h2 class="wiz-h">Review and launch</h2>
    <div class="rv-head"><b>${existing() ? "Existing asset" : "New token"}</b><span class="badge gray">Nothing is sent yet</span></div>
    <div class="rv-list">
      ${existing() ? row("Token", subject ? `${esc(subject.name)} · $${esc(subject.symbol)}` : "not loaded", 1) + row("Tokens in pool", esc(d.tokenAmount || "—"), 1)
        : row("Token", `${esc(d.name || "—")} · $${esc((d.symbol || "—").toUpperCase())}`, 3) + row("Supply", d.mode === "instant" ? `${SUPPLY.toLocaleString("en-US")} fixed` : "set by Pons V2", null)}
      ${row("Market", d.mode === "instant" ? "Instant · Uniswap v4" : "Bonding curve · Pons V2", 1)}
      ${row("Hook", esc(hook), 2)}
      ${d.mode === "instant" ? row("Root", `Rigs · ${addrLink(CONFIG.rigsHook || zeroAddress)}`, null) : ""}
      ${row("Quote", "ETH · native", 1)}
      ${d.mode === "instant" ? row("Tick spacing", "60", null) + row("Base LP fee", `${pct(d.baseFee)} · all of it to in-range liquidity`, 2) + (existing() ? row("Opening price", `${esc(d.ethPerToken || "—")} ETH per token`, 4) : row("Opening valuation", `${esc(d.mcap)} ETH`, 4))
        : row("Creator tax", `${(d.tax / 100).toFixed(2)}% · 80% to you`, 4) + row("Dev buy", d.devBuy ? `${esc(d.devBuy)} ETH` : "none", 4)}
      ${row("Creator", acct ? addrLink(acct) : "Connect a wallet to bind the creator", null)}
    </div>
    ${errs.length ? `<div class="fixbox"><b>Fix before launching</b><ul>${errs.map(([m, s]) => `<li>${esc(m)} <button class="link-pink" data-go="${s}">Go to ${STEPS[s - 1]}</button></li>`).join("")}</ul></div>` : ""}
    <details class="subcard"><summary class="form-h">What the transaction sends</summary><pre class="mono small">${esc(existing()
      ? `1. approve(RigsLauncher, ${d.tokenAmount} ${subject?.symbol || ""}) if needed\n2. RigsLauncher.openExisting(${d.tokenAddr}, amount, startTick ${existingTick()}, ${JSON.stringify(configFor(d.baseFee, on(), d.values))})`
      : d.mode === "instant"
      ? `RigsLauncher.launch(\n  "${d.name}", "${d.symbol.toUpperCase()}", ${SUPPLY}e18,\n  startTick ${startTickFor(SUPPLY, Number(d.mcap))},\n  ${JSON.stringify(configFor(d.baseFee, on(), d.values))}\n)`
      : `PonsLauncher.launch({ name: "${d.name}", symbol: "${d.symbol.toUpperCase()}", creatorTaxBps: ${d.tax}, … })\nvalue: launch fee${d.devBuy ? ` + ${d.devBuy} ETH dev buy` : ""}`)}</pre></details>
    ${!acct ? `<div class="gatebox"><b>Launch is gated</b><p>Connect the creator wallet: it becomes the coin's creator and receives its fees.</p><button class="btn btn-dark btn-sm" data-connect-now>Connect wallet</button></div>` : ""}
    <button class="btn btn-pink btn-lg" id="sign" ${errs.length || !acct ? "disabled" : ""}>Sign &amp; launch</button>
    ${errs.length || !acct ? `<p class="gated">Waiting on: ${[errs.length ? "fixes" : "", !acct ? "wallet" : ""].filter(Boolean).join(", ")}</p>` : ""}`;
}

// ---------------------------------------------------------------- render

function nav() {
  return `<div class="wiz-nav"><button class="btn btn-dark btn-sm" data-go="${d.step - 1}" ${d.step === 1 ? "hidden" : ""}>‹ Back</button>
    ${d.step < 5 ? `${stepErrors(d.step).length ? `<span class="err-t">${esc(stepErrors(d.step)[0][0])}${stepErrors(d.step).length > 1 ? ` (+${stepErrors(d.step).length - 1} more on this step)` : ""}</span>` : ""}<button class="btn btn-pink btn-sm push" data-go="${d.step + 1}">Continue ›</button>` : ""}</div>`;
}

function render() {
  save();
  $("#sbCount").textContent = `Step ${d.step} of 5`;
  $("#sbName").textContent = STEPS[d.step - 1];
  $("#sbPrev").disabled = d.step === 1;
  $("#sbNext").disabled = d.step === 5;
  $("#wizSteps").innerHTML = STEPS.map((s, i) => `<li class="${i + 1 <= d.step ? "on" : ""}" data-go="${i + 1}"><b>${i + 1}</b> ${s}${stepErrors(i + 1).length && i + 1 < d.step ? " ⚠" : ""}</li>`).join("");
  $("#stepBody").innerHTML = [stepIntent, stepHook, stepDetails, stepFees, stepReview][d.step - 1]() + nav();
  renderSide();
}

function renderSide() {
  const items = [];
  items.push(d.mode === "pons"
    ? [live, live ? `Pons launcher ${addrLink(CONFIG.ponsLauncher)}` : "Pons launcher not deployed"]
    : [v4live, v4live ? `v4 launcher ${addrLink(CONFIG.rigsLauncher)}` : "v4 launcher not deployed"]);
  if (d.mode === "instant") {
    const c = conflictsFor(d.baseFee, on(), d.values);
    items.push(...(c.length ? c.map((x) => [false, esc(x)]) : [[true, d.on.length ? "Rule blocks are compatible" : "No rule blocks: base fee only"]]));
  }
  items.push([!!getAccount(), getAccount() ? "Wallet connected" : "Wallet not connected"]);
  $("#compat").innerHTML = items.map(([ok, t]) => `<li class="${ok ? "ok" : "warn"}">${t}</li>`).join("");
  const hook = d.mode === "instant" ? (d.on.length ? `${d.on.length} block${d.on.length > 1 ? "s" : ""}` : "base fee only") : "Pons rules";
  $("#draft").innerHTML = [["Intent", d.intent === "new" ? "new token" : "existing asset"], ["Market", d.mode === "pons" ? "bonding curve" : "instant"], ["Hook", hook], ["Quote", "ETH"], ["Step", `${d.step} / 5`], ["Saved", "locally"]]
    .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
}

function go(n) {
  d.step = Math.min(5, Math.max(1, n));
  render();
  document.getElementById("stepbar").scrollIntoView({ block: "start", behavior: "smooth" });
}

// ---------------------------------------------------------------- events

document.addEventListener("click", async (e) => {
  const t = e.target.closest("[data-go],[data-set],[data-toggle],[data-preset],[data-fee],[data-connect-now]");
  if (!t) return;
  if (t.dataset.go) return go(Number(t.dataset.go));
  if (t.dataset.set) {
    d[t.dataset.set] = t.dataset.val;
    if (existing()) d.mode = "instant";
    if (t.dataset.set === "intent" && existing() && d.tokenAddr && !subject) loadSubject();
    return render();
  }
  if (t.dataset.toggle) {
    const s = on();
    s.has(t.dataset.toggle) ? s.delete(t.dataset.toggle) : s.add(t.dataset.toggle);
    d.on = [...s];
    return render();
  }
  if (t.dataset.preset) { d.on = [...PRESETS[t.dataset.preset].on]; d.hookTab = "custom"; return render(); }
  if (t.dataset.fee) { d.baseFee = Number(t.dataset.fee); return render(); }
  if (t.hasAttribute("data-connect-now")) { try { await connect(); } catch (err) { toast(friendlyError(err)); } }
});
document.addEventListener("click", (e) => { if (e.target.closest("[data-load-token]")) loadSubject().catch((err) => toast(friendlyError(err))); });
document.addEventListener("change", async (e) => {
  if (e.target.id !== "logoFile" || !e.target.files[0]) return;
  toast("Uploading…");
  try {
    d.logo = await uploadLogo(e.target.files[0]);
    render();
    toast("Logo uploaded");
  } catch (err) { toast(friendlyError(err)); }
});

document.addEventListener("input", (e) => {
  const f = e.target.dataset.field;
  if (f) {
    d[f] = f === "tax" ? Number(e.target.value) : e.target.value;
    save();
    const c = document.querySelector(`[data-count="${f}"]`);
    if (c) c.textContent = `${e.target.value.length}/${e.target.maxLength} characters`;
    if (["name", "symbol", "logo"].includes(f) && $("#prev")) $("#prev").innerHTML = preview();
    if (["tax", "devBuy", "mcap", "tokenAmount", "ethPerToken"].includes(f)) { const pos = e.target.selectionStart; render(); const el = document.querySelector(`[data-field="${f}"]`); el?.focus(); try { el.setSelectionRange?.(pos, pos); } catch { /* number inputs */ } }
    renderSide();
  }
});
document.addEventListener("change", (e) => {
  if (e.target.id === "customFee") { d.baseFee = Math.min(10, Math.max(0, Number(e.target.value) || 0)); return render(); }
  const b = e.target.dataset.block;
  if (b) {
    const p = BLOCKS.find((x) => x.id === b).params.find((x) => x.key === e.target.dataset.param);
    d.values[b][p.key] = Math.min(p.max, Math.max(p.min, Number(e.target.value) || 0));
    render();
  }
});

$("#sbPrev").addEventListener("click", () => go(d.step - 1));
$("#sbNext").addEventListener("click", () => go(d.step + 1));
const reset = () => { if (confirm("Reset the whole draft?")) { d = fresh(); render(); } };
$("#sbReset").addEventListener("click", reset);
$("#discard").addEventListener("click", reset);

// ---------------------------------------------------------------- sign

document.addEventListener("click", async (e) => {
  const btn = e.target.closest("#sign");
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = "Confirm in your wallet…";
  try {
    const symbol = existing() ? subject.symbol : d.symbol.trim().toUpperCase();
    let token, hash;
    if (d.mode === "pons") {
      const [fee, economics] = await Promise.all([
        client.readContract({ address: CONFIG.ponsFactory, abi: ABI.pons, functionName: "launchFee" }),
        client.readContract({ address: CONFIG.ponsFactory, abi: ABI.pons, functionName: "previewLaunchEconomics", args: [0n, zeroAddress] }),
      ]);
      const rc = await write({
        address: CONFIG.ponsLauncher, abi: ABI.launcher, functionName: "launch", value: fee + (devBuyWei() || 0n),
        args: [{
          name: d.name.trim(), symbol, logo: d.logo, description: d.description,
          socials: { twitter: d.twitter, telegram: d.telegram, discord: d.discord, website: d.website, farcaster: "" },
          creatorTaxBps: Number(d.tax), launchConfigId: 0n, expectedEconomics: economics,
          salt: toHex(crypto.getRandomValues(new Uint8Array(32))), minTokensOut: 0n,
        }],
      });
      hash = rc.transactionHash;
      const n = await client.readContract({ address: CONFIG.ponsLauncher, abi: ABI.launcher, functionName: "launchCount" });
      [token] = await client.readContract({ address: CONFIG.ponsLauncher, abi: ABI.launcher, functionName: "launches", args: [n - 1n] });
    } else if (existing()) {
      const raw = configFor(d.baseFee, on(), d.values);
      const cfg = { ...raw, snipeMaxBuy: BigInt(raw.snipeMaxBuy), surgeRefSize: BigInt(raw.surgeRefSize), potMinBuy: BigInt(raw.potMinBuy) };
      btn.textContent = "Approve tokens in your wallet…";
      await ensureAllowance(subject.address, CONFIG.rigsLauncher, amountRaw());
      btn.textContent = "Confirm the pool in your wallet…";
      const rc = await write({
        address: CONFIG.rigsLauncher, abi: ABI.rigsLauncher, functionName: "openExisting",
        args: [subject.address, amountRaw(), existingTick(), cfg],
      });
      hash = rc.transactionHash;
      token = subject.address;
    } else {
      const raw = configFor(d.baseFee, on(), d.values);
      const cfg = { ...raw, snipeMaxBuy: BigInt(raw.snipeMaxBuy), surgeRefSize: BigInt(raw.surgeRefSize), potMinBuy: BigInt(raw.potMinBuy) };
      const rc = await write({
        address: CONFIG.rigsLauncher, abi: ABI.rigsLauncher, functionName: "launch",
        args: [d.name.trim(), symbol, BigInt(SUPPLY) * 10n ** 18n, startTickFor(SUPPLY, Number(d.mcap)), cfg],
      });
      hash = rc.transactionHash;
      const n = await client.readContract({ address: CONFIG.rigsLauncher, abi: ABI.rigsLauncher, functionName: "tokenCount" });
      token = await client.readContract({ address: CONFIG.rigsLauncher, abi: ABI.rigsLauncher, functionName: "tokens", args: [n - 1n] });
    }
    toast(`Launched $${symbol}!`);
    $("#result").innerHTML = `<div class="card done"><b>$${esc(symbol)} is live${d.mode === "pons" ? " on Pons" : ""}.</b>
      <p>${d.mode === "pons" ? `<a href="${CONFIG.ponsCoinUrl}${token}" target="_blank" rel="noopener">Trade it on Pons ↗</a> · ` : `<a href="app.html#pools">See the pool in Discover</a> · `}
      <a href="${CONFIG.explorer}/tx/${hash}" target="_blank" rel="noopener">View transaction ↗</a> · <a href="portfolio.html">Your creator fees →</a></p></div>`;
    d = { ...fresh(), mode: d.mode };
    render();
    $("#result").scrollIntoView({ behavior: "smooth" });
  } catch (err) {
    console.error(err);
    toast(friendlyError(err));
    btn.disabled = false;
    btn.textContent = "Sign & launch";
  }
});

onAccount(() => { if (existing() && d.tokenAddr) loadSubject(); else render(); });
$("#netState").textContent = live || v4live ? `${CONFIG.chainName} · live` : "Contracts not deployed";
Promise.all([
  client.readContract({ address: CONFIG.ponsFactory, abi: ABI.pons, functionName: "launchFee" }),
  client.readContract({ address: CONFIG.ponsFactory, abi: ABI.pons, functionName: "maxCreatorTaxBps" }).catch(() => 500),
]).then(([fee, max]) => { pons = { fee, maxTax: Number(max) }; if (d.tax > pons.maxTax) d.tax = pons.maxTax; render(); })
  .catch(() => toast(`Could not read Pons settings from ${CONFIG.chainName}`));
render();
