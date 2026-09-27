import { BLOCKS, blockIcon } from "./hooks-data.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const HEADS = {
  launches: ["#", "Coin", "Creator", "Claimed by creator", "Launched", ""],
  pools: ["Pool", "Creator", "Rules", "Base fee", ""],
  hooks: ["Block", "What it does", "Gas / swap", "Status", ""],
  tokens: ["Token", "Market", "Creator", "Contract", ""],
  auctions: ["Token", "Status", "Price now", "Sold", ""],
};
let tab = "launches";
let launches = [];
let pools = [];
let auctions = [];
let shown = 20;
let web3 = null;

function ago(ts) {
  const s = Math.max(0, Date.now() / 1000 - ts);
  return s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`;
}

function render() {
  const q = $("#filter").value.trim().toLowerCase();
  $("#thead").innerHTML = "<tr>" + HEADS[tab].map((h, i) => `<th class="${i >= 3 ? "r" : ""}">${h}</th>`).join("") + "</tr>";
  let rows = [];
  if (tab === "launches") {
    if (!web3?.live) {
      rows = [`<tr><td colspan="6" class="dim">Launches appear here once the Rigs Pons launcher is deployed. <a href="/launch">Launch page →</a></td></tr>`];
    } else {
      const list = launches.filter((l) => !q || `${l.name} ${l.symbol} ${l.token}`.toLowerCase().includes(q));
      rows = list.slice(0, shown).map((l) => `<tr>
        <td class="dim mono">${l.id}</td>
        <td><a href="/coin?token=${l.token}"><div class="tok">${web3.coinAvatar(l.symbol, web3.metaOf(l.token).logo)}<span>${esc(l.name || "Unknown")} <span class="dim">$${esc(l.symbol || "")}</span></span></div></a></td>
        <td>${web3.addrLink(l.creator || l.creatorAtLaunch)}</td>
        <td class="r mono">${web3.eth(l.totalToCreator, 5)} ETH</td>
        <td class="r dim">${ago(l.launchedAt)}</td>
        <td class="r nowrap"><a class="link-accent" href="/coin?token=${l.token}">Trade</a> · <a class="link-accent" href="/portfolio?token=${l.token}">Fees</a></td></tr>`);
      if (!rows.length) rows = [`<tr><td colspan="6" class="dim">${launches.length ? "Nothing matches." : "No launches yet. <a href=\"/launch\">Be the first →</a>"}</td></tr>`];
      $("#more").hidden = list.length <= shown;
    }
  } else if (tab === "auctions") {
    const nowS = Date.now() / 1000;
    const st = (a) => (nowS < a.start ? "upcoming" : nowS >= a.end || a.sold >= a.amount ? "ended" : "live");
    rows = !web3?.auctionsLive
      ? [`<tr><td colspan="5" class="dim">Auctions appear here once RigsAuctions is deployed. <a href="/auctions">Auctions page →</a></td></tr>`]
      : auctions.filter((a) => !q || `${a.name} ${a.symbol} ${a.token}`.toLowerCase().includes(q)).map((a) => `<tr>
        <td><div class="tok"><div class="av">${esc((a.symbol || "?").slice(0, 2))}</div><span>${esc(a.name || "Token")} <span class="dim">$${esc(a.symbol || "")}</span></span></div></td>
        <td><span class="badge ${st(a) === "live" ? "green" : st(a) === "upcoming" ? "violet" : "gray"}">${st(a)}</span></td>
        <td class="r mono">${a.priceEth} ETH</td>
        <td class="r mono">${a.amount ? Number((a.sold * 1000n) / a.amount) / 10 : 0}%</td>
        <td class="r"><a class="link-accent" href="/auctions#auction-${a.id}">Open</a></td></tr>`);
    if (!rows.length) rows = [`<tr><td colspan="5" class="dim">${q ? "Nothing matches." : "No auctions yet. <a href=\"/auctions#create\">Create one →</a>"}</td></tr>`];
  } else if (tab === "tokens") {
    const all = [
      ...launches.map((l) => ({ name: l.name, symbol: l.symbol, token: l.token, creator: l.creator || l.creatorAtLaunch, market: "Pons V2 curve", link: `/coin?token=${l.token}`, label: "Trade" })),
      ...pools.map((p) => ({ name: p.name, symbol: p.symbol, token: p.token, creator: p.creator, market: "Instant · v4 hook", link: `/coin?token=${p.token}`, label: "Trade" })),
    ].filter((t) => !q || `${t.name} ${t.symbol} ${t.token}`.toLowerCase().includes(q));
    rows = !web3 || (!web3.live && !web3.v4live)
      ? [`<tr><td colspan="5" class="dim">Tokens appear here once the Rigs launchers are deployed.</td></tr>`]
      : all.slice(0, shown).map((t) => `<tr>
        <td><a href="/coin?token=${t.token}"><div class="tok">${web3.coinAvatar(t.symbol, web3.metaOf(t.token).logo)}<span>${esc(t.name || "Unknown")} <span class="dim">$${esc(t.symbol || "")}</span></span></div></a></td>
        <td><span class="chip">${t.market}</span></td>
        <td>${web3.addrLink(t.creator)}</td>
        <td class="r">${web3.addrLink(t.token)}</td>
        <td class="r"><a class="link-accent" ${t.link.startsWith("#") ? `href="${t.link}" data-tab-link="pools"` : `href="${t.link}" target="_blank" rel="noopener"`}>${t.label}</a></td></tr>`);
    if (!rows.length) rows = [`<tr><td colspan="5" class="dim">${q ? "Nothing matches." : "No tokens yet. <a href=\"/launch\">Launch one →</a>"}</td></tr>`];
    $("#more").hidden = all.length <= shown;
  } else if (tab === "pools") {
    if (!web3?.v4live) {
      rows = [`<tr><td colspan="5" class="dim">Rigs v4 pools (created in the <a href="/builder">Builder</a>) appear once the v4 launcher is deployed. Pons graduations trade on Pons' own locked v4 pools.</td></tr>`];
    } else {
      rows = pools.filter((p) => !q || `${p.name} ${p.symbol} ${p.token}`.toLowerCase().includes(q)).map((p) => `<tr>
        <td><a href="/coin?token=${p.token}"><div class="tok">${web3.coinAvatar(p.symbol, web3.metaOf(p.token).logo)}<span>ETH / ${esc(p.symbol || "?")} <span class="dim">${esc(p.name || "")}</span></span></div></a></td>
        <td>${web3.addrLink(p.creator)}</td>
        <td><div class="chips">${BLOCKS.filter((b) => p.blocks & b.bit).map((b) => `<span class="chip">${b.name}</span>`).join("") || '<span class="dim">base fee only</span>'}</div></td>
        <td class="r mono">${(p.baseFee / 10000).toFixed(2)}%</td>
        <td class="r nowrap"><a class="link-accent" href="/coin?token=${p.token}">Trade</a> · <button class="btn btn-dark btn-xs" data-collect="${p.token}">Send LP fees to creator</button></td></tr>`);
      if (!rows.length) rows = [`<tr><td colspan="5" class="dim">${pools.length ? "Nothing matches." : "No pools yet. <a href=\"/builder\">Create one →</a>"}</td></tr>`];
    }
  } else {
    rows = BLOCKS.filter((b) => !q || b.name.toLowerCase().includes(q)).map((b) => `<tr>
      <td><div class="tok">${blockIcon(b)}<span>${b.name}</span></div></td><td class="dim">${b.short}</td>
      <td class="r mono">~${b.gas}K</td><td class="r"><span class="badge gray">Unaudited</span></td>
      <td class="r"><a class="link-accent" href="/hook?id=${b.id}">Inspect</a></td></tr>`);
  }
  if (tab !== "launches" && tab !== "tokens") $("#more").hidden = true;
  $("#tbody").innerHTML = rows.join("");
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
      const ids = Array.from({ length: Math.min(n, 100) }, (_, i) => n - 1 - i);
      launches = await Promise.all(ids.map((id) => loadLaunch(id)));
      await web3.loadMeta(launches.map((l) => l.token)).catch(() => {});
    }
    if (web3.v4live) { pools = await loadPools(web3); await web3.loadMeta(pools.map((p) => p.token)).catch(() => {}); }
    if (web3.auctionsLive) auctions = await loadAuctions(web3);
    $("#updated").innerHTML = web3.live || web3.v4live || web3.auctionsLive ? '<i class="dot-green"></i>Updated' : "Launcher not deployed";
  } catch (err) {
    console.error(err);
    $("#updated").textContent = "Could not reach the chain";
  }
  render();
}

$("#tabs").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  tab = b.dataset.tab;
  document.querySelectorAll("#tabs button").forEach((x) => x.classList.toggle("active", x === b));
  render();
});
$("#filter").addEventListener("input", render);
$("#refresh").addEventListener("click", load);
$("#more").addEventListener("click", () => { shown += 20; render(); });
$("#tbody").addEventListener("click", async (e) => {
  const b = e.target.closest("button[data-collect]");
  if (!b) return;
  const p = pools.find((x) => x.token === b.dataset.collect);
  b.disabled = true;
  try {
    await web3.write({ address: web3.CONFIG.rigsLauncher, abi: web3.ABI.rigsLauncher, functionName: "collectCreatorFees", args: [p.token] });
    web3.toast(`LP fees for $${p.symbol} sent to its creator`);
  } catch (err) { web3.toast(web3.friendlyError(err)); } finally { b.disabled = false; }
});
document.addEventListener("click", (e) => {
  const a = e.target.closest("[data-tab-link]");
  if (a) { e.preventDefault(); document.querySelector(`#tabs [data-tab="${a.dataset.tabLink}"]`).click(); }
});
const initial = location.hash.slice(1);
if (["pools", "tokens", "hooks", "auctions"].includes(initial)) document.querySelector(`#tabs [data-tab="${initial}"]`).click();
render();
load();
