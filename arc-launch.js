// Launch page: the Arc (Argus) form. The chain picker lives in sol-launch.js and fires "rigs-chain".
import { ARC, arcLive, argusCurve, launchOnArc } from "./arc.js";
import { getAccount, onAccount, connect, fmtUsdShort } from "./web3.js";
import { uploadLogo } from "./upload.js";

const $ = (s) => document.querySelector(s);
const esc = (x) => String(x ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
const f = { name: "", symbol: "", description: "", logo: "", website: "", twitter: "", buyTaxBps: 300, sellTaxBps: 300, burnBps: 0, devBuy: "" };
let curve = null;
let busy = false;
let lastResult = "";

const valid = () => f.name.trim().length >= 2 && /^[A-Z0-9]{2,10}$/.test(f.symbol) && !!f.logo && !(f.devBuy && !(Number(f.devBuy) >= 0));
const ready = () => arcLive && getAccount() && valid() && !busy;
const taxOpts = (v) => Array.from({ length: 10 }, (_, i) => (i + 1) * 100).map((b) => `<option value="${b}" ${b === Number(v) ? "selected" : ""}>${b / 100}%</option>`).join("");

function render(result = lastResult) {
  lastResult = result;
  const box = $("#arcLaunch");
  if (!box || box.hidden) return;
  const me = getAccount();
  const creatorPct = (100 - f.burnBps / 100);
  box.innerHTML = `
    <div class="sol-grid">
      <section class="card wiz-body">
        <h2 class="wiz-h wiz-h-logo"><img src="/assets/argus.jpg" alt="" width="26" height="26" />Launch on ArgusPad</h2>
        <p class="muted small">Your coin launches on Argus on Arc: a Uniswap v4 pool paired with USDC, with a buy and sell tax fixed forever. Argus keeps 10% of the tax; the creator share of the rest is split <b>80% to you</b>, 20% to Rigs.</p>
        ${!arcLive ? `<div class="gatebox"><b>Coming soon</b><p>Arc launches open once the Rigs launcher is deployed on Arc.</p></div>` : ""}
        <div class="row2">
          <label class="form-h">Name<input class="filter wide" data-af="name" maxlength="32" placeholder="My coin" value="${esc(f.name)}" /></label>
          <label class="form-h">Ticker<input class="filter wide mono" data-af="symbol" maxlength="10" placeholder="COIN" value="${esc(f.symbol)}" /></label>
        </div>
        <label class="form-h">Description<textarea class="filter wide" data-af="description" maxlength="280" rows="3" placeholder="One or two lines about your coin">${esc(f.description)}</textarea></label>
        <div class="upload-row">
          ${f.logo ? `<img class="sol-logo" src="${esc(f.logo)}" alt="" />` : `<span class="sol-logo empty">?</span>`}
          <label class="btn btn-ghost btn-sm upload-btn">${f.logo ? "Change logo" : "Upload logo"}<input type="file" id="arcFile" accept="image/png,image/jpeg,image/webp,image/gif" hidden /></label>
          <span class="dim small">PNG, JPG, WEBP or GIF, shown on Argus and in wallets.</span>
        </div>
        <div class="row2">
          <label class="form-h">Website <span class="dim">optional</span><input class="filter wide" data-af="website" placeholder="https://" value="${esc(f.website)}" /></label>
          <label class="form-h">X <span class="dim">optional</span><input class="filter wide" data-af="twitter" placeholder="https://x.com/…" value="${esc(f.twitter)}" /></label>
        </div>
        <div class="row3">
          <label class="form-h">Buy tax<select class="filter sel wide" data-af="buyTaxBps">${taxOpts(f.buyTaxBps)}</select></label>
          <label class="form-h">Sell tax<select class="filter sel wide" data-af="sellTaxBps">${taxOpts(f.sellTaxBps)}</select></label>
          <label class="form-h">Buyback &amp; burn<select class="filter sel wide" data-af="burnBps">${[0, 1000, 2500, 5000].map((b) => `<option value="${b}" ${b === f.burnBps ? "selected" : ""}>${b / 100}% of tax</option>`).join("")}</select></label>
        </div>
        <label class="form-h">Dev buy <span class="dim">optional, in USDC</span><input class="filter wide mono" data-af="devBuy" inputmode="decimal" placeholder="0" value="${esc(f.devBuy)}" /></label>
        <p class="dim small">Taxes and the split are fixed at launch and can never be changed.</p>
        <div class="wiz-nav">
          ${me ? `<span class="small dim">Wallet <span class="mono">${short(me)}</span></span>` : `<button class="btn btn-ghost btn-sm" id="arcConnect">Connect wallet</button>`}
          <button class="btn btn-primary btn-sm push" id="arcGo" ${ready() ? "" : "disabled"}>${busy ? "Working…" : "Sign & launch"}</button>
        </div>
        <p class="small muted" id="arcStep"></p>
        ${result}
      </section>
      <aside class="stack wiz-side">
        <div class="card pad">
          <p class="form-h">Where the tax goes</p>
          <div class="h-split sol-split"><span style="width:${0.9 * creatorPct * 0.8}%">you</span><span style="width:${0.9 * creatorPct * 0.2}%" title="Rigs">Rigs</span><span>${f.burnBps ? "burn · " : ""}Argus</span></div>
          <div class="kv"><span>You</span><b>${(0.9 * creatorPct * 0.8).toFixed(1)}%</b></div>
          <div class="kv"><span>Rigs treasury</span><b>${(0.9 * creatorPct * 0.2).toFixed(1)}%</b></div>
          ${f.burnBps ? `<div class="kv"><span>Buyback &amp; burn</span><b>${(0.9 * f.burnBps / 100).toFixed(1)}%</b></div>` : ""}
          <div class="kv"><span>Argus</span><b>10%</b></div>
          <p class="dim small">Paid in USDC. Claim from Earn; anyone can trigger the split.</p>
        </div>
        <div class="card pad">
          <p class="form-h">Curve</p>
          <div class="kv"><span>Starts at</span><b>${curve ? fmtUsdShort(curve.start) : "…"}</b></div>
          <div class="kv"><span>Bonds at</span><b>${curve ? fmtUsdShort(curve.bond) : "…"}</b></div>
          <p class="dim small">Same curve as ArgusPad's current launches. Supply 1,000,000,000.</p>
        </div>
        <div class="card pad">
          <p class="form-h">Good to know</p>
          <ul class="compat">
            <li class="ok">You sign and pay gas in USDC on Arc</li>
            <li class="ok">The split lives in a contract: it cannot be changed later</li>
            <li class="warn">On Argus the coin's creator shows as its Rigs vault, which pays you</li>
          </ul>
        </div>
      </aside>
    </div>`;
}

document.addEventListener("rigs-chain", (e) => { if (e.detail === "arc") { render(); loadCurve(); } });

async function loadCurve() {
  if (curve || !arcLive) return;
  try { curve = await argusCurve(); render(); } catch { /* shown as … */ }
}

document.addEventListener("click", async (e) => {
  if (e.target.closest("#arcConnect")) {
    try { await connect(); } catch (err) { const el = $("#arcStep"); if (el) el.textContent = err.message; }
    return;
  }
  if (!e.target.closest("#arcGo") || !ready()) return;
  busy = true; render();
  try {
    const r = await launchOnArc(f, (msg) => { const el = $("#arcStep"); if (el) el.textContent = msg; });
    busy = false;
    render(`<div class="card done"><b>$${esc(f.symbol)} is live on Arc.</b>
      <p>${r.token ? `<a class="link-accent" href="${ARC.explorer}/address/${r.token}" target="_blank" rel="noopener">Coin on ArcScan ↗</a> · ` : ""}<a class="link-accent" href="${ARC.explorer}/tx/${r.hash}" target="_blank" rel="noopener">Transaction ↗</a> · <a class="link-accent" href="/app#arc">See it on Rigs →</a></p>
      <p class="small dim">Its Argus creator is your vault <span class="mono">${short(r.vault)}</span>: 80% of the creator share to you, 20% to Rigs.</p></div>`);
  } catch (err) {
    console.error(err);
    busy = false; render();
    const el = $("#arcStep"); if (el && err.message) el.textContent = (err.shortMessage || err.message).split("\n")[0];
  }
});

document.addEventListener("input", (e) => {
  const k = e.target.dataset?.af;
  if (!k) return;
  if (k === "symbol") { f.symbol = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""); e.target.value = f.symbol; }
  else if (k === "devBuy") { f.devBuy = e.target.value.replace(/[^0-9.]/g, ""); e.target.value = f.devBuy; }
  else if (/Bps$/.test(k)) { f[k] = Number(e.target.value); return render(); }
  else f[k] = e.target.value;
  const go = $("#arcGo");
  if (go) go.disabled = !ready();
});

document.addEventListener("change", async (e) => {
  if (e.target.id !== "arcFile" || !e.target.files?.[0]) return;
  $("#arcStep").textContent = "Uploading logo…";
  try { f.logo = await uploadLogo(e.target.files[0]); render(); } catch (err) { $("#arcStep").textContent = err.message; }
});

onAccount(() => render());
// The picker may have chosen Arc before this module loaded.
if (!$("#arcLaunch")?.hidden) { render(); loadCurve(); }
