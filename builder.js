import { BLOCKS, BASE_FEES, blockIcon } from "./hooks-data.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const state = {
  baseFee: 0.3,
  on: new Set(),
  focus: null,
  values: Object.fromEntries(BLOCKS.map((b) => [b.id, Object.fromEntries(b.params.map((p) => [p.key, p.value]))])),
};
const add = new URLSearchParams(location.search).get("add");
if (BLOCKS.some((b) => b.id === add)) { state.on.add(add); state.focus = add; }

const fmt = (p, v) => `${v}${p.unit === "%" ? "%" : p.unit ? " " + p.unit : ""}`;

function renderTiers() {
  $("#tiers").innerHTML = BASE_FEES.map((t) => `<button class="tier${state.baseFee === t.fee ? " on" : ""}" data-fee="${t.fee}"><b class="mono">${t.fee.toFixed(2)}%</b><small>${t.label}</small></button>`).join("");
  $("#customFee").value = state.baseFee;
}

function renderRules() {
  $("#ruleList").innerHTML = BLOCKS.map((b) => `
    <div class="rule-row${state.focus === b.id ? " focus" : ""}" data-id="${b.id}">
      ${blockIcon(b)}<div><b>${b.name}</b><small>${b.short}</small></div>
      <a class="info" href="hook.html?id=${b.id}" title="Details">i</a>
      <button class="plus${state.on.has(b.id) ? " on" : ""}" data-toggle="${b.id}" aria-label="${state.on.has(b.id) ? "Remove" : "Add"} ${b.name}">${state.on.has(b.id) ? "✓" : "+"}</button>
    </div>`).join("");
}

function renderTune() {
  const b = BLOCKS.find((x) => x.id === state.focus);
  if (!b) {
    $("#tune").innerHTML = `<p class="form-h">Tune</p><p class="muted small">Add a rule and click it to tune its parameters. With no rules, the pool only charges the ${state.baseFee}% base fee.</p>`;
    return;
  }
  const v = state.values[b.id];
  $("#tune").innerHTML = `<div class="row-between"><div class="tok">${blockIcon(b)}<b>${b.name}</b></div>${state.on.has(b.id) ? '<span class="badge green">Active</span>' : '<span class="badge gray">Not added</span>'}</div>
    <div class="tune-grid">${b.params.map((p) => `<label>${p.label}<span class="inp"><input type="number" data-param="${p.key}" min="${p.min}" max="${p.max}" step="${p.step}" value="${v[p.key]}" /><em>${p.unit}</em></span></label>`).join("")}</div>`;
}

function conflicts() {
  const out = [];
  const on = (id) => state.on.has(id);
  const v = state.values;
  if (on("anti-snipe") && on("nth-buy-pot") && v["anti-snipe"].snipeMaxBuy < v["nth-buy-pot"].potMinBuy) {
    out.push(`Anti-Snipe caps buys at ${v["anti-snipe"].snipeMaxBuy} ETH, below the pot's ${v["nth-buy-pot"].potMinBuy} ETH minimum: no buy can count for the pot during the snipe window.`);
  }
  if (on("surge-fee") && v["surge-fee"].surgeMaxFee <= state.baseFee) out.push("Surge Fee ceiling is not above the base fee, so it never changes anything.");
  const takes = ["auto-burn", "lp-rewards", "nth-buy-pot"].filter(on).reduce((s, id) => s + Number(Object.values(v[id]).find((_, i) => i === 0)), 0);
  if (takes + 0.25 * 5 > 10) out.push(`Takes add up to ${takes.toFixed(2)}%. Together with the maximum royalties that exceeds the 10% cap, so the launch would revert.`);
  return out;
}

function renderDiagram() {
  const slot = (id, cls) => {
    const b = BLOCKS.find((x) => x.id === id);
    const on = state.on.has(id);
    return `<button class="slot ${cls}${on ? " on" : ""}" data-toggle="${id}" style="--c:${b.color}">${blockIcon(b, 14)}<b>${on ? "" : "+ "}${b.name}</b><small>${b.short.toLowerCase()}</small></button>`;
  };
  $("#diagram").innerHTML = `
    <div class="dia-head"><span>Your programmable market</span><span>Every block has its own slot</span></div>
    <div class="dia">
      ${slot("anti-snipe", "s-top")}
      ${slot("surge-fee", "s-left")}
      <div class="dia-pool"><span class="dia-buy">BUY ↓</span><div class="dia-pair"><i></i>TOKEN / ETH <span class="dim">UNISWAP V4</span></div></div>
      ${slot("nth-buy-pot", "s-right")}
      ${slot("lp-rewards", "s-bl")}
      ${slot("auto-burn", "s-br")}
    </div>`;
  const steps = ["Swap enters the PoolManager"];
  if (state.on.has("anti-snipe")) steps.push("beforeSwap: add the decaying anti-snipe fee");
  if (state.on.has("surge-fee")) steps.push("beforeSwap: size the LP fee from trade size");
  steps.push(`Swap executes at the resulting LP fee (base ${state.baseFee}%)`);
  if (state.on.has("anti-snipe")) steps.push("afterSwap: revert if the buy exceeds the cap");
  if (state.on.has("auto-burn")) steps.push("afterSwap: burn a share of the token output");
  if (state.on.has("lp-rewards")) steps.push("afterSwap: donate a share to in-range LPs");
  if (state.on.has("nth-buy-pot")) steps.push("afterSwap: fund the pot, count the buy, pay every Nth");
  steps.push("Swapper settles with the pool");
  $("#flow").innerHTML = steps.map((s) => `<li>${s}</li>`).join("");
}

function configJson() {
  const v = state.values;
  const pips = (pct) => Math.round(pct * 10000);
  const bps = (pct) => Math.round(pct * 100);
  const wei = (eth) => BigInt(Math.round(eth * 1e6)) * 10n ** 12n;
  let blocks = 0;
  BLOCKS.forEach((b) => { if (state.on.has(b.id)) blocks |= b.bit; });
  return {
    blocks, baseFee: pips(state.baseFee),
    snipeBlocks: v["anti-snipe"].snipeBlocks, snipeFee: pips(v["anti-snipe"].snipeFee), snipeMaxBuy: wei(v["anti-snipe"].snipeMaxBuy).toString(),
    surgeMaxFee: pips(v["surge-fee"].surgeMaxFee), surgeRefSize: wei(v["surge-fee"].surgeRefSize).toString(),
    burnBps: bps(v["auto-burn"].burnBps), lpBps: bps(v["lp-rewards"].lpBps), potBps: bps(v["nth-buy-pot"].potBps),
    potEvery: v["nth-buy-pot"].potEvery, potMinBuy: wei(v["nth-buy-pot"].potMinBuy).toString(),
  };
}

function render() {
  renderTiers(); renderRules(); renderTune(); renderDiagram();
  const active = BLOCKS.filter((b) => state.on.has(b.id));
  $("#activeCount").textContent = `${active.length} active rule${active.length === 1 ? "" : "s"}`;
  $("#blockCount").textContent = `${active.length} block${active.length === 1 ? "" : "s"}`;
  $("#behavior").innerHTML = active.length
    ? active.map((b) => `<b>${b.name}</b>: ${b.params.map((p) => `${p.label.toLowerCase()} ${fmt(p, state.values[b.id][p.key])}`).join(", ")}`).join("<br>") + `<br>Base LP fee ${state.baseFee}%.`
    : `No rules yet: this market charges the ${state.baseFee}% base fee and nothing else.`;
  const c = conflicts();
  $("#limits").innerHTML = [...c.map((x) => `<li class="warn">${esc(x)}</li>`),
    "<li>Rules and parameters are frozen when the pool opens. Nobody can change them later.</li>",
    "<li>Pools pair native ETH with the token and use the v4 dynamic-fee flag.</li>",
    "<li>LP fee is capped at 10%; all takes plus royalties are capped at 10% of the swap.</li>",
    "<li>Takes are charged on the side of the swap the trader did not specify.</li>"].join("");
  $("#cfg").textContent = JSON.stringify(configJson(), null, 2);
}

$("#tiers").addEventListener("click", (e) => { const t = e.target.closest("[data-fee]"); if (t) { state.baseFee = Number(t.dataset.fee); render(); } });
$("#customFee").addEventListener("change", (e) => { state.baseFee = Math.min(10, Math.max(0, Number(e.target.value) || 0)); render(); });
document.addEventListener("click", (e) => {
  const tog = e.target.closest("[data-toggle]");
  if (tog) {
    const id = tog.dataset.toggle;
    state.on.has(id) ? state.on.delete(id) : state.on.add(id);
    state.focus = id;
    return render();
  }
  const row = e.target.closest(".rule-row");
  if (row && !e.target.closest(".info")) { state.focus = row.dataset.id; render(); }
});
$("#tune").addEventListener("change", (e) => {
  const k = e.target.dataset.param;
  if (!k) return;
  const b = BLOCKS.find((x) => x.id === state.focus);
  const p = b.params.find((x) => x.key === k);
  state.values[b.id][k] = Math.min(p.max, Math.max(p.min, Number(e.target.value) || 0));
  render();
});
$("#vtabs").addEventListener("click", (e) => {
  const v = e.target.closest("button")?.dataset.v;
  if (!v) return;
  document.querySelectorAll("#vtabs button").forEach((x) => x.classList.toggle("on", x.dataset.v === v));
  $("#diagram").hidden = v !== "blocks";
  $("#flow").hidden = v !== "flow";
});
$("#create").addEventListener("click", async () => {
  const { toast } = await import("./web3.js");
  const c = conflicts();
  if (c.length) return toast(c[0]);
  toast("Hookse v4 pools open once the v4 launcher is deployed. Your config is shown below.");
  document.querySelector("details.cfg").open = true;
});
render();
