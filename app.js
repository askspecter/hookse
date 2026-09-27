// Rigs landing page. Every number and coin is read from the Rigs contracts on-chain.
import { BLOCKS, blockIcon } from "./hooks-data.js";

const $ = (s, r = document) => r.querySelector(s);
const esc = (x) => String(x ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const ago = (ts) => { const s = Math.max(0, Date.now() / 1000 - ts); return s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`; };

/* ---------- static sections ---------- */
$("#ruleRows").innerHTML = BLOCKS.map((b) => `
  <a class="rule-row-h" href="/hook?id=${b.id}">
    ${blockIcon(b, 18)}
    <span><b>${b.name}</b><small>${b.short}</small></span>
    <em>~${b.gas}K gas</em>
  </a>`).join("");

const DEV = [
  ["Docs", "Contracts, fee model, events and every address.", "/docs"],
  ["Agents", "One skill file any bot can read to quote, trade and launch.", "/agents"],
  ["Scan", "Decode any Uniswap v4 hook's permissions from its address.", "/scan"],
  ["Integrations", "Launch from your own app; creators still claim here.", "/integrations"],
];
$("#devLinks").innerHTML = DEV.map(([t, d, h]) => `<a href="${h}"><b>${t}</b><span>${d}</span><i aria-hidden="true">→</i></a>`).join("");

const FAQ = [
  ["What is Rigs?", "A launchpad on Pons V2 plus five Uniswap v4 rule blocks. Launch a coin, keep 80% of its creator fees, and compose pool rules in the builder."],
  ["How do creator fees work?", "Each coin's Pons creator fees go to its own fee splitter contract. 80% is yours to claim under Earn; 20% goes to the Rigs treasury."],
  ["Which rules can a pool use?", "Launch Guard, Impact Fee, Buy Burn, LP Boost and Counter Pot. Parameters are fixed when the pool opens."],
  ["How does the Counter Pot pick winners?", "It is not random: a public counter goes up on every qualifying buy and pays the pot when it hits N."],
  ["Can I add rules to a coin that already exists?", "Yes. In Launch pick Existing asset: you put tokens in, choose the opening price and rules, and a new hooked ETH pool opens. Its LP fees go to you."],
  ["What are auctions?", "Dutch auctions: the price falls from a start price to a floor over time. Buyers pay the current price; unsold tokens go back to the seller."],
];
$("#faqList").innerHTML = FAQ.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join("");

/* ---------- live data ---------- */
let w = null;
function coinCard(c) {
  const foot = c.kind === "pons"
    ? `<span>Creator earned</span><b>${w.eth(c.totalToCreator, 4)} ETH</b>`
    : `<span>Rules on</span><b>${BLOCKS.filter((b) => c.blocks & b.bit).length} / 5</b>`;
  return `<a class="coin-card" href="/coin?token=${c.token}">
    <div class="cc-top">${w.coinAvatar(c.symbol, w.metaOf(c.token).logo)}<span class="cc-kind">${c.kind === "pons" ? "Curve" : "v4 pool"}</span></div>
    <b class="cc-name">${esc(c.name || "Unknown")}</b>
    <span class="cc-sym">$${esc(c.symbol || "?")}${c.launchedAt ? ` · ${ago(c.launchedAt)}` : ""}</span>
    <div class="cc-foot">${foot}</div>
  </a>`;
}
function renderRail(coins, failed) {
  $("#rail").innerHTML = coins.length
    ? coins.map(coinCard).join("") + `<a class="coin-card cc-new" href="/launch"><span>+</span><b>Launch yours</b><small>Keep 80% of the fees</small></a>`
    : `<div class="rail-empty">${failed ? "Could not reach Robinhood Chain right now." : "No coins yet."} <a class="link-accent" href="/launch">Launch the first one →</a></div>`;
}

(async () => {
  const set = (id, v) => { $(id).textContent = v; };
  try {
    w = await import("./web3.js");
    const { client, CONFIG, ABI } = w;
    const count = (address, abi, fn) => (address ? client.readContract({ address, abi, functionName: fn }).then(Number).catch(() => 0) : Promise.resolve(0));
    const [nL, nP, nA] = await Promise.all([
      w.live ? count(CONFIG.ponsLauncher, ABI.launcher, "launchCount") : 0,
      w.v4live ? count(CONFIG.rigsLauncher, ABI.rigsLauncher, "tokenCount") : 0,
      w.auctionsLive ? count(CONFIG.rigsAuctions, ABI.rigsAuctions, "auctionCount") : 0,
    ]);
    set("#stLaunches", nL.toLocaleString("en-US"));
    set("#stPools", nP.toLocaleString("en-US"));
    set("#stAuctions", nA.toLocaleString("en-US"));
    const launches = await Promise.all(Array.from({ length: Math.min(nL, 100) }, (_, i) => w.loadLaunch(nL - 1 - i)));
    set("#stPaid", w.eth(launches.reduce((s, l) => s + l.totalToCreator, 0n), 4));
    const { encodeAbiParameters, keccak256 } = await import("https://cdn.jsdelivr.net/npm/viem@2.21.0/+esm");
    const pools = await Promise.all(Array.from({ length: Math.min(nP, 8) }, async (_, i) => {
      const token = await client.readContract({ address: CONFIG.rigsLauncher, abi: ABI.rigsLauncher, functionName: "tokens", args: [BigInt(nP - 1 - i)] });
      const k = await client.readContract({ address: CONFIG.rigsLauncher, abi: ABI.rigsLauncher, functionName: "keyOf", args: [token] });
      const id = keccak256(encodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }], [k.currency0, k.currency1, k.fee, k.tickSpacing, k.hooks]));
      const [[cfg], info] = await Promise.all([
        client.readContract({ address: CONFIG.rigsHook, abi: ABI.rigsHook, functionName: "getPool", args: [id] }),
        w.tokenInfo(token),
      ]);
      return { kind: "v4", token, name: info.name, symbol: info.symbol, blocks: Number(cfg.blocks) };
    }));
    const coins = [...launches.slice(0, 12).map((l) => ({ kind: "pons", ...l })), ...pools].slice(0, 12);
    await w.loadMeta(coins.map((c) => c.token)).catch(() => {});
    renderRail(coins, false);
  } catch (err) {
    console.error(err);
    ["#stLaunches", "#stPools", "#stAuctions", "#stPaid"].forEach((k) => set(k, "—"));
    renderRail([], true);
  }
})();
