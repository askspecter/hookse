import {
  CONFIG, ABI, $, esc, toast, friendlyError, client, auctionsLive, write, getAccount, onAccount, isAddress, getAddress,
  addrLink, tokenInfo, ensureAllowance, fmtPrice,
} from "./web3.js";
import { formatUnits, parseUnits, formatEther, parseEther } from "https://cdn.jsdelivr.net/npm/viem@2.21.0/+esm";

let list = [];
let filter = "live";
let sellToken = null;
const now = () => Math.floor(Date.now() / 1000);
const state = (a) => (now() < a.start ? "upcoming" : now() >= a.end || a.sold >= a.amount ? "ended" : "live");
const fmtT = (a, v) => Number(formatUnits(v, a.info.decimals)).toLocaleString("en-US", { maximumFractionDigits: 4 });
const left = (s) => (s <= 0 ? "0m" : s < 3600 ? `${Math.ceil(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`);

/** Current price per whole token (in ETH wei), same formula as the contract. */
function price(a) {
  const t = now();
  if (t <= a.start) return a.startPrice;
  if (t >= a.end) return a.floorPrice;
  return a.startPrice - ((a.startPrice - a.floorPrice) * BigInt(t - a.start)) / BigInt(a.end - a.start);
}

async function load() {
  if (!auctionsLive) { $("#notLive").hidden = false; $("#alist").innerHTML = '<div class="empty"><b>No auctions yet</b><p>Auctions appear here once the contract is deployed.</p></div>'; return; }
  const n = Number(await client.readContract({ address: CONFIG.rigsAuctions, abi: ABI.rigsAuctions, functionName: "auctionCount" }));
  const ids = Array.from({ length: Math.min(n, 100) }, (_, i) => n - 1 - i);
  const infos = new Map();
  list = await Promise.all(ids.map(async (id) => {
    const a = await client.readContract({ address: CONFIG.rigsAuctions, abi: ABI.rigsAuctions, functionName: "auctions", args: [BigInt(id)] });
    if (!infos.has(a.token)) infos.set(a.token, tokenInfo(a.token));
    return { id, ...a, start: Number(a.start), end: Number(a.end), info: await infos.get(a.token) };
  }));
  render();
}

function card(a) {
  const st = state(a);
  const me = getAccount() && getAddress(a.seller) === getAccount();
  const remaining = a.amount - a.sold;
  const pctSold = a.amount ? Number((a.sold * 1000n) / a.amount) / 10 : 0;
  const timeNote = st === "upcoming" ? `starts in ${left(a.start - now())}` : st === "live" ? `${left(a.end - now())} left` : "ended";
  return `<div class="card listing auction" id="auction-${a.id}">
    <div class="row-between"><div class="tok"><div class="av">${esc((a.info.symbol || "?").slice(0, 2))}</div><b>${esc(a.info.name || "Token")} <span class="dim">$${esc(a.info.symbol || "")}</span></b></div>
      <span class="badge ${st === "live" ? "green" : st === "upcoming" ? "violet" : "gray"}">${st}</span></div>
    <div class="kv"><span>Price now</span><b>${fmtPrice(Number(formatEther(price(a))))} ETH</b></div>
    <div class="kv"><span>Start → floor</span><b>${fmtPrice(Number(formatEther(a.startPrice)), 3)} → ${fmtPrice(Number(formatEther(a.floorPrice)), 3)}</b></div>
    <div class="kv"><span>Left</span><b>${fmtT(a, remaining)} / ${fmtT(a, a.amount)}</b></div>
    <div class="bar"><span style="width:${pctSold}%"></span></div>
    <p class="dim small">${timeNote} · seller ${addrLink(a.seller)} · token ${addrLink(a.token)}</p>
    ${st === "live" ? `<div class="buy-row"><input class="filter mono" type="number" min="0" step="any" placeholder="Tokens" data-amt="${a.id}" /><button class="btn btn-primary btn-sm" data-buy="${a.id}">Buy</button></div><p class="dim small" data-cost="${a.id}"></p>` : ""}
    ${me ? `<div class="btn-row">${a.proceeds > 0n || (st === "ended" && !a.unsoldWithdrawn) ? `<button class="btn btn-dark btn-xs" data-withdraw="${a.id}">Withdraw ${a.proceeds > 0n ? Number(formatEther(a.proceeds)).toPrecision(4) + " ETH" : ""}${st === "ended" && !a.unsoldWithdrawn && remaining > 0n ? " + unsold" : ""}</button>` : ""}${st !== "ended" ? `<button class="btn btn-dark btn-xs" data-end="${a.id}">End now</button>` : ""}</div>` : ""}
  </div>`;
}

function render() {
  const me = getAccount();
  const shown = list.filter((a) => (filter === "mine" ? me && getAddress(a.seller) === me : state(a) === filter));
  $("#acount").textContent = `${shown.length} auction${shown.length === 1 ? "" : "s"}`;
  $("#alist").innerHTML = shown.length ? shown.map(card).join("")
    : `<div class="empty"><b>${filter === "mine" ? (me ? "You have no auctions" : "Connect your wallet") : `No ${filter} auctions`}</b><p><a class="link-accent" href="#create">Create one →</a></p></div>`;
  const hash = location.hash.match(/^#auction-(\d+)$/);
  if (hash) document.getElementById(`auction-${hash[1]}`)?.scrollIntoView({ block: "center" });
}

document.addEventListener("click", async (e) => {
  const t = e.target.closest("[data-f],[data-buy],[data-withdraw],[data-end]");
  if (!t) return;
  if (t.dataset.f) {
    filter = t.dataset.f;
    document.querySelectorAll("#atabs button").forEach((b) => b.classList.toggle("active", b === t));
    return render();
  }
  const id = Number(t.dataset.buy ?? t.dataset.withdraw ?? t.dataset.end);
  const a = list.find((x) => x.id === id);
  t.disabled = true;
  try {
    if (t.dataset.buy) {
      const amt = document.querySelector(`[data-amt="${id}"]`).value;
      const tokens = parseUnits(String(amt || "0"), a.info.decimals);
      if (tokens <= 0n) throw new Error("Enter how many tokens to buy");
      const cost = await client.readContract({ address: CONFIG.rigsAuctions, abi: ABI.rigsAuctions, functionName: "quote", args: [BigInt(id), tokens] });
      // Price only falls while the auction runs, so the quote covers the buy; any excess is refunded.
      await write({ address: CONFIG.rigsAuctions, abi: ABI.rigsAuctions, functionName: "buy", args: [BigInt(id), tokens], value: cost });
      toast(`Bought ${amt} $${a.info.symbol}`);
    } else if (t.dataset.withdraw) {
      await write({ address: CONFIG.rigsAuctions, abi: ABI.rigsAuctions, functionName: "withdraw", args: [BigInt(id)] });
      toast("Withdrawn to your wallet");
    } else {
      await write({ address: CONFIG.rigsAuctions, abi: ABI.rigsAuctions, functionName: "end", args: [BigInt(id)] });
      toast("Auction ended");
    }
    await load();
  } catch (err) {
    toast(friendlyError(err));
    t.disabled = false;
  }
});

document.addEventListener("input", (e) => {
  const id = e.target.dataset.amt;
  if (id == null) return;
  const a = list.find((x) => x.id === Number(id));
  let cost = null;
  try { cost = (parseUnits(String(e.target.value || "0"), a.info.decimals) * price(a)) / 10n ** 18n; } catch { /* bad input */ }
  document.querySelector(`[data-cost="${id}"]`).textContent = cost ? `≈ ${Number(formatEther(cost)).toPrecision(4)} ETH at the current price` : "";
});

// ---------------------------------------------------------------- create
const f = $("#aform");
$("#aload").addEventListener("click", async () => {
  const addr = f.elements.token.value.trim();
  if (!isAddress(addr)) return toast("Paste a token address");
  sellToken = await tokenInfo(getAddress(addr));
  if (!sellToken.symbol) { sellToken = null; return toast("That is not an ERC-20 token on this chain"); }
  const bal = getAccount() ? await client.readContract({ address: sellToken.address, abi: ABI.erc20Full, functionName: "balanceOf", args: [getAccount()] }).catch(() => null) : null;
  $("#ainfo").textContent = `${sellToken.name} · $${sellToken.symbol}${bal != null ? ` · you hold ${Number(formatUnits(bal, sellToken.decimals)).toLocaleString("en-US")}` : ""}`;
});
f.addEventListener("input", () => {
  const sp = Number(f.elements.startPrice.value), fp = Number(f.elements.floorPrice.value), amt = Number(f.elements.amount.value);
  if (sp > 0 && fp > 0 && amt > 0) $("#asummary").textContent = `Raises between ${(amt * fp).toPrecision(4)} and ${(amt * sp).toPrecision(4)} ETH if everything sells. Price falls from ${sp} to ${fp} ETH per token over ${f.elements.duration.selectedOptions[0].text}.`;
});
f.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!auctionsLive) return toast("Auctions are not deployed yet");
  if (!sellToken) return toast("Load the token first");
  const btn = $("#acreate");
  try {
    const amount = parseUnits(String(f.elements.amount.value || "0"), sellToken.decimals);
    const sp = parseEther(String(f.elements.startPrice.value || "0"));
    const fp = parseEther(String(f.elements.floorPrice.value || "0"));
    if (amount <= 0n || fp <= 0n || sp < fp) throw new Error("Amount must be above 0 and start price at or above the floor");
    btn.disabled = true;
    btn.textContent = "Approve in your wallet…";
    await ensureAllowance(sellToken.address, CONFIG.rigsAuctions, amount);
    btn.textContent = "Confirm the auction…";
    await write({ address: CONFIG.rigsAuctions, abi: ABI.rigsAuctions, functionName: "create", args: [sellToken.address, amount, sp, fp, 0n, BigInt(f.elements.duration.value)] });
    toast("Auction created");
    f.reset();
    sellToken = null;
    await load();
    document.getElementById("alist").scrollIntoView({ behavior: "smooth" });
  } catch (err) {
    toast(friendlyError(err));
  } finally {
    btn.disabled = false;
    btn.textContent = "Approve & create";
  }
});

onAccount(() => { if (list.length) render(); });
load().catch((err) => { console.error(err); $("#alist").innerHTML = '<div class="empty"><b>Could not reach the chain</b></div>'; });
setInterval(() => { if (list.length && !document.activeElement?.dataset?.amt) render(); }, 15000);
