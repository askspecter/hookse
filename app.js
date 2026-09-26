// Hookse demo front-end. Every number, pool and partner below is mock data.

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
  { id: "arb", name: "Arb Recapture", ic: "cycle", c: "#4c82fb", desc: "Keeps cross-venue arbitrage profit inside the pool rather than leaking it to outside bots.", partner: true },
];

const INTEGRATIONS = [
  { name: "Perpline", av: "P", st: "live", desc: "Launch a coin and trade it as a perpetual in the same flow." },
  { name: "Arbkeeper", av: "A", st: "live", desc: "Captures price gaps between venues during the swap and shares the profit with the pool's LPs instead of external searchers." },
  { name: "Questpool", av: "Q", st: "soon", desc: "Game-economy hooks: rewards, sinks and settlement handled by the pool itself." },
  { name: "Tradehall", av: "T", st: "live", desc: "A standalone trading venue listing Hookse tokens." },
];

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
  ["Launch", "Create a token with its own rule set, paired with ETH, a stablecoin or the platform token."],
  ["Open a pool", "Attach hooks to an asset that already trades by opening a fresh hooked pair."],
  ["Builder", "Pick blocks, tune each parameter and preview the result before you sign."],
  ["Integrate", "Launch from your own app and keep managing liquidity on the same venue."],
  ["Agents", "Read a pool's rules, get quotes and swap from a skill file any agent can load."],
  ["Build a block", "Write a new block and submit it for review to enter the catalog."],
  ["In review", "Leverage hooks we are building ourselves, currently under audit."],
  ["Arb Recapture", "Pools keep the arbitrage they generate. The router blocks outside arbitrage and shares what it captures.", true],
  ["Partners", "Game-economy hooks with Questpool, coming soon."],
];

const FAQ = [
  ["What is Hookse?", "A launchpad and catalog for Uniswap v4 hooks. You pick small single-purpose blocks, stack them in one pool, and launch or trade on top."],
  ["Which rules can a pool use right now?", "Anti-Snipe, Surge Fee, Auto Burn, LP Rewards, Nth-Buy Pot and Arb Recapture. Parameters are fixed when the pool opens."],
  ["How does the Nth-Buy Pot pick winners?", "It is not random: a public counter increments on every qualifying buy and pays the pot when it hits N."],
  ["Where are Hookse tokens traded?", "In their hooked v4 pool, and through any aggregator or venue that routes to Uniswap v4."],
  ["Can I add hooks to a token that already exists?", "Yes. Open a new hooked pair for it; the original pools are left untouched."],
  ["Is any of this live?", "No. This site is a front-end demo and all data shown is mock data."],
];

const COLORS = ["#fc72ff", "#c8f135", "#4c82fb", "#ffc700", "#8b5cf6", "#40b66b", "#ff8a00"];
let seed = 11;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const POOLS = [["HFROG", "WETH"], ["MOONP", "WETH"], ["BCRAB", "USDG"], ["GIGA", "WETH"], ["TWHL", "HOOK"], ["SCAT", "WETH"], ["BURNY", "USDG"], ["POTL", "WETH"], ["LAZY", "HOOK"], ["DDUCK", "WETH"]]
  .map(([a, b], i) => ({
    a, b, color: COLORS[i % COLORS.length],
    rules: RULES.slice(0, 5).filter(() => rand() > 0.55).slice(0, 3),
    tvl: 8000 + rand() * 900000, change: (rand() - 0.4) * 90, vol: 2000 + rand() * 400000, apr: rand() * 180,
    price: rand() * 0.003, mcap: 30000 + rand() * 3e6,
  }));
POOLS.forEach((p, i) => { if (!p.rules.length) p.rules.push(RULES[i % 5]); });

const usd = n => n >= 1e6 ? "$" + (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? "$" + (n / 1e3).toFixed(1) + "K" : "$" + n.toFixed(2);
const pct = n => `<span class="${n >= 0 ? "up" : "down"}">${n >= 0 ? "+" : ""}${n.toFixed(1)}%</span>`;

/* ---------- render sections ---------- */
$("#integrations").innerHTML = INTEGRATIONS.map(x => `
  <a href="#" class="card integ" data-demo="${x.name}">
    <div class="ava">${x.av}</div>
    <div><b>${x.name}</b><span class="tag ${x.st === "live" ? "tag-live" : "tag-soon"}">${x.st === "live" ? "Live" : "Coming soon"}</span><p>${x.desc}</p></div>
  </a>`).join("");

$("#rulesGrid").innerHTML = RULES.map(r => `
  <a href="#" class="card rule" data-demo="${r.name}">
    ${icon(r.ic, r.c)}
    <h4>${r.name}</h4>
    <p>${r.desc}</p>
    ${r.partner
      ? `<div class="pow">Run with <b>Arbkeeper</b><span class="ext">arbkeeper.example ↗</span></div>`
      : `<div class="gas">~${r.gas}K gas per swap · locked at pool open</div>`}
  </a>`).join("");

$("#audiences").innerHTML = AUDIENCES.map(([k, h, p]) => `
  <a href="#" class="card aud" data-demo="${k}"><span class="k">${k}</span><h4>${h}</h4><p>${p}</p></a>`).join("");

$("#actions").innerHTML = ACTIONS.map(([h, p, isNew]) => `
  <a href="#" class="card act" data-demo="${h}"><b>${h}</b>${isNew ? ' <span class="tag tag-new">New</span>' : ""}<p>${p}</p></a>`).join("");

$("#faqList").innerHTML = FAQ.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join("");

/* ---------- discover table ---------- */
const HEADS = {
  pools: ["Pool", "Hook · rules", "TVL", "24h", "Volume APR"],
  hooks: ["Hook", "What it does", "Pools", "Gas", "Status"],
  tokens: ["Token", "Rules", "Price", "24h", "Market cap"],
};
let tab = "pools";
const tokCell = (p, pair) => `<div class="tok"><div class="av" style="background:${p.color}">${p.a.slice(0, 2)}</div><span>${p.a}${pair ? " / " + p.b : ""}</span></div>`;
const ruleChips = p => `<div class="chips">${p.rules.map(r => `<span class="chip">${r.name}</span>`).join("")}</div>`;

function renderTable() {
  const q = $("#filter").value.trim().toLowerCase();
  $("#thead").innerHTML = "<tr>" + HEADS[tab].map((h, i) => `<th class="${i >= 2 ? "r" : ""}">${h}</th>`).join("") + "</tr>";
  let rows;
  if (tab === "hooks") {
    rows = RULES.filter(r => !q || r.name.toLowerCase().includes(q)).map(r => `<tr>
      <td><div class="tok">${icon(r.ic, r.c)}<span>${r.name}</span></div></td><td class="dim">${r.desc}</td>
      <td class="r mono">${POOLS.filter(p => p.rules.includes(r)).length}</td><td class="r mono">${r.gas ? "~" + r.gas + "K" : "—"}</td>
      <td class="r"><span class="tag tag-live">Sealed</span></td></tr>`);
  } else {
    rows = POOLS.filter(p => !q || (p.a + p.b).toLowerCase().includes(q) || p.rules.some(r => r.name.toLowerCase().includes(q))).map(p => tab === "pools"
      ? `<tr><td>${tokCell(p, true)}</td><td>${ruleChips(p)}</td><td class="r mono">${usd(p.tvl)}</td><td class="r mono">${pct(p.change)}</td><td class="r mono">${p.apr.toFixed(1)}%</td></tr>`
      : `<tr><td>${tokCell(p)}</td><td>${ruleChips(p)}</td><td class="r mono">$${p.price.toFixed(6)}</td><td class="r mono">${pct(p.change)}</td><td class="r mono">${usd(p.mcap)}</td></tr>`);
  }
  $("#tbody").innerHTML = rows.join("") || `<tr><td colspan="5" class="dim">Nothing matches “${q}”.</td></tr>`;
  $("#discStatus").textContent = `${rows.length} ${tab} · mock data`;
}
$("#tabs").addEventListener("click", e => {
  const b = e.target.closest("button");
  if (!b) return;
  tab = b.dataset.tab;
  $$("#tabs button").forEach(x => x.classList.toggle("active", x === b));
  renderTable();
});
$("#filter").addEventListener("input", renderTable);
$("#tbody").addEventListener("click", e => { if (e.target.closest("tr .tok")) toast("Detail pages aren't part of this demo"); });
// Simulate the indexer loading, like a live page would.
setTimeout(renderTable, 900);

/* ---------- stats ---------- */
function countUp(el) {
  const target = +el.dataset.count, pre = el.dataset.prefix || "";
  const t0 = performance.now();
  const step = t => {
    const p = Math.min((t - t0) / 1200, 1);
    el.textContent = pre + Math.round(target * (1 - Math.pow(1 - p, 3))).toLocaleString("en-US");
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
setTimeout(() => $$("[data-count]").forEach(countUp), 700);

/* ---------- placeholder links ---------- */
document.addEventListener("click", e => {
  const a = e.target.closest('a[href="#"], [data-demo]');
  if (!a || a.closest(".more-menu")) return;
  if (a.getAttribute("href") === "#") e.preventDefault();
  if (a.dataset.demo) toast(`${a.dataset.demo}: not wired up in this demo`);
});
