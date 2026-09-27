import { FLAGS } from "./hooks-data.js";

const $ = (s) => document.querySelector(s);
const RIGS_FLAGS = (1 << 13) | (1 << 7) | (1 << 6) | (1 << 2);

function decode(addr) {
  const bits = Number(BigInt(addr) & 0x3fffn);
  const rows = FLAGS.map((name, i) => ({ name, bit: 13 - i, on: (bits >> (13 - i)) & 1 }));
  const warn = [];
  const on = (n) => rows.find((r) => r.name === n).on;
  if (on("beforeSwapReturnDelta") && !on("beforeSwap")) warn.push("beforeSwapReturnDelta without beforeSwap: pools with this hook cannot initialize.");
  if (on("afterSwapReturnDelta") && !on("afterSwap")) warn.push("afterSwapReturnDelta without afterSwap: pools with this hook cannot initialize.");
  if (on("beforeSwapReturnDelta") || on("afterSwapReturnDelta")) warn.push("Can change swap amounts (returns deltas). Read the source before trading through it.");
  if (on("beforeRemoveLiquidity")) warn.push("Runs code when liquidity is removed; it could block withdrawals.");
  return { bits, rows, warn, rigs: bits === RIGS_FLAGS };
}

async function scan(addr) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) {
    $("#scanOut").innerHTML = `<div class="notice">That is not an address.</div>`;
    return;
  }
  const d = decode(addr);
  history.replaceState(null, "", `?address=${addr}`);
  $("#scanOut").innerHTML = `
    <div class="card kv-grid sec-gap">
      <div><small>Permission bits</small><b>0x${d.bits.toString(16).padStart(4, "0")}</b><small>last 14 bits of the address</small></div>
      <div><small>Callbacks on</small><b>${d.rows.filter((r) => r.on).length} / 14</b><small>decoded below</small></div>
      <div><small>Shape</small><b>${d.rigs ? "Rigs" : "Custom"}</b><small>${d.rigs ? "matches RigsHook permissions" : "not the RigsHook permission set"}</small></div>
    </div>
    ${d.warn.map((w) => `<div class="notice sec-gap-s">${w}</div>`).join("")}
    <div class="card table-card sec-gap"><table class="table"><thead><tr><th>Callback</th><th class="r">Bit</th><th class="r">Enabled</th></tr></thead>
    <tbody>${d.rows.map((r) => `<tr><td class="mono">${r.name}</td><td class="r mono dim">${r.bit}</td><td class="r">${r.on ? '<span class="badge green">on</span>' : '<span class="dim">off</span>'}</td></tr>`).join("")}</tbody></table></div>
    <p class="muted small sec-gap-s" id="codeInfo">Checking deployed code…</p>`;
  try {
    const { client, CONFIG } = await import("./web3.js");
    const code = await client.getCode({ address: addr });
    $("#codeInfo").innerHTML = code && code !== "0x"
      ? `Contract found on ${CONFIG.chainName} (${(code.length - 2) / 2} bytes). <a class="link-accent" href="${CONFIG.explorer}/address/${addr}" target="_blank" rel="noopener">Open in explorer ↗</a>`
      : `No contract at this address on ${CONFIG.chainName}. The bits above only describe what a hook here would be allowed to do.`;
  } catch {
    $("#codeInfo").textContent = "Could not reach the chain to check the deployed code.";
  }
}

$("#scanForm").addEventListener("submit", (e) => { e.preventDefault(); scan($("#addr").value.trim()); });
const q = new URLSearchParams(location.search).get("address");
if (q) { $("#addr").value = q; scan(q); }
