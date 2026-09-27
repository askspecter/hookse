import { BLOCKS, blockIcon } from "./hooks-data.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

$("#featured").innerHTML = BLOCKS.map((b) => `
  <a class="card feat" href="hook.html?id=${b.id}">${blockIcon(b, 14)}<div><b>${b.name}</b><small>${b.short}</small></div></a>`).join("");

let filter = "all";
function render() {
  const q = $("#hsearch").value.trim().toLowerCase();
  const list = BLOCKS
    .filter(() => filter === "all" || filter === "native")
    .filter((b) => !q || `${b.name} ${b.short}`.toLowerCase().includes(q))
    .sort((a, b) => ($("#hsort").value === "name" ? a.name.localeCompare(b.name) : a.gas - b.gas));
  $("#hcount").textContent = `${list.length} listing${list.length === 1 ? "" : "s"}`;
  $("#listing").innerHTML = list.length ? list.map((b) => `
    <div class="card listing">
      <div class="row-between"><div class="tok"><b>${b.name}</b>${blockIcon(b, 12)}<span class="dim small">native block</span></div><span class="badge">Block</span></div>
      <p class="muted small">${esc(b.desc)}</p>
      <p class="small"><span class="dim">Gas</span> ~${b.gas}K · <span class="dim">Review</span> Unaudited</p>
      <div class="row-between listing-foot"><span class="small">by <b>Rigs</b></span>
        <span class="btn-row"><a class="link-pink small" href="hook.html?id=${b.id}">Inspect</a><a class="link-pink small" href="builder.html?add=${b.id}">Build with</a><a class="link-pink small" href="docs.html#blocks">Docs</a></span></div>
    </div>`).join("")
    : `<div class="empty"><b>${filter === "community" ? "No community hooks yet" : filter === "roots" ? "One root" : "Nothing matches"}</b><p>${filter === "roots" ? "Every Rigs pool uses the single RigsHook root; blocks are switched on per pool." : filter === "community" ? "Submitted hooks appear here after review." : "Try another search."}</p></div>`;
}
$("#htabs").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  filter = b.dataset.f;
  document.querySelectorAll("#htabs button").forEach((x) => x.classList.toggle("active", x === b));
  render();
});
$("#hsearch").addEventListener("input", render);
$("#hsort").addEventListener("change", render);
render();
