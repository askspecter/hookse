// Earn page, Arc tab: the creator's Arc coins, what a claim would pay them now, and the claim (release) button.
import { ARC, arcLive, myArcCoins, arcEarnings, releaseArc } from "./arc.js";
import { onAccount, getAccount, toast, friendlyError, fmtUsd, coinAvatar } from "./web3.js";

const rows = document.getElementById("arcRows");
const esc = (x) => String(x ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
let loadedFor = null;

async function load() {
  const me = getAccount();
  if (document.getElementById("p-arc").hidden) return;
  if (!arcLive) { rows.innerHTML = '<tr><td colspan="5" class="dim">Arc launches open once the Rigs launcher is deployed on Arc.</td></tr>'; return; }
  if (!me) { rows.innerHTML = '<tr><td colspan="5" class="dim">Connect your wallet to see coins you launched on Arc.</td></tr>'; return; }
  if (loadedFor === me) return;
  loadedFor = me;
  rows.innerHTML = '<tr><td colspan="5" class="dim">Reading Arc…</td></tr>';
  const coins = await myArcCoins(me);
  if (!coins.length) { rows.innerHTML = '<tr><td colspan="5" class="dim">No Arc coins launched from this wallet. <a class="link-accent" href="/launch#arc">Launch one →</a></td></tr>'; return; }
  const earn = await Promise.all(coins.map((c) => arcEarnings(c)));
  rows.innerHTML = coins.map((c, i) => `<tr>
    <td><div class="tok">${coinAvatar(c.symbol, c.logo)}<span>${esc(c.name || "Unknown")} <span class="dim">$${esc(c.symbol || "")}</span></span></div></td>
    <td><a class="mono" href="${ARC.explorer}/address/${c.vault}" target="_blank" rel="noopener">${short(c.vault)}</a></td>
    <td class="r mono">${fmtUsd(earn[i].claimable, true)}</td>
    <td class="r mono">${fmtUsd(earn[i].paid, true)}</td>
    <td class="r"><button class="btn btn-primary btn-xs" data-release="${c.vault}" ${earn[i].claimable > 0 ? "" : "disabled"}>Claim</button></td>
  </tr>`).join("");
}

rows.addEventListener("click", async (e) => {
  const b = e.target.closest("button[data-release]");
  if (!b) return;
  b.disabled = true; b.textContent = "Confirm…";
  try {
    await releaseArc(b.dataset.release);
    toast("Claimed: 80% sent to you, 20% to Rigs");
    loadedFor = null; load();
  } catch (err) {
    toast(friendlyError(err)); b.disabled = false; b.textContent = "Claim";
  }
});

document.addEventListener("rigs-ptab", (e) => { if (e.detail === "arc") load().catch((err) => { console.error(err); rows.innerHTML = '<tr><td colspan="5" class="dim">Could not reach Arc. Try again later.</td></tr>'; }); });
onAccount(() => { loadedFor = null; load().catch(() => {}); });
