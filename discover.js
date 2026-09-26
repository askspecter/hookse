import { BLOCKS, blockIcon } from "./hooks-data.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const HEADS = {
  launches: ["#", "Coin", "Creator", "Claimed by creator", "Launched", ""],
  pools: ["Pool", "Hook", "Rules", "Fee", ""],
  hooks: ["Block", "What it does", "Gas / swap", "Status", ""],
};
let tab = "launches";
let launches = [];
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
      rows = [`<tr><td colspan="6" class="dim">Launches appear here once the Hookse Pons launcher is deployed. <a href="launch.html">Launch page →</a></td></tr>`];
    } else {
      const list = launches.filter((l) => !q || `${l.name} ${l.symbol} ${l.token}`.toLowerCase().includes(q));
      rows = list.slice(0, shown).map((l) => `<tr>
        <td class="dim mono">${l.id}</td>
        <td><div class="tok"><div class="av">${esc((l.symbol || "?").slice(0, 2))}</div><span>${esc(l.name || "Unknown")} <span class="dim">$${esc(l.symbol || "")}</span></span></div></td>
        <td>${web3.addrLink(l.creator || l.creatorAtLaunch)}</td>
        <td class="r mono">${web3.eth(l.totalToCreator, 5)} ETH</td>
        <td class="r dim">${ago(l.launchedAt)}</td>
        <td class="r nowrap"><a class="link-pink" href="${web3.CONFIG.ponsCoinUrl}${l.token}" target="_blank" rel="noopener">Trade ↗</a> · <a class="link-pink" href="portfolio.html?token=${l.token}">Fees</a></td></tr>`);
      if (!rows.length) rows = [`<tr><td colspan="6" class="dim">${launches.length ? "Nothing matches." : "No launches yet. <a href=\"launch.html\">Be the first →</a>"}</td></tr>`];
      $("#more").hidden = list.length <= shown;
    }
  } else if (tab === "pools") {
    rows = [`<tr><td colspan="5" class="dim">Hookse v4 pools (direct launches with rule blocks) appear once the v4 launcher is deployed. Pons graduations trade on Pons' own locked v4 pools.</td></tr>`];
  } else {
    rows = BLOCKS.filter((b) => !q || b.name.toLowerCase().includes(q)).map((b) => `<tr>
      <td><div class="tok">${blockIcon(b)}<span>${b.name}</span></div></td><td class="dim">${b.short}</td>
      <td class="r mono">~${b.gas}K</td><td class="r"><span class="badge gray">Unaudited</span></td>
      <td class="r"><a class="link-pink" href="hook.html?id=${b.id}">Inspect</a></td></tr>`);
  }
  if (tab !== "launches") $("#more").hidden = true;
  $("#tbody").innerHTML = rows.join("");
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
    }
    $("#updated").innerHTML = web3.live ? '<i class="dot-green"></i>Updated' : "Launcher not deployed";
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
render();
load();
