// Rigs landing page. Stats and tables are read from the Rigs contracts on-chain.

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ---------- toast ---------- */
let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2400);
}

/* ---------- nav + hero menu ---------- */
$("#burger").addEventListener("click", () => $("#links").classList.toggle("open"));
$$("#links a").forEach(a => a.addEventListener("click", () => $("#links").classList.remove("open")));
$("#moreBtn").addEventListener("click", e => { e.stopPropagation(); $(".more-wrap").classList.toggle("open"); });
document.addEventListener("click", () => $(".more-wrap").classList.remove("open"));

/* ---------- data ---------- */
const ICONS = {
  shield: '<path d="M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6z"/>',
  bars: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
  flame: '<path d="M12 3c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-4 3-6 1 2 2 2 3 2 0-3-1-5 0-7z"/>',
  drop: '<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/>',
  pot: '<path d="M5 10h14l-1.5 9h-11zM8 10V7a4 4 0 0 1 8 0v3"/>',
  cycle: '<path d="M4 12a8 8 0 0 1 14-5l2 2M20 12a8 8 0 0 1-14 5l-2-2M20 4v5h-5M4 20v-5h5"/>',
};
const icon = (k, c) => `<div class="ico" style="color:${c};background:${c}22;border-color:${c}44"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[k]}</svg></div>`;

const RULES = [
  { id: "antisnipe", name: "Anti-Snipe", ic: "shield", c: "#8b5cf6", desc: "Limits buy size right after open and routes an extra LP fee during the opening blocks.", gas: 160 },
  { id: "surge", name: "Surge Fee", ic: "bars", c: "#ff8a00", desc: "Bigger trades pay a higher fee, relative to pool depth.", gas: 120 },
  { id: "burn", name: "Auto Burn", ic: "flame", c: "#ff4d4d", desc: "Sends a slice of each buy's output straight to the dead address.", gas: 140 },
  { id: "lp", name: "LP Rewards", ic: "drop", c: "#40b66b", desc: "Shares fees with in-range liquidity providers over time.", gas: 150 },
  { id: "pot", name: "Nth-Buy Pot", ic: "pot", c: "#ffc700", desc: "An on-chain counter pays the pot to every Nth qualifying buy.", gas: 180 },
];

const INTEGRATIONS = [
  { name: "Pons V2", av: "P", st: "live", href: "docs.html#pons", desc: "Every Rigs coin launches on a Pons V2 bonding curve and graduates into a locked Uniswap v4 pool." },
  { name: "Uniswap v4", av: "U", st: "live", href: "docs.html#blocks", desc: "Hooks, the PoolManager and routing. The Rigs rule blocks are a standard v4 hook." },
  { name: "Robinhood Chain", av: "R", st: "live", href: "docs.html#addresses", desc: "Chain 4663, where the launcher, fee splitters and pools live." },
  { name: "WalletConnect", av: "W", st: "live", href: "docs.html#wallets", desc: "Mobile and desktop wallets connect through Reown AppKit." },
];

const AUDIENCE_LINKS = { "Traders": "app.html", "Liquidity providers": "portfolio.html", "Launchers": "launch.html", "Hook builders": "builder.html", "Analysts": "scan.html", "Integrators": "integrations.html", "Agents": "agents.html" };
const AUDIENCES = [
  ["Traders", "Check every rule before a swap", "Each market shows its decoded blocks plus the on-chain proof."],
  ["Liquidity providers", "Positions, fees, migration", "Mint, manage and move liquidity between hooked pools."],
  ["Launchers", "New token or existing asset", "Pick token, hooks and fee split, then review before deploying."],
  ["Hook builders", "Compose, list, get paid", "Templates with royalty terms enforced by contract, priced up front."],
  ["Analysts", "Inspect any v4 hook", "Read callbacks and permission bits straight from a hook address."],
  ["Integrators", "SDK and intake lanes", "Public catalog, launch, pool and execution endpoints."],
  ["Agents", "Machine-readable manifests", "Discovery files, signed approvals and launch packets for bots."],
];

const ACTIONS = [
  ["Launch", "Launch a coin on Pons V2 in one transaction. You keep 80% of its creator fees.", "launch.html", true],
  ["Claim fees", "See every coin you launched and withdraw your share of creator fees.", "portfolio.html"],
  ["Builder", "Pick blocks, tune each parameter and preview the result before you sign.", "builder.html"],
  ["Integrate", "Launch from your own app; your users still claim their fees here.", "integrations.html"],
  ["Agents", "Contract calls and a manifest file any bot or agent can use.", "agents.html"],
  ["Build a block", "Write a new block and submit it for review to enter the catalog.", "scan.html#listing"],
  ["Scan a hook", "Decode any Uniswap v4 hook's permissions from its address.", "scan.html"],
  ["Learn", "Short guides on curves, graduation, fees and risks.", "learn.html"],
  ["Docs", "Contracts, fee model, events and addresses.", "docs.html"],
];

const FAQ = [
  ["What is Rigs?", "A launchpad on Pons V2 plus a catalog of Uniswap v4 hook blocks. Launch a coin, keep 80% of its creator fees, and compose pool rules in the builder."],
  ["How do creator fees work?", "Each coin's Pons creator fees go to its own fee splitter contract. 80% is yours to claim in Portfolio; 20% goes to the Rigs treasury."],
  ["Which rules can a pool use right now?", "Anti-Snipe, Surge Fee, Auto Burn, LP Rewards and Nth-Buy Pot. Parameters are fixed when the pool opens."],
  ["How does the Nth-Buy Pot pick winners?", "It is not random: a public counter increments on every qualifying buy and pays the pot when it hits N."],
  ["Where are Rigs tokens traded?", "In their hooked v4 pool, and through any aggregator or venue that routes to Uniswap v4."],
  ["Can I add hooks to a token that already exists?", "Yes. In Launch, pick Existing asset: you put tokens in, choose the opening price and rules, and a new hooked ETH pair opens. Its LP fees go to you."],
  ["What are auctions?", "Dutch auctions: a seller deposits tokens and the price falls from a start price to a floor over time. Buyers pay the current price; unsold tokens go back to the seller."],
  ["Is the data on this page live?", "Yes. Every number and table is read from the Rigs contracts on Robinhood Chain."],
];

/* ---------- render sections ---------- */
$("#integrations").innerHTML = INTEGRATIONS.map(x => `
  <a href="${x.href}" class="card integ">
    <div class="ava">${x.av}</div>
    <div><b>${x.name}</b><span class="tag ${x.st === "live" ? "tag-live" : "tag-soon"}">${x.st === "live" ? "Live" : "Coming soon"}</span><p>${x.desc}</p></div>
  </a>`).join("");

$("#rulesGrid").innerHTML = RULES.map(r => `
  <a href="hook.html?id=${({ antisnipe: "anti-snipe", surge: "surge-fee", burn: "auto-burn", lp: "lp-rewards", pot: "nth-buy-pot" })[r.id]}" class="card rule">
    ${icon(r.ic, r.c)}
    <h4>${r.name}</h4>
    <p>${r.desc}</p>
    ${`<div class="gas">~${r.gas}K gas per swap · locked at pool open</div>`}
  </a>`).join("");

$("#audiences").innerHTML = AUDIENCES.map(([k, h, p]) => `
  <a href="${AUDIENCE_LINKS[k]}" class="card aud"><span class="k">${k}</span><h4>${h}</h4><p>${p}</p></a>`).join("");

$("#actions").innerHTML = ACTIONS.map(([h, p, href, isNew]) => `
  <a href="${href}" class="card act"><b>${h}</b>${isNew ? ' <span class="tag tag-new">New</span>' : ""}<p>${p}</p></a>`).join("");

$("#faqList").innerHTML = FAQ.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join("");

/* ---------- live data ---------- */
const HEADS = {
  launches: ["Coin", "Creator", "Paid to creator", "Launched", ""],
  pools: ["Pool", "Creator", "Rules", "Base fee", ""],
  auctions: ["Token", "Status", "Price now", "Sold", ""],
};
let tab = "launches";
const data = { launches: [], pools: [], auctions: [] };
let w = null;
const esc = (x) => String(x ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const ago = (ts) => { const s = Math.max(0, Date.now() / 1000 - ts); return s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`; };
const tok = (sym, name, addr) => `${addr ? `<a href="coin.html?token=${addr}">` : ""}<div class="tok"><div class="av">${esc((sym || "?").slice(0, 2))}</div><span>${esc(name || "Unknown")} <span class="dim">$${esc(sym || "")}</span></span></div>${addr ? "</a>" : ""}`;
const NAMES = { 1: "Anti-Snipe", 2: "Surge Fee", 4: "Auto Burn", 8: "LP Rewards", 16: "Nth-Buy Pot" };

function renderTable() {
  const q = $("#filter").value.trim().toLowerCase();
  $("#thead").innerHTML = "<tr>" + HEADS[tab].map((h, i) => `<th class="${i >= 2 ? "r" : ""}">${h}</th>`).join("") + "</tr>";
  const match = (x) => !q || `${x.name} ${x.symbol} ${x.token}`.toLowerCase().includes(q);
  let rows = [];
  if (tab === "launches") rows = data.launches.filter(match).slice(0, 10).map((l) => `<tr><td>${tok(l.symbol, l.name, l.token)}</td><td>${w.addrLink(l.creator || l.creatorAtLaunch)}</td><td class="r mono">${w.eth(l.totalToCreator, 5)} ETH</td><td class="r dim">${ago(l.launchedAt)}</td><td class="r"><a class="link-pink" href="coin.html?token=${l.token}">Trade</a></td></tr>`);
  if (tab === "pools") rows = data.pools.filter(match).slice(0, 10).map((p) => `<tr><td>${tok(p.symbol, p.name, p.token)}</td><td>${w.addrLink(p.creator)}</td><td><div class="chips">${Object.entries(NAMES).filter(([b]) => p.blocks & b).map(([, n]) => `<span class="chip">${n}</span>`).join("") || '<span class="dim">base fee only</span>'}</div></td><td class="r mono">${(p.baseFee / 10000).toFixed(2)}%</td><td class="r"><a class="link-pink" href="coin.html?token=${p.token}">Trade</a></td></tr>`);
  if (tab === "auctions") rows = data.auctions.filter(match).slice(0, 10).map((a) => `<tr><td>${tok(a.symbol, a.name)}</td><td><span class="badge gray">${a.status}</span></td><td class="r mono">${a.priceEth} ETH</td><td class="r mono">${a.pctSold}%</td><td class="r"><a class="link-pink" href="auctions.html#auction-${a.id}">Open</a></td></tr>`);
  $("#tbody").innerHTML = rows.join("") || `<tr><td colspan="5" class="dim">${!w ? "Reading the chain…" : `Nothing here yet. <a href="${tab === "auctions" ? "auctions.html#create" : "launch.html"}">Be the first →</a>`}</td></tr>`;
  $("#discStatus").textContent = w ? `${rows.length} shown · live` : "Reading…";
}

$("#tabs").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  tab = b.dataset.tab;
  $$("#tabs button").forEach((x) => x.classList.toggle("active", x === b));
  renderTable();
});
$("#filter").addEventListener("input", renderTable);
renderTable();

(async () => {
  try {
    w = await import("./web3.js");
    const { client, CONFIG, ABI } = w;
    const count = (address, abi, functionName) => (address ? client.readContract({ address, abi, functionName }).then(Number).catch(() => 0) : Promise.resolve(0));
    const [nL, nP, nA] = await Promise.all([
      w.live ? count(CONFIG.ponsLauncher, ABI.launcher, "launchCount") : 0,
      w.v4live ? count(CONFIG.rigsLauncher, ABI.rigsLauncher, "tokenCount") : 0,
      w.auctionsLive ? count(CONFIG.rigsAuctions, ABI.rigsAuctions, "auctionCount") : 0,
    ]);
    $("#stLaunches").textContent = nL.toLocaleString("en-US");
    $("#stPools").textContent = nP.toLocaleString("en-US");
    $("#stAuctions").textContent = nA.toLocaleString("en-US");
    data.launches = await Promise.all(Array.from({ length: Math.min(nL, 100) }, (_, i) => w.loadLaunch(nL - 1 - i)));
    $("#stPaid").textContent = w.eth(data.launches.reduce((s2, l) => s2 + l.totalToCreator, 0n), 4);
    const { encodeAbiParameters, keccak256, formatEther } = await import("https://cdn.jsdelivr.net/npm/viem@2.21.0/+esm");
    data.pools = await Promise.all(Array.from({ length: Math.min(nP, 20) }, async (_, i) => {
      const token = await client.readContract({ address: CONFIG.rigsLauncher, abi: ABI.rigsLauncher, functionName: "tokens", args: [BigInt(nP - 1 - i)] });
      const k = await client.readContract({ address: CONFIG.rigsLauncher, abi: ABI.rigsLauncher, functionName: "keyOf", args: [token] });
      const id = keccak256(encodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }], [k.currency0, k.currency1, k.fee, k.tickSpacing, k.hooks]));
      const [[, creator], [cfg], info] = await Promise.all([
        client.readContract({ address: CONFIG.rigsLauncher, abi: ABI.rigsLauncher, functionName: "launches", args: [id] }),
        client.readContract({ address: CONFIG.rigsHook, abi: ABI.rigsHook, functionName: "getPool", args: [id] }),
        w.tokenInfo(token),
      ]);
      return { token, creator, name: info.name, symbol: info.symbol, blocks: Number(cfg.blocks), baseFee: Number(cfg.baseFee) };
    }));
    const nowS = Date.now() / 1000;
    data.auctions = await Promise.all(Array.from({ length: Math.min(nA, 20) }, async (_, i) => {
      const id = nA - 1 - i;
      const [a, p] = await Promise.all([
        client.readContract({ address: CONFIG.rigsAuctions, abi: ABI.rigsAuctions, functionName: "auctions", args: [BigInt(id)] }),
        client.readContract({ address: CONFIG.rigsAuctions, abi: ABI.rigsAuctions, functionName: "priceOf", args: [BigInt(id)] }),
      ]);
      const info = await w.tokenInfo(a.token);
      const status = nowS < Number(a.start) ? "upcoming" : nowS >= Number(a.end) || a.sold >= a.amount ? "ended" : "live";
      return { id, token: a.token, name: info.name, symbol: info.symbol, status, priceEth: Number(formatEther(p)).toPrecision(4), pctSold: a.amount ? Number((a.sold * 1000n) / a.amount) / 10 : 0 };
    }));
  } catch (err) {
    console.error(err);
    ["#stLaunches", "#stPools", "#stAuctions", "#stPaid"].forEach((k) => { if ($(k).textContent === "Loading…") $(k).textContent = "—"; });
  }
  renderTable();
})();
