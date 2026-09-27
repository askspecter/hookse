// Coins page: every Rigs coin as a card, read from the launchers and the auctions contract.
import { BLOCKS } from "./hooks-data.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const ago = (ts) => { const s = Math.max(0, Date.now() / 1000 - ts); return s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`; };
const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");

let tab = "all";
let launches = [];
let pools = [];
let auctions = [];
let shown = 24;
let web3 = null;

function coinCard(c) {
  const av = web3.coinAvatar(c.symbol, web3.metaOf(c.token).logo);
  const desc = web3.metaOf(c.token).description;
  const rules = c.kind === "v4" ? BLOCKS.filter((b) => c.blocks & b.bit) : [];
  const foot = c.kind === "pons"
    ? `<div><span>Creator earned</span><b>${web3.eth(c.totalToCreator, 4)} ETH</b></div><div><span>Launched</span><b>${ago(c.launchedAt)}</b></div>`
    : `<div><span>Base fee</span><b>${(c.baseFee / 10000).toFixed(2)}%</b></div><div><span>Rules</span><b class="rule-dots">${BLOCKS.map((b) => `<i class="${c.blocks & b.bit ? "on" : ""}" title="${b.name}"></i>`).join("")}</b></div>`;
  return `<article class="coin-tile">
    <a class="ct-main" href="/coin?token=${c.token}">
      <div class="cc-top">${av}<span class="cc-kind">${c.kind === "pons" ? "Curve" : "v4 pool"}</span></div>
      <b class="cc-name">${esc(c.name || "Unknown")}</b>
      <span class="cc-sym">$${esc(c.symbol || "?")} · by ${short(c.creator)}</span>
      <p class="ct-desc">${esc(desc) || (rules.length ? rules.map((b) => b.name).join(" · ") : "No description yet.")}</p>
    </a>
    <div class="ct-foot">${foot}</div>
    <div class="ct-acts"><a class="btn btn-primary btn-xs" href="/coin?token=${c.token}">Trade</a>${c.kind === "pons"
      ? `<a class="btn btn-ghost btn-xs" href="/portfolio?token=${c.token}">Fees</a>`
      : `<button class="btn btn-ghost btn-xs" data-collect="${c.token}" title="Send this pool's LP fees to its creator">Send LP fees</button>`}</div>
  </article>`;
}

function auctionCard(a) {
  const nowS = Date.now() / 1000;
  const st = nowS < a.start ? "upcoming" : nowS >= a.end || a.sold >= a.amount ? "ended" : "live";
  const pct = a.amount ? Number((a.sold * 1000n) / a.amount) / 10 : 0;
  return `<article class="coin-tile">
    <a class="ct-main" href="/auctions#auction-${a.id}">
      <div class="cc-top"><div class="av">${esc((a.symbol || "?").slice(0, 2))}</div><span class="cc-kind st-${st}">${st}</span></div>
      <b class="cc-name">${esc(a.name || "Token")}</b>
      <span class="cc-sym">$${esc(a.symbol || "?")} · auction #${a.id}</span>
      <div class="bar ct-bar"><span style="width:${Math.min(100, pct)}%"></span></div>
    </a>
    <div class="ct-foot"><div><span>Price now</span><b>${a.priceEth} ETH</b></div><div><span>Sold</span><b>${pct}%</b></div></div>
    <div class="ct-acts"><a class="btn btn-primary btn-xs" href="/auctions#auction-${a.id}">Open</a></div>
  </article>`;
}

const empty = (msg) => `<div class="rail-empty">${msg}</div>`;

function render() {
  const q = $("#filter").value.trim().toLowerCase();
  const match = (x) => !q || `${x.name} ${x.symbol} ${x.token}`.toLowerCase().includes(q);
  const earned = (c) => Number(c.totalToCreator || 0n);
  let html = "";
  let total = 0;
  if (tab === "auctions") {
    const list = auctions.filter(match);
    total = list.length;
    html = !web3?.auctionsLive ? empty('Auctions appear once RigsAuctions is deployed. <a class="link-accent" href="/auctions">Auctions →</a>')
      : list.slice(0, shown).map(auctionCard).join("") || empty(q ? "Nothing matches." : 'No auctions yet. <a class="link-accent" href="/auctions#create">Create one →</a>');
  } else {
    let list = [
      ...(tab !== "pools" ? launches.map((l) => ({ kind: "pons", ...l, creator: l.creator || l.creatorAtLaunch })) : []),
      ...(tab !== "curve" ? pools.map((p) => ({ kind: "v4", ...p })) : []),
    ].filter(match);
    if ($("#sort").value === "earned") list = list.sort((a, b) => earned(b) - earned(a));
    total = list.length;
    html = list.slice(0, shown).map(coinCard).join("")
      || empty(!web3 ? "Reading the chain…" : q ? "Nothing matches." : 'No coins here yet. <a class="link-accent" href="/launch">Launch the first one →</a>');
  }
  $("#grid").innerHTML = html;
  $("#more").hidden = total <= shown;
}

async function loadPools({ client, CONFIG, ABI }) {
  const { encodeAbiParameters, keccak256 } = await import("https://cdn.jsdelivr.net/npm/viem@2.21.0/+esm");
  const r = (functionName, args, address = CONFIG.rigsLauncher, abi = ABI.rigsLauncher) => client.readContract({ address, abi, functionName, args });
  const n = Number(await r("tokenCount"));
  const ids = Array.from({ length: Math.min(n, 100) }, (_, i) => n - 1 - i);
  return Promise.all(ids.map(async (i) => {
    const token = await r("tokens", [BigInt(i)]);
    const key = await r("keyOf", [token]);
    const id = keccak256(encodeAbiParameters(
      [{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }],
      [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks]));
    const [[, creator], [cfg], name, symbol] = await Promise.all([
      r("launches", [id]), r("getPool", [id], CONFIG.rigsHook, ABI.rigsHook),
      r("name", [], token, ABI.erc20).catch(() => ""), r("symbol", [], token, ABI.erc20).catch(() => ""),
    ]);
    return { token, creator, name, symbol, blocks: Number(cfg.blocks), baseFee: Number(cfg.baseFee) };
  }));
}

async function loadAuctions({ client, CONFIG, ABI, tokenInfo, fmtPrice }) {
  const { formatEther } = await import("https://cdn.jsdelivr.net/npm/viem@2.21.0/+esm");
  const n = Number(await client.readContract({ address: CONFIG.rigsAuctions, abi: ABI.rigsAuctions, functionName: "auctionCount" }));
  const ids = Array.from({ length: Math.min(n, 100) }, (_, i) => n - 1 - i);
  return Promise.all(ids.map(async (id) => {
    const [a, p] = await Promise.all([
      client.readContract({ address: CONFIG.rigsAuctions, abi: ABI.rigsAuctions, functionName: "auctions", args: [BigInt(id)] }),
      client.readContract({ address: CONFIG.rigsAuctions, abi: ABI.rigsAuctions, functionName: "priceOf", args: [BigInt(id)] }),
    ]);
    const info = await tokenInfo(a.token);
    return { id, token: a.token, name: info.name, symbol: info.symbol, amount: a.amount, sold: a.sold, start: Number(a.start), end: Number(a.end), priceEth: fmtPrice(Number(formatEther(p))) };
  }));
}

async function load() {
  $("#updated").textContent = "Reading…";
  try {
    web3 = await import("./web3.js");
    if (web3.live) {
      const { client, CONFIG, ABI, loadLaunch } = web3;
      const n = Number(await client.readContract({ address: CONFIG.ponsLauncher, abi: ABI.launcher, functionName: "launchCount" }));
      launches = await Promise.all(Array.from({ length: Math.min(n, 100) }, (_, i) => loadLaunch(n - 1 - i)));
    }
    if (web3.v4live) pools = await loadPools(web3);
    await web3.loadMeta([...launches, ...pools].map((c) => c.token)).catch(() => {});
    if (web3.auctionsLive) auctions = await loadAuctions(web3);
    $("#updated").innerHTML = `<i class="dot-green"></i>${launches.length + pools.length} coins · ${auctions.length} auctions · updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  } catch (err) {
    console.error(err);
    $("#updated").textContent = "Could not reach Robinhood Chain. Press ↻ to retry.";
  }
  render();
}

$("#tabs").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  tab = b.dataset.tab;
  shown = 24;
  document.querySelectorAll("#tabs button").forEach((x) => x.classList.toggle("active", x === b));
  history.replaceState(null, "", tab === "all" ? location.pathname : `#${tab}`);
  render();
});
$("#filter").addEventListener("input", render);
$("#sort").addEventListener("change", render);
$("#refresh").addEventListener("click", load);
$("#more").addEventListener("click", () => { shown += 24; render(); });
$("#grid").addEventListener("click", async (e) => {
  const b = e.target.closest("button[data-collect]");
  if (!b) return;
  const p = pools.find((x) => x.token === b.dataset.collect);
  b.disabled = true;
  try {
    await web3.write({ address: web3.CONFIG.rigsLauncher, abi: web3.ABI.rigsLauncher, functionName: "collectCreatorFees", args: [p.token] });
    web3.toast(`LP fees for $${p.symbol} sent to its creator`);
  } catch (err) { web3.toast(web3.friendlyError(err)); } finally { b.disabled = false; }
});

// Old links: #tokens / #launches / #hooks.
const initial = { tokens: "all", launches: "curve", pools: "pools", auctions: "auctions" }[location.hash.slice(1)];
if (location.hash === "#hooks") location.replace("/hooks");
if (initial) document.querySelector(`#tabs [data-tab="${initial}"]`).click();
render();
load();
