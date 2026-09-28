// /gacha: Collector Crypt machines, the coins paired with them, and each coin's vault, pulls and raffles.
import { CONFIG, client, $, esc, short, eth, toast, friendlyError, getAccount, onAccount, connect, write, ethUsd, fmtUsd, addrLink, coinAvatar } from "./web3.js";
import { PAIRED, MACHINES, gachaLive, pairedCoins, pairedDetail, liveMachines, packEth, setPrizeWallet } from "./paired.js";

const view = $("#gachaView");
const params = new URLSearchParams(location.search);
const RARITY = { Epic: "violet", Rare: "", Uncommon: "green", Common: "gray" };
const solscan = (x, kind = "token") => `https://solscan.io/${kind}/${x}`;
let usd = null;
let coins = [];
let live = null;

/** Merges the keeper's published machine data (odds, EV, stock) into the configured list. */
function machines() {
  const list = Array.isArray(live?.machines) ? live.machines : Array.isArray(live?.machines?.machines) ? live.machines.machines : [];
  return MACHINES.map((m) => {
    const l = list.find((x) => x.code === m.code) || {};
    return { ...m, priceUsd: Number(l.price ?? m.priceUsd), odds: l.odds, ev: l.ev, stock: l.stock };
  });
}

const stockCount = (s) => (s == null ? null : typeof s === "number" ? s : Object.values(s).reduce((a, b) => a + (Number(b) || 0), 0));

function machineCard(m) {
  const n = coins.filter((c) => c.machine?.code === m.code).length;
  const odds = m.odds && typeof m.odds === "object" ? Object.entries(m.odds) : [];
  const total = odds.reduce((a, [, v]) => a + Number(v || 0), 0) || 1;
  const stock = stockCount(m.stock);
  return `<div class="card gm-card">
    <div class="gm-top"><span class="gm-pack">🃏</span><div><b>${esc(m.name)}</b><small class="dim mono">${esc(m.code)}</small></div><span class="gm-price">$${m.priceUsd.toLocaleString("en-US")}</span></div>
    ${odds.length ? `<div class="gm-odds">${odds.map(([k, v]) => `<span class="r-${esc(k.toLowerCase())}" style="flex:${Number(v) / total}" title="${esc(k)} ${((Number(v) / total) * 100).toFixed(1)}%"></span>`).join("")}</div>
      <div class="gm-legend">${odds.map(([k, v]) => `<span><i class="r-${esc(k.toLowerCase())}"></i>${esc(k)} ${((Number(v) / total) * 100).toFixed(1)}%</span>`).join("")}</div>` : ""}
    <div class="kv"><span>One pack</span><b>${usd ? `≈ ${packEth(m, usd).toFixed(4)} ETH` : "…"}</b></div>
    ${m.ev != null ? `<div class="kv"><span>Expected value</span><b>${fmtUsd(Number(m.ev))}</b></div>` : ""}
    ${stock != null ? `<div class="kv"><span>Cards in the machine</span><b>${stock.toLocaleString("en-US")}</b></div>` : ""}
    <div class="kv"><span>Coins on it</span><b>${n}</b></div>
    <a class="btn btn-primary btn-sm" href="/launch?machine=${encodeURIComponent(m.code)}#gacha">Launch a coin on it</a>
  </div>`;
}

function coinCard(c, d) {
  const m = c.machine;
  const cost = packEth(m, usd);
  const have = Number(eth(d.balance + d.inFlight, 8)) + Number(eth(d.pendingFees, 8)) * 0.8;
  const pct = cost ? Math.min(100, (have / cost) * 100) : 0;
  return `<a class="card gc-card" href="/gacha?id=${c.id}">
    <div class="gc-head">${coinAvatar(c.symbol, "")}<div><b>${esc(c.name || c.symbol)}</b><small class="dim">$${esc(c.symbol)} · ${esc(m?.name || "unknown machine")}</small></div></div>
    <div class="kv"><span>Next pack</span><b>${cost ? `${pct.toFixed(0)}%` : "…"}</b></div>
    <div class="bar"><span style="width:${pct}%"></span></div>
    <div class="kv"><span>Packs ripped</span><b>${d.pulls.length}</b></div>
  </a>`;
}

function pullCard(p, c) {
  const rar = p.rarity ? `<span class="badge ${RARITY[p.rarity] ?? ""}">${esc(p.rarity)}</span>` : "";
  const me = getAccount();
  const mine = me && p.winner && p.winner.toLowerCase() === me.toLowerCase();
  let status = p.winner ? (p.delivered ? `Sent to ${short(p.winner)}` : `Won by ${short(p.winner)}`) : "In the next raffle";
  if (c.policy !== "Raffle") status = c.policy === "Burn" ? "Burned" : "Held by the vault";
  return `<div class="card gp-card">
    ${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy" />` : `<div class="gp-ph">🃏</div>`}
    <div class="gp-body">
      <div class="gp-name"><b>${esc(p.name || "Graded card")}</b> ${rar}</div>
      <small class="dim">${status}</small>
      ${p.mint ? `<a class="small link-accent" href="${solscan(p.mint)}" target="_blank" rel="noopener">Card on Solscan ↗</a>` : ""}
      ${!me && p.winner && !p.delivered ? `<button class="btn btn-ghost btn-xs gp-connect">Won this? Connect your wallet</button>` : ""}
      ${mine && !p.delivered ? `<div class="gp-claim"><input class="filter mono" data-dest="${p.tokenId}" placeholder="Your Solana wallet" /><button class="btn btn-primary btn-xs" data-save="${p.tokenId}" data-vault="${c.vault}">Send it here</button><small class="dim">You won this card. The keeper sends it to this wallet on its next run.</small></div>` : ""}
    </div>
  </div>`;
}

async function renderList() {
  const [list, u, lm] = await Promise.all([gachaLive ? pairedCoins(client).catch(() => []) : [], ethUsd(), liveMachines()]);
  coins = list.filter((c) => c.kind === "gacha");
  usd = u; live = lm;
  const details = await Promise.all(coins.map((c) => pairedDetail(client, c).catch(() => null)));
  const recent = coins.flatMap((c, i) => (details[i]?.pulls || []).map((p) => ({ p, c }))).slice(0, 12);

  view.innerHTML = `
    ${!gachaLive ? `<div class="gatebox"><b>Coming soon</b><p>Gacha coins open once the paired contracts are deployed and the Collector Crypt machines are connected.</p></div>` : ""}
    <section class="card pad gh-how">
      <div><b>1 · Trade</b><p class="dim small">Your coin launches on Pons. Its creator fees go 80% to the coin's vault, 20% to Rigs.</p></div>
      <div><b>2 · Rip</b><p class="dim small">When the vault holds one pack's worth, the keeper buys and opens a pack on the Collector Crypt machine.</p></div>
      <div><b>3 · Raffle</b><p class="dim small">The graded card it pulls is raffled to holders: tickets by balance, a public snapshot, a draw from a future block.</p></div>
    </section>
    <h2 class="h-sm sec-h">Machines</h2>
    <div class="grid3">${machines().map(machineCard).join("") || `<div class="empty"><b>No machines listed yet</b></div>`}</div>
    <h2 class="h-sm sec-h">Gacha coins</h2>
    <div class="grid3">${coins.map((c, i) => (details[i] ? coinCard(c, details[i]) : "")).join("") || `<div class="empty"><b>No gacha coins yet</b><span class="dim">Be the first: <a class="link-accent" href="/launch#gacha">launch one</a>.</span></div>`}</div>
    ${recent.length ? `<h2 class="h-sm sec-h">Recent pulls</h2><div class="grid4 gp-grid">${recent.map(({ p, c }) => pullCard(p, c)).join("")}</div>` : ""}
    <p class="dim small sec-gap">Cards are real graded collectibles held by Collector Crypt and minted as NFTs on Solana. Pack prices are in USDC; the vault pays in ETH at the current rate plus bridge fees. Contracts are not audited.</p>`;
}

async function renderCoin(id) {
  const [list, u] = await Promise.all([pairedCoins(client), ethUsd()]);
  usd = u;
  const c = list.find((x) => x.id === id);
  if (!c) { view.innerHTML = `<div class="empty"><b>Coin not found</b><a class="link-accent" href="/gacha">Back to Gacha</a></div>`; return; }
  const d = await pairedDetail(client, c);
  const m = c.machine;
  const cost = packEth(m, usd);
  const have = Number(eth(d.balance + d.inFlight, 8));
  const pct = cost ? Math.min(100, (have / cost) * 100) : 0;
  const now = Math.floor(Date.now() / 1000);
  const pendingNote = d.pending > 0n
    ? `<div class="notice">The keeper announced ${eth(d.pending, 5)} ETH for the next pack; it can move ${Number(d.readyAt) > now ? `after ${new Date(Number(d.readyAt) * 1000).toLocaleTimeString()}` : "now"}. The registry owner can cancel it on the vault (<span class="mono">cancelWithdrawal</span>).</div>` : "";

  view.innerHTML = `
    <p class="small"><a class="link-accent" href="/gacha">← Gacha</a></p>
    <section class="card pad gc-hero">
      <div class="gc-head">${coinAvatar(c.symbol, "")}<div><h2>${esc(c.name || c.symbol)} <span class="dim">$${esc(c.symbol)}</span></h2>
        <p class="dim small">Paired with ${esc(m?.name || "a Collector Crypt machine")} · every pull is ${c.policy === "Raffle" ? "raffled to holders" : c.policy.toLowerCase()}</p></div></div>
      <div class="btn-row">
        <a class="btn btn-primary btn-sm" href="${CONFIG.ponsCoinUrl}${c.token}" target="_blank" rel="noopener">Trade on Pons ↗</a>
        <a class="btn btn-dark btn-sm" href="${CONFIG.explorer}/address/${c.token}" target="_blank" rel="noopener">Token ↗</a>
      </div>
    </section>
    <div class="card kv-grid sec-gap">
      <div><small>In the vault</small><b>${eth(d.balance + d.inFlight, 4)} ETH</b><small>${d.pendingFees > 0n ? `+ ${eth((d.pendingFees * 8n) / 10n, 4)} ETH to harvest` : "fees harvest automatically"}</small></div>
      <div><small>Next pack</small><b>${cost ? `${pct.toFixed(0)}%` : "…"}</b><small>${cost ? `≈ ${cost.toFixed(4)} ETH for $${m.priceUsd}` : ""}</small></div>
      <div><small>Packs ripped</small><b>${d.pulls.length}</b><small>${d.raffles.filter((r) => r.drawn).length} raffles drawn</small></div>
    </div>
    <div class="bar sec-gap"><span style="width:${pct}%"></span></div>
    ${pendingNote}
    <h2 class="h-sm sec-h">Pulls</h2>
    <div class="grid4 gp-grid">${d.pulls.map((p) => pullCard(p, c)).join("") || `<div class="empty"><b>No packs yet</b><span class="dim">The first pack rips when the vault reaches 100%.</span></div>`}</div>
    <h2 class="h-sm sec-h">Raffles</h2>
    <div class="card pad stack">${d.raffles.map((r) => `<div class="kv"><span>Raffle #${r.id} · ${Number(r.totalTickets).toLocaleString("en-US")} tickets</span><b>${r.claimed ? "won" : r.drawn ? "drawn" : r.drawBlock > 0n ? "drawing" : "snapshot public"}</b></div>`).join("") || `<p class="dim small">Raffles start after the first pull. Holders get tickets by balance; the snapshot is public for 15 minutes before the draw.</p>`}
      <p class="dim small">Snapshots: <span class="mono">${esc(PAIRED.snapshotBaseUrl || "snapshots/")}</span> · vault ${addrLink(c.vault)}</p></div>`;
}

view.addEventListener("click", async (e) => {
  if (e.target.closest(".gp-connect")) { try { await connect(); } catch (err) { toast(friendlyError(err)); } return; }
  const b = e.target.closest("[data-save]");
  if (!b) return;
  const tokenId = BigInt(b.dataset.save);
  const input = view.querySelector(`[data-dest="${b.dataset.save}"]`);
  try {
    if (!getAccount()) await connect();
    b.disabled = true;
    await setPrizeWallet(write, b.dataset.vault, tokenId, input.value);
    toast("Saved. The keeper sends your card on its next run.");
    input.disabled = true;
  } catch (err) { toast(friendlyError(err)); b.disabled = false; }
});

const run = () => (params.get("id") ? renderCoin(params.get("id")) : renderList()).catch((e) => {
  console.error(e);
  view.innerHTML = `<div class="empty"><b>Could not read the chain</b><span class="dim">${esc(e.shortMessage || e.message)}</span></div>`;
});
onAccount(() => run());
