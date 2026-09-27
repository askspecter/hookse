// Coin page: /coin?token=0x…  Works for Pons launches (trade on the Pons curve) and Rigs v4
// pools (trade through RigsRouter). Shows a creator-only claim panel and the viewer's pot winnings.
import {
  CONFIG, ABI, $, esc, toast, friendlyError, client, live, v4live, routerLive, write, getAccount, onAccount,
  isAddress, getAddress, zeroAddress, eth, addrLink, tokenInfo, ensureAllowance, loadLaunch, fmtPrice, CHAIN_LOGO, loadMeta, saveMeta,
} from "./web3.js";
import { uploadLogo } from "./upload.js";
import { BLOCKS, blockIcon } from "./hooks-data.js";
import { formatUnits, parseUnits, formatEther, parseEther, keccak256, encodeAbiParameters, encodePacked, pad, toHex } from "https://cdn.jsdelivr.net/npm/viem@2.21.0/+esm";

const param = new URLSearchParams(location.search).get("token");
const token = isAddress(param || "") ? getAddress(param) : null;
// A funded placeholder for read-only quotes (balance injected with a state override).
const QUOTER = "0x000000000000000000000000000000000000c0de";
const RICH = [{ address: QUOTER, balance: parseEther("1000000") }];

const c = { kind: null, info: null, supply: 0n, priceEth: null, creator: null };
const t = { side: "buy", amount: "", slippage: 2, quote: null, quoting: false, allowanceOk: true };

// ---------------------------------------------------------------- resolve the coin

async function resolve() {
  if (!token) return fail("No coin selected. Open one from Discover.");
  c.info = await tokenInfo(token);
  if (!c.info.symbol) return fail("That address is not a token on this chain.");
  c.supply = await client.readContract({ address: token, abi: ABI.erc20Full, functionName: "totalSupply" }).catch(() => 0n);

  if (live) {
    const id = await client.readContract({ address: CONFIG.ponsLauncher, abi: ABI.launcher, functionName: "idOf", args: [token] }).catch(() => null);
    if (id != null) {
      const l = await loadLaunch(id).catch(() => null);
      if (l && getAddress(l.token) === token) { c.kind = "pons"; c.launch = l; c.creator = l.creator; }
    }
  }
  if (!c.kind && v4live) {
    const k = await client.readContract({ address: CONFIG.rigsLauncher, abi: ABI.rigsLauncher, functionName: "keyOf", args: [token] }).catch(() => null);
    if (k && getAddress(k.currency1) === token) {
      c.kind = "v4";
      c.key = { currency0: k.currency0, currency1: k.currency1, fee: k.fee, tickSpacing: k.tickSpacing, hooks: k.hooks };
      c.poolId = keccak256(encodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }], [k.currency0, k.currency1, k.fee, k.tickSpacing, k.hooks]));
      const [l, [cfg, launchBlock, buyCount]] = await Promise.all([
        client.readContract({ address: CONFIG.rigsLauncher, abi: ABI.rigsLauncher, functionName: "launches", args: [c.poolId] }),
        client.readContract({ address: CONFIG.rigsHook, abi: ABI.rigsHook, functionName: "getPool", args: [c.poolId] }),
      ]);
      c.creator = l[1];
      c.existing = l[5];
      c.cfg = cfg;
      c.launchBlock = Number(launchBlock);
      c.buyCount = Number(buyCount);
    }
  }
  if (!c.kind) return fail(`$${esc(c.info.symbol)} was not launched through Rigs.`);
  c.meta = (await loadMeta([token]).catch(() => ({})))[token.toLowerCase()] || {};
  await refreshPrice();
  renderAll();
  loadHistory();
}

function fail(msg) {
  $("#coinHead").innerHTML = `<div class="empty"><b>${msg}</b><p><a class="link-pink" href="/app#tokens">Browse coins →</a></p></div>`;
  ["#stats", "#trade", "#ctabs", "#pricePanel"].forEach((s) => ($(s).hidden = true));
}

// ---------------------------------------------------------------- price

/** ETH per whole token from a v4 sqrtPriceX96 (currency0 = ETH, currency1 = token). */
function priceFromSqrt(sqrtP) {
  const p = (Number(sqrtP) / 2 ** 96) ** 2; // token raw units per wei
  return p > 0 ? 10 ** (c.info.decimals - 18) / p : null;
}

async function refreshPrice() {
  if (c.kind === "v4") {
    const slot = keccak256(encodePacked(["bytes32", "bytes32"], [c.poolId, pad(toHex(6), { size: 32 })]));
    const raw = await client.readContract({ address: CONFIG.poolManager, abi: ABI.poolManager, functionName: "extsload", args: [slot] });
    c.sqrtP = BigInt(raw) & ((1n << 160n) - 1n);
    c.priceEth = priceFromSqrt(c.sqrtP);
  } else {
    // Pons: price implied by a small simulated buy (includes curve fees).
    const probe = parseEther("0.001");
    let out = null;
    try {
      out = await ponsQuoteBuy(probe);
    } catch (err) {
      // Only a revert from the curve itself means it no longer sells (graduated); RPC errors do not.
      c.graduated = !!err?.walk?.((e) => e?.name === "ContractFunctionRevertedError");
    }
    c.priceEth = out ? Number(formatEther(probe)) / Number(formatUnits(out, c.info.decimals)) : null;
  }
  $("#asOf").textContent = new Date().toUTCString().slice(5, 22) + " UTC";
}

// ---------------------------------------------------------------- quotes

async function simulate(req, from) {
  const opts = { ...req, account: from || QUOTER };
  if (!from) opts.stateOverride = RICH;
  const { result } = await client.simulateContract(opts);
  return result;
}
const ponsQuoteBuy = (wei) => simulate({ address: c.launch.curve, abi: ABI.ponsCurve, functionName: "buy", args: [wei, 0n, getAccount() || QUOTER], value: wei }, getAccount() && t.balanceEth > wei ? getAccount() : null);

async function quote() {
  t.quote = null;
  const amt = t.amount;
  if (!amt || !(Number(amt) > 0)) return;
  t.quoting = true;
  renderTrade();
  try {
    if (t.side === "buy") {
      const wei = parseEther(String(amt));
      t.quote = c.kind === "pons" ? await ponsQuoteBuy(wei)
        : await simulate({ address: CONFIG.rigsRouter, abi: ABI.rigsRouter, functionName: "buy", args: [c.key, 0n, getAccount() || QUOTER], value: wei }, null);
    } else {
      if (!getAccount()) throw new Error("Connect a wallet to quote a sell");
      const units = parseUnits(String(amt), c.info.decimals);
      const spender = c.kind === "pons" ? c.launch.curve : CONFIG.rigsRouter;
      const allowed = await client.readContract({ address: token, abi: ABI.erc20Full, functionName: "allowance", args: [getAccount(), spender] });
      t.allowanceOk = allowed >= units;
      if (!t.allowanceOk) return;
      t.quote = c.kind === "pons"
        ? await simulate({ address: c.launch.curve, abi: ABI.ponsCurve, functionName: "sell", args: [units, 0n, getAccount()] }, getAccount())
        : await simulate({ address: CONFIG.rigsRouter, abi: ABI.rigsRouter, functionName: "sell", args: [c.key, units, 0n, getAccount()] }, getAccount());
    }
  } catch (err) {
    t.quoteError = friendlyError(err);
  } finally {
    t.quoting = false;
    renderTrade();
  }
}

// ---------------------------------------------------------------- render

const fmtEth = (n) => fmtPrice(n);
const takesOf = () => {
  if (c.kind !== "v4") return null;
  const on = (bit) => (Number(c.cfg.blocks) & bit) !== 0;
  return {
    base: Number(c.cfg.baseFee) / 10000,
    burn: on(4) ? Number(c.cfg.burnBps) / 100 : 0,
    lp: on(8) ? Number(c.cfg.lpBps) / 100 : 0,
    pot: on(16) ? Number(c.cfg.potBps) / 100 : 0,
  };
};

function renderHead() {
  const sym = esc(c.info.symbol);
  const logo = /^https:\/\//.test(c.meta?.logo || "") ? `<img src="${esc(c.meta.logo)}" alt="" onerror="this.replaceWith('${sym.slice(0, 2)}')" />` : sym.slice(0, 2);
  $("#coinHead").innerHTML = `
    <div class="pair-logos"><span class="eth-logo"><img src="${CHAIN_LOGO}" alt="Robinhood Chain" /></span><span class="coin-logo">${logo}</span></div>
    <h1>ETH <span class="dim">/</span> ${sym}</h1>
    <div class="coin-meta"><span class="pill pill-live"><img class="chain-ic" src="${CHAIN_LOGO}" alt="" />${esc(CONFIG.chainName)}</span>
      <span class="mono dim">${token.slice(0, 10)}…${token.slice(-6)}</span><button class="copy" data-copy="${token}" title="Copy address">⧉</button></div>
    <p class="muted small">${esc(c.info.name)} · ${c.kind === "pons" ? (c.graduated ? "Pons V2 · graduated" : "Pons V2 bonding curve") : c.existing ? "Rigs v4 pool · existing token" : "Rigs v4 pool"}
      · creator ${addrLink(c.creator)}</p>
    ${c.meta?.description ? `<p class="coin-desc">${esc(c.meta.description)}</p>` : ""}`;
  $("#extLink").href = `${CONFIG.explorer}/token/${token}`;
}

function renderStats() {
  const supply = Number(formatUnits(c.supply, c.info.decimals));
  const mcap = c.priceEth != null ? c.priceEth * supply : null;
  const tk = takesOf();
  const cells = [
    ["Price", `${fmtEth(c.priceEth)} ETH`, `1 ${esc(c.info.symbol)}${c.kind === "pons" ? " · incl. curve fees" : ""}`],
    ["Market cap", `${fmtEth(mcap)} ETH`, `${supply.toLocaleString("en-US")} supply`],
    c.kind === "pons"
      ? ["Paid to creator", `${eth(c.launch.totalToCreator, 5)} ETH`, "80% of creator fees"]
      : ["Buys counted", c.buyCount.toLocaleString("en-US"), "qualifying buys (pot counter)"],
    c.kind === "pons"
      ? ["Treasury share", `${eth(c.launch.totalToTreasury, 5)} ETH`, "20% of creator fees"]
      : ["Pool fee", `${+(tk.base + tk.lp + tk.pot).toFixed(2)}%`, `base ${tk.base}% + rules${tk.burn ? ` · ${tk.burn}% burn on buys` : ""}`],
  ];
  $("#stats").innerHTML = cells.map(([k, v, s]) => `<div><small>${k}</small><b>${v}</b><small>${s}</small></div>`).join("");
}

async function renderCreator() {
  const me = getAccount();
  const box = $("#creatorBox");
  if (!me || !c.creator || getAddress(c.creator) !== me) { box.hidden = true; return; }
  box.hidden = false;
  if (c.kind === "pons") {
    const l = await loadLaunch(c.launch.id);
    c.launch = l;
    box.innerHTML = `<div class="row-between"><p class="form-h">Creator · only you see this</p><span class="badge green">You created $${esc(c.info.symbol)}</span></div>
      <div class="kv"><span>Claimable now</span><b>${eth(l.claimable, 6)} ETH</b></div>
      <div class="kv"><span>Claimed to date</span><b>${eth(l.totalToCreator, 6)} ETH</b></div>
      <p class="dim small">Fees still on the bonding curve are swept when you claim. 80% is yours, 20% goes to the Rigs treasury.</p>
      <div class="btn-row"><button class="btn btn-pink btn-sm" data-act="claim">Claim creator fees</button><button class="btn btn-dark btn-sm" data-act="harvest">Harvest only</button>
        <button class="btn btn-dark btn-sm" data-act="handover">Hand over to another wallet</button></div>${detailsEditor()}`;
  } else {
    box.innerHTML = `<div class="row-between"><p class="form-h">Creator · only you see this</p><span class="badge green">You opened this pool</span></div>
      <p class="muted small">Your founding position is locked forever; its LP fees (both ETH and $${esc(c.info.symbol)}) are yours. Collecting sends everything accrued to your wallet.</p>
      <div class="btn-row"><button class="btn btn-pink btn-sm" data-act="collect">Claim LP fees</button></div>${detailsEditor()}`;
  }
}

function detailsEditor() {
  return `<details class="subcard"><summary class="form-h">Logo &amp; one-liner</summary>
    <label class="small muted">Logo URL<input class="filter mono wide" id="mLogo" value="${esc(c.meta?.logo || "")}" placeholder="https://…" /></label>
    <label class="btn btn-dark btn-xs upload-btn">Upload an image<input type="file" id="mFile" accept="image/png,image/jpeg,image/webp,image/gif" hidden /></label>
    <label class="small muted">One-liner<input class="filter wide" id="mDesc" maxlength="160" value="${esc(c.meta?.description || "")}" /></label>
    <button class="btn btn-pink btn-sm" data-act="meta">Sign &amp; save</button>
    <p class="dim small">Signing proves you are the creator. It costs no gas.</p></details>`;
}

async function renderWinnings() {
  const box = $("#winBox");
  const me = getAccount();
  if (c.kind !== "v4" || !me) { box.hidden = true; return; }
  const r = (cur) => client.readContract({ address: CONFIG.rigsHook, abi: ABI.rigsHook, functionName: "claimable", args: [me, cur] }).catch(() => 0n);
  const [e, tk] = await Promise.all([r(zeroAddress), r(token)]);
  if (e === 0n && tk === 0n) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `<p class="form-h">Your winnings &amp; royalties</p>
    <div class="kv"><span>ETH</span><b>${eth(e, 6)}</b></div><div class="kv"><span>$${esc(c.info.symbol)}</span><b>${Number(formatUnits(tk, c.info.decimals)).toLocaleString("en-US")}</b></div>
    <div class="btn-row">${e > 0n ? '<button class="btn btn-pink btn-sm" data-act="win-eth">Claim ETH</button>' : ""}${tk > 0n ? '<button class="btn btn-pink btn-sm" data-act="win-token">Claim tokens</button>' : ""}</div>`;
}

function renderRules() {
  if (c.kind === "pons") {
    $("#rulesPanel").innerHTML = `<p class="form-h">Pons V2 curve</p><p class="muted small">This coin trades on a Pons V2 bonding curve and graduates into a locked Uniswap v4 pool when the curve sells out. Pons applies its own launch snipe tax and creator tax.</p>
      <div class="kv"><span>Fee splitter</span><b>${addrLink(c.launch.splitter)}</b></div><div class="kv"><span>Curve</span><b>${addrLink(c.launch.curve)}</b></div>
      <p class="small"><a class="link-pink" href="${CONFIG.ponsCoinUrl}${token}" target="_blank" rel="noopener">Open on Pons ↗</a></p>`;
    return;
  }
  const on = BLOCKS.filter((b) => (Number(c.cfg.blocks) & b.bit) !== 0);
  $("#rulesPanel").innerHTML = `<p class="form-h">Hook rules · RigsHook</p>
    <div class="kv"><span>Base LP fee</span><b>${Number(c.cfg.baseFee) / 10000}%</b></div>
    ${on.length ? on.map((b) => `<div class="rule-row">${blockIcon(b)}<div><b>${b.name}</b><small>${b.short}</small></div><a class="info" href="/hook?id=${b.id}">i</a></div>`).join("") : '<p class="dim small">No rule blocks: base fee only.</p>'}
    <p class="dim small">Rules were fixed when the pool opened at block ${c.launchBlock.toLocaleString("en-US")} and can never change.</p>`;
}

function renderDetails() {
  const rows = [["Token", addrLink(token)], ["Creator", addrLink(c.creator)], ["Decimals", c.info.decimals], ["Total supply", Number(formatUnits(c.supply, c.info.decimals)).toLocaleString("en-US")]];
  if (c.kind === "pons") rows.push(["Pons launcher", addrLink(CONFIG.ponsLauncher)], ["Fee splitter", addrLink(c.launch.splitter)], ["Curve", addrLink(c.launch.curve)]);
  else rows.push(["Pool id", `<span class="mono small">${c.poolId.slice(0, 18)}…</span>`], ["Hook", addrLink(CONFIG.rigsHook)], ["PoolManager", addrLink(CONFIG.poolManager)], ["Launcher", addrLink(CONFIG.rigsLauncher)]);
  $("#detailsPanel").innerHTML = rows.map(([k, v]) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`).join("");
}

function renderTrade() {
  const buy = t.side === "buy";
  const sym = esc(c.info.symbol);
  if (c.kind === "pons" && c.graduated) {
    $("#trade").innerHTML = `<p class="form-h">Trade</p><p class="muted small">This coin has left the bonding curve. Trade it in its graduated pool on Pons.</p><a class="btn btn-pink" href="${CONFIG.ponsCoinUrl}${token}" target="_blank" rel="noopener">Trade on Pons ↗</a>`;
    return;
  }
  if (c.kind === "v4" && !routerLive) {
    $("#trade").innerHTML = `<p class="form-h">Trade</p><p class="muted small">The Rigs swap router is not deployed yet. Deploy it on the Deploy page (step "Deploy swap router").</p>`;
    return;
  }
  const tk = takesOf();
  const minOut = t.quote != null ? (t.quote * BigInt(Math.round((100 - t.slippage) * 100))) / 10000n : null;
  const outFmt = (v) => (v == null ? "—" : buy ? `${Number(formatUnits(v, c.info.decimals)).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${sym}` : `${fmtPrice(Number(formatEther(v)), 5)} ETH`);
  const me = getAccount();
  const label = !me ? "Connect wallet" : !t.amount ? "Enter an amount" : !buy && !t.allowanceOk ? `Approve ${sym}` : buy ? `Buy ${sym}` : `Sell ${sym}`;
  $("#trade").innerHTML = `
    <p class="trade-h">Trade · ${c.kind === "pons" ? "Pons curve" : "v4 pool"}</p>
    <div class="subtabs"><button class="${buy ? "on buy-t" : ""}" data-side="buy">Buy</button><button class="${!buy ? "on sell-t" : ""}" data-side="sell">Sell</button></div>
    <p class="muted small">You pay · ${buy ? "ETH" : sym}</p>
    <label class="big-inp"><input id="tAmt" type="number" min="0" step="any" placeholder="0.0" value="${esc(t.amount)}" /><em>${buy ? "ETH" : sym}</em></label>
    <div class="presets">${(buy ? ["0.001", "0.01", "0.1"] : ["25%", "50%", "100%"]).map((p) => `<button data-preset="${p}">${p}</button>`).join("")}<button data-preset="max">Max</button></div>
    <div class="row-between"><span class="muted">Slippage</span><div class="presets slip">${[0.5, 1, 2, 5].map((s) => `<button class="${t.slippage === s ? "on" : ""}" data-slip="${s}">${s}%</button>`).join("")}</div></div>
    <div class="quote-box">
      <div class="kv"><span>Quoted output</span><b>${t.quoting ? "…" : outFmt(t.quote)}</b></div>
      ${t.quoteError && t.quote == null ? `<p class="err-t">${esc(t.quoteError)}</p>` : !t.amount ? '<p class="dim small">Enter an amount to quote.</p>' : !buy && !t.allowanceOk ? `<p class="dim small">Approve ${sym} first to quote this sell.</p>` : ""}
      ${tk ? `<div class="kv"><span>LP fee</span><b>${tk.base}%</b></div>
        <div class="kv"><span>Hook takes</span><b>${+(tk.lp + tk.pot).toFixed(2)}%</b></div>
        <div class="kv"><span>Token-output burn</span><b>${buy ? tk.burn : 0}%</b></div>`
        : `<div class="kv"><span>Fees</span><b>Pons curve + creator tax</b></div>`}
      <div class="kv"><span><b>Minimum received at ${t.slippage}%</b></span><b>${outFmt(minOut)}</b></div>
    </div>
    <details class="subcard"><summary class="form-h">How this trade works</summary><p class="muted small">${c.kind === "pons"
      ? "Your wallet trades directly with the Pons V2 curve. The quote is a simulation of the same call; the minimum protects you if the price moves before it lands."
      : "Your wallet calls RigsRouter, which swaps in the Uniswap v4 pool. The pool's hook applies its rules during the swap. You are passed as the buyer, so pot winnings are credited to you."}</p></details>
    <button class="btn btn-pink btn-lg" id="tGo" ${me && (!t.amount || t.quoting) ? "disabled" : ""}>${label}</button>`;
  $("#tAmt").addEventListener("input", (e) => { t.amount = e.target.value; t.quoteError = null; clearTimeout(t.timer); t.timer = setTimeout(quote, 350); });
}

function renderAll() {
  renderHead(); renderStats(); renderRules(); renderDetails(); renderTrade(); renderPrice();
  renderCreator(); renderWinnings();
}

// ---------------------------------------------------------------- price history, chart, activity

const TRANSFER = [{ type: "event", name: "Transfer", inputs: [{ name: "from", type: "address", indexed: true }, { name: "to", type: "address", indexed: true }, { name: "value", type: "uint256", indexed: false }] }];
let trades = []; // { t, block, hash, buy, eth (bigint|null), tok, price (ETH per token|null) }
let historyState = "loading";
let range = "1D";

/** Collects logs newest-first in shrinking chunks until `from` or `max` logs; halves the chunk on RPC range errors. */
async function scanBack(fetchRange, latest, from, max) {
  const out = [];
  let hi = latest, size = 200_000;
  while (hi >= from && out.length < max) {
    const lo = Math.max(from, hi - size + 1);
    try {
      out.unshift(...(await fetchRange(BigInt(lo), BigInt(hi))));
      hi = lo - 1;
    } catch (err) {
      if (size <= 2_000) throw err;
      size = Math.floor(size / 4);
    }
  }
  return out;
}

async function loadHistory() {
  try {
    const latestBlock = await client.getBlock();
    const latest = Number(latestBlock.number);
    const refNum = Math.max(1, latest - 200_000);
    const ref = await client.getBlock({ blockNumber: BigInt(refNum) });
    const spb = Math.max(0.01, (Number(latestBlock.timestamp) - Number(ref.timestamp)) / (latest - refNum)); // seconds per block
    const tOf = (block) => Number(latestBlock.timestamp) - (latest - block) * spb;
    const startOf = (ts) => Math.max(Number(CONFIG.startBlock || 0), Math.floor(latest - (Number(latestBlock.timestamp) - ts) / spb) - 5_000);

    if (c.kind === "v4") {
      const logs = await scanBack((fromBlock, toBlock) => client.getContractEvents({ address: CONFIG.poolManager, abi: ABI.poolManager, eventName: "Swap", args: { id: c.poolId }, fromBlock, toBlock }), latest, Math.max(c.launchBlock, Number(CONFIG.startBlock || 0)), 500);
      trades = logs.map((l) => {
        const buy = l.args.amount0 < 0n;
        return { t: tOf(Number(l.blockNumber)), block: Number(l.blockNumber), hash: l.transactionHash, buy, eth: buy ? -l.args.amount0 : l.args.amount0, tok: l.args.amount1 < 0n ? -l.args.amount1 : l.args.amount1, price: priceFromSqrt(l.args.sqrtPriceX96) };
      });
    } else {
      const curve = c.launch.curve;
      const from = startOf(c.launch.launchedAt);
      const logs = await scanBack(async (fromBlock, toBlock) => {
        const [out, inn] = await Promise.all([
          client.getContractEvents({ address: token, abi: TRANSFER, eventName: "Transfer", args: { from: curve }, fromBlock, toBlock }),
          client.getContractEvents({ address: token, abi: TRANSFER, eventName: "Transfer", args: { to: curve }, fromBlock, toBlock }),
        ]);
        return [...out, ...inn].sort((x, y) => Number(x.blockNumber - y.blockNumber) || x.logIndex - y.logIndex);
      }, latest, from, 400);
      trades = logs.filter((l) => l.args.value > 0n && !/^0x0{40}$/i.test(l.args.from) && !/^0x0{40}$/i.test(l.args.to))
        .map((l) => ({ t: tOf(Number(l.blockNumber)), block: Number(l.blockNumber), hash: l.transactionHash, buy: getAddress(l.args.from) === getAddress(curve), eth: null, tok: l.args.value, price: null }));
      // Buy price = ETH sent with the transaction ÷ tokens received (fees included). The launch
      // transaction also pays the Pons fee, so it is left out of the price line.
      const buys = trades.filter((x) => x.buy).slice(-150);
      const txs = await Promise.all(buys.map((x) => client.getTransaction({ hash: x.hash }).catch(() => null)));
      buys.forEach((x, i) => {
        const tx = txs[i];
        if (!tx || tx.value === 0n || (tx.to && getAddress(tx.to) === getAddress(CONFIG.ponsLauncher))) return;
        x.eth = tx.value;
        x.price = Number(formatEther(tx.value)) / Number(formatUnits(x.tok, c.info.decimals));
      });
    }
    historyState = "ok";
  } catch (err) {
    console.error(err);
    historyState = "error";
  }
  renderPrice();
  renderActivity();
}

const RANGES = { "1D": 86_400, "1W": 604_800, All: Infinity };
const hhmm = (t, span) => { const d = new Date(t * 1000); return span > 172_800 ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : d.toISOString().slice(11, span < 3_600 ? 19 : 16); };

function renderPrice() {
  const sym = esc(c.info.symbol);
  const now = Date.now() / 1000;
  const pts = trades.filter((x) => x.price > 0 && now - x.t <= RANGES[range]).map((x) => ({ t: x.t, p: x.price }));
  if (c.priceEth) pts.push({ t: now, p: c.priceEth });
  const head = `<div class="row-between chart-head"><div><p class="form-h">This ${c.kind === "pons" ? "coin" : "pool"}</p>
      <p class="muted small">ETH / ${sym} · ETH per ${sym}${c.kind === "pons" ? " · from curve buys" : ""}</p></div>
      <div class="ranges">${Object.keys(RANGES).map((r) => `<button class="${r === range ? "on" : ""}" data-range="${r}">${r}</button>`).join("")}</div></div>`;
  if (pts.length < 2) {
    $("#pricePanel").innerHTML = head + `<p class="big-num">${fmtEth(c.priceEth)} ETH</p><p class="muted small">${historyState === "loading" ? "Reading trade history…" : historyState === "error" ? "Could not read trade history from the RPC." : `No trades in this range yet${range !== "All" ? "; try All" : ""}.`}</p>`;
    return;
  }
  const W = 640, H = 220, PADR = 92, PADB = 24;
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t, span = Math.max(1, t1 - t0);
  let lo = Math.min(...pts.map((x) => x.p)), hi = Math.max(...pts.map((x) => x.p));
  if (hi === lo) { hi *= 1.01; lo *= 0.99; }
  const X = (t) => ((t - t0) / span) * (W - PADR);
  const Y = (p) => 8 + (1 - (p - lo) / (hi - lo)) * (H - PADB - 16);
  // step line: price holds until the next trade
  let d = `M${X(pts[0].t).toFixed(1)},${Y(pts[0].p).toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) d += ` H${X(pts[i].t).toFixed(1)} V${Y(pts[i].p).toFixed(1)}`;
  const area = `${d} V${H - PADB} H${X(pts[0].t).toFixed(1)} Z`;
  const ticks = [0, 1, 2, 3, 4].map((i) => lo + ((hi - lo) * i) / 4);
  // enough digits that neighbouring labels differ when the range is narrow
  const sig = Math.min(8, Math.max(4, Math.ceil(-Math.log10((hi - lo) / hi)) + 2));
  const times = [0, 0.5, 1].map((f) => t0 + span * f);
  $("#pricePanel").innerHTML = head + `
    <div class="chart-wrap"><svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" id="chartSvg">
      <defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--pink)" stop-opacity=".35"/><stop offset="1" stop-color="var(--pink)" stop-opacity="0"/></linearGradient></defs>
      ${ticks.map((v) => `<line x1="0" x2="${W - PADR}" y1="${Y(v)}" y2="${Y(v)}" class="grid"/>`).join("")}
      <path d="${area}" fill="url(#cg)"/><path d="${d}" fill="none" stroke="var(--pink)" stroke-width="2" vector-effect="non-scaling-stroke"/>
      <line id="cross" y1="0" y2="${H - PADB}" class="cross" hidden/><circle id="dot" r="4" fill="var(--pink)" hidden/>
    </svg>
    <div class="y-labels">${ticks.map((v) => `<span style="top:${(Y(v) / H) * 100}%">${fmtPrice(v, sig)} ETH</span>`).join("")}</div>
    <div class="x-labels">${times.map((t, i) => `<span style="left:${(X(t) / W) * 100}%;transform:translateX(${i === 0 ? 0 : i === 2 ? -100 : -50}%)">${hhmm(t, span)}</span>`).join("")}</div>
    <div class="tip" id="tip" hidden></div></div>
    <p class="dim small">${pts.length - 1} trade${pts.length === 2 ? "" : "s"} · updated ${new Date().toISOString().slice(11, 19)} UTC</p>`;
  const svg = $("#chartSvg"), tip = $("#tip"), cross = $("#cross"), dot = $("#dot");
  const move = (ev) => {
    const r = svg.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * W;
    const t = t0 + (Math.min(Math.max(x, 0), W - PADR) / (W - PADR)) * span;
    let k = 0;
    for (let i = 0; i < pts.length; i++) if (pts[i].t <= t) k = i;
    const pt = pts[k];
    cross.setAttribute("x1", X(t)); cross.setAttribute("x2", X(t)); cross.hidden = false;
    dot.setAttribute("cx", X(t)); dot.setAttribute("cy", Y(pt.p)); dot.hidden = false;
    tip.hidden = false;
    tip.textContent = `${fmtPrice(pt.p)} ETH · ${new Date(t * 1000).toISOString().slice(5, 16).replace("T", " ")} UTC`;
    tip.style.left = `${Math.min(70, (X(t) / W) * 100)}%`;
  };
  svg.addEventListener("pointermove", move);
  svg.addEventListener("pointerdown", move);
  svg.addEventListener("pointerleave", () => { tip.hidden = cross.hidden = dot.hidden = true; });
}

function renderActivity() {
  const sym = esc(c.info.symbol);
  const rows = trades.slice(-50).reverse().map((s) => `<tr><td><span class="${s.buy ? "up" : "down"}">${s.buy ? "Buy" : "Sell"}</span></td>
    <td class="r mono">${s.eth == null ? "—" : fmtPrice(Number(formatEther(s.eth)), 4) + " ETH"}</td><td class="r mono">${Number(formatUnits(s.tok, c.info.decimals)).toLocaleString("en-US", { maximumFractionDigits: 0 })}</td>
    <td class="r dim">${hhmm(s.t, 1e9)} ${new Date(s.t * 1000).toISOString().slice(11, 16)}</td><td class="r"><a class="link-pink" href="${CONFIG.explorer}/tx/${s.hash}" target="_blank" rel="noopener">tx ↗</a></td></tr>`);
  $("#activityPanel").innerHTML = `<table class="table"><thead><tr><th>Side</th><th class="r">ETH</th><th class="r">${sym}</th><th class="r">Time (UTC)</th><th class="r"></th></tr></thead><tbody>${rows.join("") || `<tr><td colspan="5" class="dim">${historyState === "loading" ? "Reading…" : historyState === "error" ? "Could not read trade history." : "No trades yet."}</td></tr>`}</tbody></table>`;
}

// ---------------------------------------------------------------- actions

document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-side],[data-preset],[data-slip],[data-ctab],[data-copy],[data-act],[data-range],#tGo");
  if (!b) return;
  if (b.dataset.range) { range = b.dataset.range; return renderPrice(); }
  if (b.dataset.side) { t.side = b.dataset.side; t.amount = ""; t.quote = null; t.quoteError = null; return renderTrade(); }
  if (b.dataset.slip) { t.slippage = Number(b.dataset.slip); return renderTrade(); }
  if (b.dataset.copy) { navigator.clipboard?.writeText(b.dataset.copy).then(() => toast("Address copied")).catch(() => {}); return; }
  if (b.dataset.ctab) {
    document.querySelectorAll("#ctabs button").forEach((x) => x.classList.toggle("on", x.dataset.ctab === b.dataset.ctab));
    document.querySelectorAll("[data-cpanel]").forEach((p) => (p.hidden = p.dataset.cpanel !== b.dataset.ctab));
    if (!b.closest("#ctabs")) $("#ctabs").scrollIntoView({ behavior: "smooth" });
    return;
  }
  if (b.dataset.preset) {
    const p = b.dataset.preset;
    const me = getAccount();
    if (t.side === "buy") {
      if (p === "max") {
        if (!me) return toast("Connect a wallet first");
        const bal = await client.getBalance({ address: me });
        const keep = parseEther("0.0005"); // leave gas
        t.amount = bal > keep ? formatEther(bal - keep) : "0";
      } else t.amount = p;
    } else {
      if (!me) return toast("Connect a wallet first");
      const bal = await client.readContract({ address: token, abi: ABI.erc20Full, functionName: "balanceOf", args: [me] });
      const pct = p === "max" ? 100n : BigInt(parseInt(p, 10));
      t.amount = formatUnits((bal * pct) / 100n, c.info.decimals);
    }
    renderTrade();
    return quote();
  }
  if (b.id === "tGo") return trade(b);
  if (b.dataset.act) return act(b);
});

async function trade(btn) {
  const { connect } = await import("./web3.js");
  if (!getAccount()) { try { await connect(); } catch (err) { toast(friendlyError(err)); } return; }
  btn.disabled = true;
  try {
    const me = getAccount();
    if (t.side === "buy") {
      const wei = parseEther(String(t.amount));
      const q = t.quote ?? (await (c.kind === "pons" ? ponsQuoteBuy(wei) : simulate({ address: CONFIG.rigsRouter, abi: ABI.rigsRouter, functionName: "buy", args: [c.key, 0n, me], value: wei }, null)));
      const minOut = (q * BigInt(Math.round((100 - t.slippage) * 100))) / 10000n;
      btn.textContent = "Confirm in your wallet…";
      if (c.kind === "pons") await write({ address: c.launch.curve, abi: ABI.ponsCurve, functionName: "buy", args: [wei, minOut, me], value: wei });
      else await write({ address: CONFIG.rigsRouter, abi: ABI.rigsRouter, functionName: "buy", args: [c.key, minOut, me], value: wei });
      toast(`Bought $${c.info.symbol}`);
    } else {
      const units = parseUnits(String(t.amount), c.info.decimals);
      const spender = c.kind === "pons" ? c.launch.curve : CONFIG.rigsRouter;
      if (!t.allowanceOk) {
        btn.textContent = "Approve in your wallet…";
        await ensureAllowance(token, spender, units);
        t.allowanceOk = true;
        await quote();
        return;
      }
      const q = t.quote;
      if (q == null) throw new Error("No quote yet");
      const minOut = (q * BigInt(Math.round((100 - t.slippage) * 100))) / 10000n;
      btn.textContent = "Confirm in your wallet…";
      if (c.kind === "pons") await write({ address: c.launch.curve, abi: ABI.ponsCurve, functionName: "sell", args: [units, minOut, me] });
      else await write({ address: CONFIG.rigsRouter, abi: ABI.rigsRouter, functionName: "sell", args: [c.key, units, minOut, me] });
      toast(`Sold $${c.info.symbol}`);
    }
    t.amount = ""; t.quote = null;
    await refreshPrice();
    renderAll();
    loadHistory();
  } catch (err) {
    console.error(err);
    toast(friendlyError(err));
    renderTrade();
  }
}

async function act(b) {
  b.disabled = true;
  try {
    const a = b.dataset.act;
    if (a === "claim" || a === "harvest") {
      await write({ address: c.launch.splitter, abi: ABI.splitter, functionName: a });
      toast(a === "claim" ? "Creator fees sent to your wallet" : "Fees harvested");
    } else if (a === "handover") {
      const next = prompt("New creator wallet address (receives all future claims):");
      if (!next) return;
      if (!isAddress(next.trim())) throw new Error("Not an address");
      await write({ address: c.launch.splitter, abi: ABI.splitter, functionName: "setCreator", args: [getAddress(next.trim())] });
      toast("Creator share handed over");
    } else if (a === "collect") {
      await write({ address: CONFIG.rigsLauncher, abi: ABI.rigsLauncher, functionName: "collectCreatorFees", args: [token] });
      toast("LP fees sent to your wallet");
    } else if (a === "meta") {
      c.meta = await saveMeta(token, { logo: $("#mLogo").value.trim(), description: $("#mDesc").value.trim() });
      toast("Details saved");
      renderHead();
    } else if (a === "win-eth" || a === "win-token") {
      await write({ address: CONFIG.rigsHook, abi: ABI.rigsHook, functionName: "claim", args: [a === "win-eth" ? zeroAddress : token] });
      toast("Claimed");
    }
    if (c.kind === "pons") c.launch = await loadLaunch(c.launch.id);
    renderAll();
  } catch (err) {
    toast(friendlyError(err));
  } finally {
    b.disabled = false;
  }
}

document.addEventListener("change", async (e) => {
  if (e.target.id !== "mFile" || !e.target.files[0]) return;
  toast("Uploading…");
  try { $("#mLogo").value = await uploadLogo(e.target.files[0]); toast("Uploaded. Press Sign & save."); } catch (err) { toast(friendlyError(err)); }
});

onAccount(async (me) => {
  if (!c.kind) return;
  t.balanceEth = me ? await client.getBalance({ address: me }).catch(() => 0n) : 0n;
  renderCreator(); renderWinnings(); renderTrade();
});
resolve().catch((err) => { console.error(err); fail("Could not reach the chain."); });
