// Hookse demo front-end. All data below is mock data.

const HOOKS = [
  { id: "antisnipe", icon: "🛡️", name: "Anti-Snipe", cat: "protect", desc: "Caps buy size and adds a decaying tax during the first blocks after launch.", buy: 5, sell: 0, royalty: 0.05, flags: ["beforeSwap"], uses: 612, author: "0x7a1…c09" },
  { id: "surge", icon: "⚡", name: "Surge Fee", cat: "fee", desc: "Fee scales up with trade size relative to pool depth, dampening large swings.", buy: 0.5, sell: 0.5, royalty: 0.05, flags: ["beforeSwap", "dynamicFee"], uses: 488, author: "0x3f2…b71" },
  { id: "burn", icon: "🔥", name: "Auto Burn", cat: "supply", desc: "Routes a share of every buy's output to the dead address.", buy: 1, sell: 0, royalty: 0.03, flags: ["afterSwap", "returnsDelta"], uses: 401, author: "0x91c…2ee" },
  { id: "lprewards", icon: "💧", name: "LP Rewards", cat: "reward", desc: "Streams a cut of fees to in-range liquidity providers, weighted by time.", buy: 0.5, sell: 0.5, royalty: 0.04, flags: ["afterSwap", "afterAddLiquidity"], uses: 355, author: "0x0bd…a44" },
  { id: "nthbuy", icon: "🎰", name: "Nth-Buy Pot", cat: "reward", desc: "Collects a small pot from trades and pays it out to every Nth qualifying buy.", buy: 1, sell: 1, royalty: 0.05, flags: ["afterSwap"], uses: 207, author: "0x5e8…19d" },
  { id: "maxwallet", icon: "📏", name: "Max Wallet", cat: "protect", desc: "Rejects buys that would push a wallet above a fixed share of supply.", buy: 0, sell: 0, royalty: 0.02, flags: ["afterSwap"], uses: 544, author: "0xc44…7f0" },
  { id: "cooldown", icon: "⏱️", name: "Sell Cooldown", cat: "protect", desc: "Enforces a minimum block gap between consecutive sells from one address.", buy: 0, sell: 0, royalty: 0.02, flags: ["beforeSwap"], uses: 176, author: "0x2aa…e63" },
  { id: "buyback", icon: "🔁", name: "Buyback", cat: "supply", desc: "Accrues sell fees in ETH and periodically market-buys and burns tokens.", buy: 0, sell: 2, royalty: 0.04, flags: ["afterSwap", "returnsDelta"], uses: 139, author: "0x8d0…4b2" },
  { id: "timefee", icon: "📉", name: "Decay Fee", cat: "fee", desc: "Starts with a high fee that steps down linearly to a floor over 24 hours.", buy: 2, sell: 2, royalty: 0.03, flags: ["beforeSwap", "dynamicFee"], uses: 298, author: "0xe17…d88" },
];

const ALL_FLAGS = ["beforeSwap", "afterSwap", "dynamicFee", "returnsDelta", "afterAddLiquidity", "beforeInit"];
const BASE_FEE = 0.3;

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const byId = Object.fromEntries(HOOKS.map(h => [h.id, h]));

/* ---------- toast ---------- */
let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ---------- nav ---------- */
$("#burger").addEventListener("click", () => $("#links").classList.toggle("open"));
$$("#links a").forEach(a => a.addEventListener("click", () => $("#links").classList.remove("open")));
$("#connectBtn").addEventListener("click", e => {
  const b = e.currentTarget;
  if (b.dataset.on) { b.textContent = "Connect"; delete b.dataset.on; return; }
  b.textContent = "0x4c…9a1e";
  b.dataset.on = "1";
  toast("Demo wallet connected");
});

/* ---------- stat counters ---------- */
function animateCount(el) {
  const target = parseFloat(el.dataset.count);
  const dec = +(el.dataset.dec || 0);
  const pre = el.dataset.prefix || "", suf = el.dataset.suffix || "";
  const start = performance.now(), dur = 1400;
  const step = now => {
    const p = Math.min((now - start) / dur, 1);
    const v = target * (1 - Math.pow(1 - p, 3));
    el.textContent = pre + v.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec }) + suf;
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
const io = new IntersectionObserver(entries => entries.forEach(e => {
  if (e.isIntersecting) { animateCount(e.target); io.unobserve(e.target); }
}));
$$("[data-count]").forEach(el => io.observe(el));

/* ---------- mock tokens ---------- */
const NAMES = [["Hook Frog", "HFROG"], ["Moon Pipe", "MPIPE"], ["Based Crab", "BCRAB"], ["Gigahook", "GIGA"], ["Tiny Whale", "TWHL"], ["Surge Cat", "SCAT"], ["Burnie", "BURN"], ["Pot Luck", "POTL"], ["Lazy Llama", "LAZY"], ["Rocket Rug", "NORUG"], ["Degen Duck", "DDUCK"], ["Neon Ape", "NAPE"]];
const COLORS = ["#c6ff3d", "#3de0ff", "#ff7ab6", "#ffd166", "#a78bfa", "#3ddc84"];
let seed = 7;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

const TOKENS = NAMES.map(([name, tk], i) => {
  const hooks = HOOKS.filter(() => rand() > 0.62).slice(0, 4);
  if (!hooks.length) hooks.push(HOOKS[i % HOOKS.length]);
  return {
    name, tk, hooks,
    color: COLORS[i % COLORS.length],
    price: rand() * 0.004,
    change: (rand() - 0.4) * 160,
    mcap: 20000 + rand() * 2400000,
    age: Math.floor(rand() * 300) + 2,
  };
});

const fmtUsd = n => n >= 1e6 ? "$" + (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? "$" + (n / 1e3).toFixed(1) + "k" : "$" + n.toFixed(2);
const fmtAge = m => m < 60 ? m + "m" : Math.floor(m / 60) + "h";

function renderTokens(q = "") {
  q = q.trim().toLowerCase();
  const rows = TOKENS.filter(t => !q || t.tk.toLowerCase().includes(q) || t.name.toLowerCase().includes(q));
  $("#tokenRows").innerHTML = rows.length ? rows.map(t => `
    <tr>
      <td><div class="tk"><div class="av" style="background:${t.color}">${t.tk.slice(0, 2)}</div><div><b>${t.name}</b><small>$${t.tk}</small></div></div></td>
      <td><div class="mini-hooks">${t.hooks.map(h => `<span title="${h.name}">${h.icon}</span>`).join("")}</div></td>
      <td>$${t.price.toFixed(6)}</td>
      <td class="${t.change >= 0 ? "up" : "down"}">${t.change >= 0 ? "+" : ""}${t.change.toFixed(1)}%</td>
      <td>${fmtUsd(t.mcap)}</td>
      <td class="muted">${fmtAge(t.age)}</td>
    </tr>`).join("") : `<tr><td colspan="6" class="muted">No tokens match “${q}”.</td></tr>`;
}
$("#tokenSearch").addEventListener("input", e => renderTokens(e.target.value));
$("#tokenRows").addEventListener("click", e => {
  const row = e.target.closest("tr");
  if (row && row.querySelector(".tk")) toast("Pool pages are not part of this demo");
});
renderTokens();

/* ---------- ticker ---------- */
const tickerItems = TOKENS.map(t => `<span><b>$${t.tk}</b><em class="${t.change >= 0 ? "up" : "down"}">${t.change >= 0 ? "▲" : "▼"} ${Math.abs(t.change).toFixed(1)}%</em></span>`).join("");
$("#ticker").innerHTML = tickerItems + tickerItems;

/* ---------- marketplace ---------- */
function renderHooks(filter = "all") {
  $("#hookGrid").innerHTML = HOOKS.filter(h => filter === "all" || h.cat === filter).map(h => `
    <article class="card hook">
      <div class="hook-top"><div class="ic">${h.icon}</div><span class="tag">${h.cat}</span></div>
      <h3>${h.name}</h3>
      <p>${h.desc}</p>
      <div class="hook-meta"><span>used <b>${h.uses}</b>×</span><span>royalty <b>${h.royalty}%</b></span><span>${h.author}</span></div>
    </article>`).join("");
}
$("#filters").addEventListener("click", e => {
  const b = e.target.closest(".chip");
  if (!b) return;
  $$(".chip").forEach(c => c.classList.toggle("active", c === b));
  renderHooks(b.dataset.f);
});
renderHooks();

/* ---------- composer ---------- */
const selected = new Set(["antisnipe", "burn"]);

$("#blockList").innerHTML = HOOKS.map(h => `
  <button type="button" class="block" data-id="${h.id}">
    <span class="ic">${h.icon}</span>
    <span><b>${h.name}</b><small>${h.buy || h.sell ? `+${h.buy}% / +${h.sell}%` : "no fee"}</small></span>
    <span class="tog"></span>
  </button>`).join("");

$("#blockList").addEventListener("click", e => {
  const b = e.target.closest(".block");
  if (!b) return;
  const id = b.dataset.id;
  selected.has(id) ? selected.delete(id) : selected.add(id);
  updatePreview();
});

function updatePreview() {
  const f = $("#launchForm");
  const name = f.elements.name.value.trim() || "Untitled";
  const tk = f.elements.ticker.value.trim().toUpperCase() || "TICKER";
  const hooks = [...selected].map(id => byId[id]);

  $$(".block").forEach(b => b.classList.toggle("on", selected.has(b.dataset.id)));
  $("#pvName").textContent = name;
  $("#pvTicker").textContent = "$" + tk;
  $("#pvAvatar").textContent = tk.slice(0, 2);

  const buy = BASE_FEE + hooks.reduce((s, h) => s + h.buy, 0);
  const sell = BASE_FEE + hooks.reduce((s, h) => s + h.sell, 0);
  const roy = hooks.reduce((s, h) => s + h.royalty, 0);
  $("#pvBuy").textContent = buy.toFixed(2) + "%";
  $("#pvSell").textContent = sell.toFixed(2) + "%";
  $("#pvCount").textContent = hooks.length;
  $("#pvRoyalty").textContent = roy.toFixed(2) + "%";

  const active = new Set(hooks.flatMap(h => h.flags));
  $("#pvFlags").innerHTML = ALL_FLAGS.map(fl => `<span class="flag ${active.has(fl) ? "on" : ""}">${fl}</span>`).join("");

  // v4 hook permissions live in the low bits of the hook address
  const bits = ALL_FLAGS.reduce((acc, fl, i) => acc | (active.has(fl) ? 1 << i : 0), 0);
  $("#pvAddr").textContent = "0x" + "b00c".padEnd(36, "0") + bits.toString(16).padStart(4, "0");
}

$("#launchForm").addEventListener("input", updatePreview);
$("#launchForm").addEventListener("submit", e => {
  e.preventDefault();
  const f = e.target;
  const tk = f.elements.ticker.value.trim().toUpperCase();
  if (!selected.size) return toast("Pick at least one hook block");
  toast(`$${tk} pool simulated with ${selected.size} hook${selected.size > 1 ? "s" : ""} ✓`);
});
updatePreview();
