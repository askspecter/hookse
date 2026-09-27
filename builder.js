import { BLOCKS, BASE_FEES, blockIcon, configFor, conflictsFor, startTickFor, defaultValues } from "./hooks-data.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const state = {
  baseFee: 0.3,
  on: new Set(),
  focus: null,
  values: defaultValues(),
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
      <a class="info" href="/hook?id=${b.id}" title="Details">i</a>
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

const conflicts = () => conflictsFor(state.baseFee, state.on, state.values);

function renderDiagram() {
  const slot = (id) => {
    const b = BLOCKS.find((x) => x.id === id);
    const on = state.on.has(id);
    return `<button class="slot${on ? " on" : ""}" data-toggle="${id}">${blockIcon(b, 14)}<span><b>${b.name}</b><small>${b.short}</small></span><em>${on ? "on" : "+ add"}</em></button>`;
  };
  $("#diagram").innerHTML = `
    <div class="dia-head"><span>Swap pipeline</span><span>${state.on.size} of 5 on · runs top to bottom</span></div>
    <div class="dia">
      <div class="dia-io">swap in · ETH → TOKEN</div>
      ${slot("anti-snipe")}
      ${slot("surge-fee")}
      <div class="dia-pool"><div class="dia-pair"><i></i>TOKEN / ETH <span class="dim">Uniswap v4 pool</span></div></div>
      ${slot("auto-burn")}
      ${slot("lp-rewards")}
      ${slot("nth-buy-pot")}
      <div class="dia-io">swap out · tokens to the buyer</div>
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

const configJson = () => configFor(state.baseFee, state.on, state.values);

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
const startTick = startTickFor;

$("#create").addEventListener("click", async (e) => {
  const btn = e.currentTarget; // read before any await: currentTarget is reset after dispatch
  const w = await import("./web3.js");
  const c = conflicts();
  if (c.length) return w.toast(c[0]);
  if (!w.v4live) {
    w.toast("The v4 launcher is not deployed yet. Your config is shown below.");
    document.querySelector("details.cfg").open = true;
    return;
  }
  const name = $("#tName").value.trim();
  const symbol = $("#tSym").value.trim().toUpperCase();
  const supply = Number($("#tSupply").value);
  const mcap = Number($("#tMcap").value);
  if (!name || !/^[A-Z0-9]{1,10}$/.test(symbol)) return w.toast("Enter a token name and a 1–10 character ticker");
  if (!(supply >= 1 && supply <= 1e15) || !(mcap > 0)) return w.toast("Check supply and market cap");
  const tick = startTick(supply, mcap);
  if (tick <= -887220 || tick > 887220) return w.toast("That price is out of range; change supply or market cap");
  const raw = configJson();
  const cfg = { ...raw, snipeMaxBuy: BigInt(raw.snipeMaxBuy), surgeRefSize: BigInt(raw.surgeRefSize), potMinBuy: BigInt(raw.potMinBuy) };
  btn.disabled = true;
  btn.textContent = "Confirm in wallet…";
  try {
    const rc = await w.write({
      address: w.CONFIG.rigsLauncher, abi: w.ABI.rigsLauncher, functionName: "launch",
      args: [name, symbol, BigInt(Math.floor(supply)) * 10n ** 18n, tick, cfg],
    });
    const n = await w.client.readContract({ address: w.CONFIG.rigsLauncher, abi: w.ABI.rigsLauncher, functionName: "tokenCount" });
    const token = await w.client.readContract({ address: w.CONFIG.rigsLauncher, abi: w.ABI.rigsLauncher, functionName: "tokens", args: [n - 1n] });
    $("#createNote").innerHTML = `Pool opened for <b>$${esc(symbol)}</b>: token ${w.addrLink(token)} · <a class="link-accent" href="${w.CONFIG.explorer}/tx/${rc.transactionHash}" target="_blank" rel="noopener">transaction ↗</a> · <a class="link-accent" href="/app#pools">see it in Coins</a>`;
    w.toast(`$${symbol} pool created`);
  } catch (err) {
    console.error(err);
    w.toast(w.friendlyError(err));
  } finally {
    btn.disabled = false;
    btn.textContent = "Create pool";
  }
});
render();
