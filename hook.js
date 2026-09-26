import { BLOCKS, blockIcon } from "./hooks-data.js";

const $ = (s) => document.querySelector(s);
const id = new URLSearchParams(location.search).get("id");
const b = BLOCKS.find((x) => x.id === id) || BLOCKS[0];
document.title = `${b.name} · Hookse`;
$("#crumb").textContent = b.name;
$("#title").innerHTML = `
  <div class="tok">${blockIcon(b, 18)}<h1>${b.name}</h1><span class="badge">Native</span></div>
  <p class="lede muted">${b.desc}</p>
  <p class="small dim">By Hookse · part of <span class="mono">HookseHook</span> · config bit <span class="mono">${b.bit}</span></p>`;
$("#buildWith").href = `builder.html?add=${b.id}`;
$("#tradeoff").innerHTML = `<p class="form-h">Tradeoff</p><p class="muted small">${b.tradeoff}</p><p class="dim small">Tests are not an independent audit.</p>`;
$("#stats").innerHTML = `
  <div><small>Parameters</small><b>${b.params.length}</b><small>set at pool open</small></div>
  <div><small>Swap gas</small><b>~${b.gas}K</b><small>estimate</small></div>
  <div><small>Royalty</small><b>0–0.25%</b><small>per block, set by the author</small></div>`;
const summary = b.params.map((p) => `${p.label.toLowerCase()} ${p.value}${p.unit === "%" ? "%" : p.unit ? " " + p.unit : ""}`).join(", ");
$("#behave").textContent = `Defaults: ${summary}. Stacks with the other native blocks; the Builder flags parameter conflicts before you create a pool.`;
$("#mech").innerHTML = b.mechanics.map((m) => `<li>${m}</li>`).join("");
$("#params").innerHTML = b.params.map((p) => `<tr><td>${p.label}</td><td class="mono dim">${p.key}</td><td class="r mono">${p.value}${p.unit === "%" ? "%" : " " + p.unit}</td><td class="r mono dim">${p.min} – ${p.max}</td></tr>`).join("");
$("#evidence").innerHTML = `
  <p>Source: <code>engine/contracts/HookseHook.sol</code>. Tests: <code>engine/test/engine.test.js</code> (run <code>npm test</code> in <code>engine/</code>).</p>
  <p>The hook address must carry the permission bits <code>beforeInitialize</code>, <code>beforeSwap</code>, <code>afterSwap</code> and <code>afterSwapReturnDelta</code>. Check any deployment on the <a href="scan.html">Scan</a> page.</p>
  <p>Not audited. Read the <a href="docs.html#limitations">known limitations</a> before relying on it.</p>`;
$("#others").innerHTML = BLOCKS.filter((x) => x !== b).map((x) => `<a class="card feat" href="hook.html?id=${x.id}">${blockIcon(x, 14)}<div><b>${x.name}</b><small>${x.short}</small></div></a>`).join("");

function show(t) {
  document.querySelectorAll("#dtabs button").forEach((x) => x.classList.toggle("on", x.dataset.t === t));
  document.querySelectorAll("[data-panel]").forEach((p) => (p.hidden = p.dataset.panel !== t));
}
$("#dtabs").addEventListener("click", (e) => { const t = e.target.closest("button")?.dataset.t; if (t) show(t); });
document.querySelector("[data-go]").addEventListener("click", () => show("mechanics"));
