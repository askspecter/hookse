// Launch page: the Gacha form. A Pons coin on Robinhood Chain paired with a Collector Crypt machine;
// its creator fees fill a vault that rips packs, and every pulled card is raffled to holders.
// The chain picker lives in sol-launch.js and fires "rigs-chain".
import { CONFIG, client, ABI, getAccount, onAccount, connect, walletClient, ethUsd, friendlyError } from "./web3.js";
import { MACHINES, gachaLive, launchPaired, packEth } from "./paired.js";
import { uploadLogo } from "./upload.js";

const $ = (s) => document.querySelector(s);
const esc = (x) => String(x ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
const want = new URLSearchParams(location.search).get("machine");
const f = { name: "", symbol: "", description: "", logo: "", website: "", twitter: "", taxBps: 300, machine: (MACHINES.find((m) => m.code === want) || MACHINES[0])?.code || "" };
let maxTax = 500;
let usd = null;
let busy = false;
let lastResult = "";

const machine = () => MACHINES.find((m) => m.code === f.machine);
const valid = () => f.name.trim().length >= 2 && /^[A-Z0-9]{2,10}$/.test(f.symbol) && !!f.logo && !!machine();
const ready = () => gachaLive && getAccount() && valid() && !busy;

function render(result = lastResult) {
  lastResult = result;
  const box = $("#gachaLaunch");
  if (!box || box.hidden) return;
  const me = getAccount();
  const m = machine();
  const cost = packEth(m, usd);
  box.innerHTML = `
    <div class="sol-grid">
      <section class="card wiz-body">
        <h2 class="wiz-h wiz-h-logo"><span class="gm-pack">🃏</span>Launch a gacha coin</h2>
        <p class="muted small">Your coin launches on Pons on Robinhood Chain, paired to a real Collector Crypt gacha machine. Every trade fills its vault; each time it holds one pack's worth, the keeper rips a pack and the graded card it pulls is <b>raffled to holders</b>.</p>
        ${!gachaLive ? `<div class="gatebox"><b>Coming soon</b><p>Gacha launches open once the paired contracts are deployed and the Collector Crypt machines are connected.</p></div>` : ""}
        <p class="form-h">Machine</p>
        <div class="gl-machines">${MACHINES.map((x) => `<button type="button" class="gl-m ${x.code === f.machine ? "on" : ""}" data-machine="${esc(x.code)}"><b>${esc(x.name)}</b><span class="mono">$${Number(x.priceUsd).toLocaleString("en-US")} / pack</span></button>`).join("")}</div>
        <div class="row2">
          <label class="form-h">Name<input class="filter wide" data-gf="name" maxlength="32" placeholder="Pack Rat" value="${esc(f.name)}" /></label>
          <label class="form-h">Ticker<input class="filter wide mono" data-gf="symbol" maxlength="10" placeholder="PACK" value="${esc(f.symbol)}" /></label>
        </div>
        <label class="form-h">Description<textarea class="filter wide" data-gf="description" maxlength="280" rows="3" placeholder="One or two lines about your coin">${esc(f.description)}</textarea></label>
        <div class="upload-row">
          ${f.logo ? `<img class="sol-logo" src="${esc(f.logo)}" alt="" />` : `<span class="sol-logo empty">?</span>`}
          <label class="btn btn-ghost btn-sm upload-btn">${f.logo ? "Change logo" : "Upload logo"}<input type="file" id="gachaFile" accept="image/png,image/jpeg,image/webp,image/gif" hidden /></label>
          <span class="dim small">PNG, JPG, WEBP or GIF.</span>
        </div>
        <div class="row2">
          <label class="form-h">Website <span class="dim">optional</span><input class="filter wide" data-gf="website" placeholder="https://" value="${esc(f.website)}" /></label>
          <label class="form-h">X <span class="dim">optional</span><input class="filter wide" data-gf="twitter" placeholder="https://x.com/…" value="${esc(f.twitter)}" /></label>
        </div>
        <div class="subcard"><p class="form-h">Creator tax <span class="dim">${(f.taxBps / 100).toFixed(2)}%</span></p>
          <input class="range" type="range" data-gf="taxBps" min="0" max="${maxTax}" step="10" value="${f.taxBps}" />
          <p class="dim small">Charged on every Pons trade. A higher tax fills the vault faster: more packs, more raffles.</p></div>
        <div class="wiz-nav">
          ${me ? `<span class="small dim">Wallet <span class="mono">${short(me)}</span></span>` : `<button class="btn btn-ghost btn-sm" id="gachaConnect">Connect wallet</button>`}
          <button class="btn btn-primary btn-sm push" id="gachaGo" ${ready() ? "" : "disabled"}>${busy ? "Working…" : "Sign & launch"}</button>
        </div>
        <p class="small muted" id="gachaStep"></p>
        ${result}
      </section>
      <aside class="stack wiz-side">
        <div class="card pad">
          <p class="form-h">Where the creator fees go</p>
          <div class="h-split sol-split"><span style="width:80%">vault → packs</span><span>Rigs</span></div>
          <div class="kv"><span>Coin vault (packs)</span><b>80%</b></div>
          <div class="kv"><span>Rigs treasury</span><b>20%</b></div>
          <p class="dim small">Fixed at launch. The vault can only spend on packs from this machine; there is no withdraw to anyone else.</p>
        </div>
        <div class="card pad">
          <p class="form-h">${esc(m?.name || "Machine")}</p>
          <div class="kv"><span>Pack price</span><b>$${Number(m?.priceUsd || 0).toLocaleString("en-US")}</b></div>
          <div class="kv"><span>In ETH today</span><b>${cost ? `≈ ${cost.toFixed(4)}` : "…"}</b></div>
          <div class="kv"><span>Trading volume per pack</span><b>${cost && f.taxBps ? `≈ ${(cost / 0.8 / (f.taxBps / 10_000)).toFixed(2)} ETH` : "—"}</b></div>
          <p class="dim small"><a class="link-accent" href="/gacha">Machines, odds and pulls →</a></p>
        </div>
        <div class="card pad">
          <p class="form-h">Good to know</p>
          <ul class="compat">
            <li class="ok">Every pull is a real graded card, minted as an NFT on Solana</li>
            <li class="ok">Raffle tickets follow balances; the snapshot is public 15 minutes before the draw</li>
            <li class="ok">Winners enter a Solana wallet on the coin's Gacha page</li>
            <li class="warn">The keeper buys the packs; each withdrawal is announced an hour ahead and can be cancelled</li>
          </ul>
        </div>
      </aside>
    </div>`;
}

document.addEventListener("rigs-chain", (e) => { if (e.detail === "gacha") render(); });

document.addEventListener("click", async (e) => {
  const mb = e.target.closest("[data-machine]");
  if (mb) { f.machine = mb.dataset.machine; return render(); }
  if (e.target.closest("#gachaConnect")) {
    try { await connect(); } catch (err) { const el = $("#gachaStep"); if (el) el.textContent = err.message; }
    return;
  }
  if (!e.target.closest("#gachaGo") || !ready()) return;
  busy = true; render();
  try {
    const step = (msg) => { const el = $("#gachaStep"); if (el) el.textContent = msg; };
    step("Confirm in your wallet…");
    const wallet = await walletClient();
    const r = await launchPaired({ client, wallet, ponsAbi: ABI.pons }, f, { machine: machine() });
    busy = false;
    render(`<div class="card done"><b>$${esc(f.symbol)} is live, paired to ${esc(machine().name)}.</b>
      <p><a class="link-accent" href="/gacha?id=${r.id}">Its Gacha page →</a> · <a class="link-accent" href="${CONFIG.ponsCoinUrl}${r.token}" target="_blank" rel="noopener">Trade on Pons ↗</a> · <a class="link-accent" href="${CONFIG.explorer}/tx/${r.hash}" target="_blank" rel="noopener">Transaction ↗</a></p>
      <p class="small dim">Vault <span class="mono">${short(r.vault)}</span> fills with 80% of the creator fees and rips a pack each time it holds enough.</p></div>`);
  } catch (err) {
    console.error(err);
    busy = false; render();
    const el = $("#gachaStep"); if (el) el.textContent = friendlyError(err);
  }
});

document.addEventListener("input", (e) => {
  const k = e.target.dataset?.gf;
  if (!k) return;
  if (k === "symbol") { f.symbol = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""); e.target.value = f.symbol; }
  else if (k === "taxBps") { f.taxBps = Number(e.target.value); return render(); }
  else f[k] = e.target.value;
  const go = $("#gachaGo");
  if (go) go.disabled = !ready();
});

document.addEventListener("change", async (e) => {
  if (e.target.id !== "gachaFile" || !e.target.files?.[0]) return;
  $("#gachaStep").textContent = "Uploading logo…";
  try { f.logo = await uploadLogo(e.target.files[0]); render(); } catch (err) { $("#gachaStep").textContent = err.message; }
});

onAccount(() => render());
Promise.all([
  client.readContract({ address: CONFIG.ponsFactory, abi: ABI.pons, functionName: "maxCreatorTaxBps" }).catch(() => 500),
  ethUsd(),
]).then(([max, u]) => { maxTax = Number(max); if (f.taxBps > maxTax) f.taxBps = maxTax; usd = u; render(); });
render();
