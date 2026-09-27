// Rules page: the five RigsHook blocks, what each does, its knobs and what it costs.
import { BLOCKS, blockIcon } from "./hooks-data.js";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmt = (p) => `${p.value}${p.unit === "%" ? "%" : p.unit ? ` ${p.unit}` : ""}`;

document.getElementById("rules").innerHTML = BLOCKS.map((b) => `
  <article class="rule-card" id="${b.id}">
    <div class="rc-head">${blockIcon(b, 22)}<div><h2>${b.name}</h2><p>${esc(b.short)}</p></div><span class="rc-gas">~${b.gas}K gas / swap</span></div>
    <p class="rc-desc">${esc(b.desc)}</p>
    <div class="rc-params">${b.params.map((p) => `<div><span>${p.label}</span><b>${fmt(p)}</b><small>${p.min}–${p.max}${p.unit === "%" ? "%" : p.unit ? ` ${p.unit}` : ""}</small></div>`).join("")}</div>
    <p class="rc-note"><b>Watch out</b> ${esc(b.tradeoff)}</p>
    <div class="rc-foot"><span class="badge gray">Unaudited</span><a class="link-accent" href="/hook?id=${b.id}">How it works →</a><a class="link-accent" href="/builder?add=${b.id}">Add in builder →</a></div>
  </article>`).join("");
