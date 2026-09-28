// Launch page: the chain picker and the Solana (pump.fun) form. The Robinhood wizard (launch.js) is untouched.
import { SOL, connectSol, getSolAccount, onSolAccount, launchOnPump, loadSolCoins } from "./sol.js";
import { uploadLogo } from "./upload.js";

const $ = (s) => document.querySelector(s);
const esc = (x) => String(x ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const short = (a) => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : "—");
const f = { name: "", symbol: "", description: "", logo: "" };
let status = { enabled: false, treasury: null };
let busy = false;

function pick(chain) {
  document.querySelectorAll("#chainPick button").forEach((b) => b.classList.toggle("on", b.dataset.chain === chain));
  $("#evmLaunch").hidden = chain !== "robinhood";
  $("#solLaunch").hidden = chain !== "solana";
  $("#arcLaunch").hidden = chain !== "arc";
  $("#gachaLaunch").hidden = chain !== "gacha";
  $("#netState").hidden = chain !== "robinhood";
  try { localStorage.setItem("rigs-launch-chain", chain); } catch { /* storage blocked */ }
  if (chain === "solana") render();
  document.dispatchEvent(new CustomEvent("rigs-chain", { detail: chain }));
}

function render(result) {
  const me = getSolAccount();
  const ready = status.enabled && me && f.name && /^[A-Z0-9]{1,10}$/.test(f.symbol) && f.logo && !busy;
  $("#solLaunch").innerHTML = `
    <div class="sol-grid">
      <section class="card wiz-body">
        <h2 class="wiz-h wiz-h-logo"><img src="/assets/pumpfun.jpg" alt="" width="26" height="26" />Launch on pump.fun</h2>
        <p class="muted small">Your coin launches on pump.fun's bonding curve on Solana. Its creator fees are split by pump.fun's own fee sharing: <b>80% to you</b>, 20% to Rigs.</p>
        ${!status.enabled ? `<div class="gatebox"><b>Coming soon</b><p>Solana launches open once the Rigs treasury wallet is set.</p></div>` : ""}
        <div class="row2">
          <label class="form-h">Name<input class="filter wide" data-sf="name" maxlength="32" placeholder="My coin" value="${esc(f.name)}" /></label>
          <label class="form-h">Ticker<input class="filter wide mono" data-sf="symbol" maxlength="10" placeholder="COIN" value="${esc(f.symbol)}" /></label>
        </div>
        <label class="form-h">Description<textarea class="filter wide" data-sf="description" maxlength="300" rows="3" placeholder="One or two lines about your coin">${esc(f.description)}</textarea></label>
        <div class="upload-row">
          ${f.logo ? `<img class="sol-logo" src="${esc(f.logo)}" alt="" />` : `<span class="sol-logo empty">?</span>`}
          <label class="btn btn-ghost btn-sm upload-btn">${f.logo ? "Change logo" : "Upload logo"}<input type="file" id="solFile" accept="image/png,image/jpeg,image/webp,image/gif" hidden /></label>
          <span class="dim small">PNG, JPG, WEBP or GIF, shown on pump.fun and in wallets.</span>
        </div>
        <div class="wiz-nav">
          ${me ? `<span class="small dim">Wallet <span class="mono">${short(me)}</span></span>` : `<button class="btn btn-ghost btn-sm" id="solConnect">Connect Phantom / Solflare</button>`}
          <button class="btn btn-primary btn-sm push" id="solGo" ${ready ? "" : "disabled"}>${busy ? "Working…" : "Sign & launch"}</button>
        </div>
        <p class="small muted" id="solStep"></p>
        ${result || ""}
      </section>
      <aside class="stack wiz-side">
        <div class="card pad">
          <p class="form-h">Creator fees</p>
          <div class="h-split sol-split"><span style="width:80%">80% you</span><span>20%</span></div>
          <div class="kv"><span>Rigs share goes to</span><b class="mono">${status.treasury ? short(status.treasury) : "not set"}</b></div>
          <p class="dim small">Fees accrue on pump.fun. Anyone can distribute them to both wallets; you claim on pump.fun.</p>
        </div>
        <div class="card pad">
          <p class="form-h">Good to know</p>
          <ul class="compat">
            <li class="ok">You sign every transaction and pay the network fee</li>
            <li class="ok">The coin trades on pump.fun and graduates on its own</li>
            <li class="warn">pump.fun lets the creator change the fee split later. Coins that remove the Rigs share are dropped from Rigs.</li>
          </ul>
        </div>
      </aside>
    </div>`;
}

document.addEventListener("click", async (e) => {
  const chainBtn = e.target.closest("#chainPick button");
  if (chainBtn) return pick(chainBtn.dataset.chain);
  if (e.target.closest("#solConnect")) {
    try { await connectSol(); } catch (err) { $("#solStep").textContent = err.message; }
    return;
  }
  if (e.target.closest("#solGo")) {
    busy = true; render();
    try {
      const r = await launchOnPump(f, (msg) => { const el = $("#solStep"); if (el) el.textContent = msg; });
      const ok = r.split?.rigsBps >= 2000;
      busy = false;
      render(`<div class="card done"><b>$${esc(f.symbol)} is live on pump.fun.</b>
        <p><a class="link-accent" href="${SOL.pumpCoinUrl}${r.mint}" target="_blank" rel="noopener">Open on pump.fun ↗</a> · <a class="link-accent" href="${SOL.explorer}/token/${r.mint}" target="_blank" rel="noopener">Solscan ↗</a> · <a class="link-accent" href="/app#solana">See it on Rigs →</a></p>
        <p class="small ${ok ? "dim" : "warn-t"}">${ok ? "Fee sharing is set: 80% to you, 20% to Rigs." : "The coin is live, but the fee split was not confirmed. Check it on pump.fun."}</p></div>`);
    } catch (err) {
      busy = false; render();
      const el = $("#solStep"); if (el && err.message) el.textContent = err.message;
    }
  }
});

document.addEventListener("input", (e) => {
  const k = e.target.dataset?.sf;
  if (!k) return;
  f[k] = k === "symbol" ? e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") : e.target.value;
  if (k === "symbol") e.target.value = f.symbol;
  const go = $("#solGo");
  if (go) go.disabled = !(status.enabled && getSolAccount() && f.name && f.symbol && f.logo && !busy);
});

document.addEventListener("change", async (e) => {
  if (e.target.id !== "solFile" || !e.target.files?.[0]) return;
  $("#solStep").textContent = "Uploading logo…";
  try { f.logo = await uploadLogo(e.target.files[0]); render(); } catch (err) { $("#solStep").textContent = err.message; }
});

onSolAccount(() => { if (!$("#solLaunch").hidden) render(); });
loadSolCoins().then((s) => { status = { enabled: !!s.enabled, treasury: s.treasury || null }; if (!$("#solLaunch").hidden) render(); });
let saved = null;
try { saved = localStorage.getItem("rigs-launch-chain"); } catch { /* storage blocked */ }
const CHAINS = ["solana", "arc", "gacha"];
if (CHAINS.includes(location.hash.slice(1))) pick(location.hash.slice(1));
else if (CHAINS.includes(saved)) pick(saved);
