// App shell: sidebar navigation, search palette, theme + accent, mobile menu.
// Each app page has <aside id="sidebar"></aside> and <main class="app-main">…</main>.
const ICON = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  discover: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  launch: '<path d="M12 3v10a4 4 0 0 1-8 0"/><path d="M12 13a4 4 0 0 0 8 0v-2"/>',
  portfolio: '<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/>',
  builder: '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M8 7.5 11 16M16 7.5 13 16"/>',
  scan: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><circle cx="12" cy="12" r="3"/>',
  plug: '<path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4"/>',
  bot: '<rect x="4" y="8" width="16" height="11" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/>',
  doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
  people: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.5A5 5 0 0 1 21 19"/>',
  wallet: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M16 12h2M3 9h18"/>',
  gavel: '<path d="m14 5 5 5M11 8l5 5M9 10l5-5M12 13l5-5M4 20l6-6M3 21h8"/>',
  flame: '<path d="M12 3c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-4 3-6 1 2 2 2 3 2 0-3-1-5 0-7z"/>',
};
export const icon = (k, size = 16) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>`;

const NAV = [
  ["app", "Discover", "discover"],
  ["launch", "Launch", "launch"],
  ["portfolio", "Portfolio", "portfolio"],
  ["builder", "Builder", "builder"],
  ["auctions", "Auctions", "gavel"],
  ["scan", "Scan", "scan"],
  ["integrations", "Integrations", "plug", true],
  ["agents", "Agents", "bot", true],
];
const LEARN = [["learn", "Learn", "book"], ["docs", "Docs", "doc"], ["community", "Community", "people"]];
const EXTRA = [["deploy", "Deploy contracts (admin)"], ["hooks", "Hooks catalog"], ["token", "Token"], ["updates", "Updates"], ["index", "Home"], ["privacy", "Privacy"], ["terms", "Terms"]];
const ACCENTS = { pink: "#fc72ff", blue: "#4c82fb", green: "#40b66b", amber: "#e0a030" };

const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } },
};

function applyTheme() {
  const theme = store.get("rigs-theme") || "dark";
  const accent = store.get("rigs-accent") || "pink";
  const resolved = theme === "system" ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : theme;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.setProperty("--pink", ACCENTS[accent] || ACCENTS.pink);
  document.querySelectorAll("[data-theme-set]").forEach((b) => b.classList.toggle("on", b.dataset.themeSet === theme));
  document.querySelectorAll("[data-accent]").forEach((b) => b.classList.toggle("on", b.dataset.accent === accent));
}

const page = location.pathname.split("/").pop().replace(".html", "") || "index";
const active = document.body.dataset.nav || page;
const link = ([href, label, ic, isNew]) =>
  `<a href="${href === "index" ? "/" : "/" + href}" class="side-link${active === href ? " on" : ""}">${icon(ic)}<span>${label}</span></a>`;

const side = document.getElementById("sidebar");
if (side) {
  side.className = "sidebar";
  side.innerHTML = `
    <div class="side-top">
      <a href="/" class="logo side-logo">
        <svg viewBox="0 0 32 32" width="24" height="24" aria-hidden="true"><rect width="32" height="32" rx="8" fill="var(--pink)"/><path d="M11 7v11a5 5 0 0 0 10 0v-3" stroke="#0b0d12" stroke-width="3.2" fill="none" stroke-linecap="round"/></svg>
        <span>RIGS</span>
      </a>
      <button class="side-close" id="sideClose" aria-label="Close menu">×</button>
    </div>
    <button class="side-search" id="openSearch">${icon("search", 14)}<span>Search</span><kbd>⌘K</kbd></button>
    <nav class="side-nav">${NAV.map(link).join("")}</nav>
    <p class="side-h">Learn</p>
    <nav class="side-nav">${LEARN.map(link).join("")}</nav>
    <div class="side-foot">
      <button class="btn btn-pink side-connect" data-connect>${icon("wallet", 15)}<span>Connect wallet</span></button>
      <label class="side-net"><img class="chain-ic" src="/assets/robinhood.png" alt="" />Network
        <select id="netSel"><option value="all">All networks</option><option value="4663" selected>Robinhood Chain</option></select>
        <span class="mono dim">4663</span></label>
      <p class="side-h">Appearance</p>
      <div class="seg">${["light", "system", "dark"].map((t) => `<button data-theme-set="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join("")}</div>
      <div class="accents">${Object.entries(ACCENTS).map(([k, c]) => `<button data-accent="${k}" style="--c:${c}" aria-label="${k} accent"></button>`).join("")}</div>
      <div class="side-stat">${icon("flame", 16)}<div><small>Rigs launches</small><b class="mono" id="sideLaunches">—</b></div></div>
      <nav class="side-links"><a href="/token">Token</a><a href="/updates">Updates</a><a href="/docs#fee-model">Methodology</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a></nav>
    </div>`;
  const bar = document.createElement("div");
  bar.className = "mobile-bar";
  bar.innerHTML = `<a href="/" class="logo side-logo"><svg viewBox="0 0 32 32" width="26" height="26"><rect width="32" height="32" rx="8" fill="var(--pink)"/><path d="M11 7v11a5 5 0 0 0 10 0v-3" stroke="#0b0d12" stroke-width="3.2" fill="none" stroke-linecap="round"/></svg><span>RIGS</span></a>
    <button class="btn btn-pink bar-connect" data-connect>${icon("wallet", 16)}<span>Connect wallet</span></button>
    <button class="menu-btn" id="sideToggle" aria-label="Menu"><span></span><span></span><span></span></button>`;
  document.body.prepend(bar);
  const scrim = document.createElement("div");
  scrim.className = "scrim";
  document.body.append(scrim);
  const setOpen = (open) => document.body.classList.toggle("side-open", open);
  bar.querySelector("#sideToggle").addEventListener("click", () => setOpen(true));
  side.querySelector("#sideClose").addEventListener("click", () => setOpen(false));
  scrim.addEventListener("click", () => setOpen(false));
  side.addEventListener("click", (e) => { if (e.target.closest("a")) setOpen(false); });
  side.addEventListener("click", (e) => {
    const t = e.target.closest("[data-theme-set]");
    const a = e.target.closest("[data-accent]");
    if (t) store.set("rigs-theme", t.dataset.themeSet);
    if (a) store.set("rigs-accent", a.dataset.accent);
    if (t || a) applyTheme();
  });
}

// ---------------------------------------------------------------- search palette
const ALL = [...NAV, ...LEARN, ...EXTRA.map(([h, l]) => [h, l, "doc"])];
const pal = document.createElement("div");
pal.className = "palette";
pal.hidden = true;
pal.innerHTML = `<div class="palette-box card"><input placeholder="Jump to a page, hook or token address…" /><div class="palette-list"></div></div>`;
document.body.append(pal);
const input = pal.querySelector("input");
const list = pal.querySelector(".palette-list");
const HOOKS = ["anti-snipe", "surge-fee", "auto-burn", "lp-rewards", "nth-buy-pot"];
function renderPalette() {
  const q = input.value.trim().toLowerCase();
  if (/^0x[0-9a-f]{40}$/i.test(q)) {
    list.innerHTML = `<a href="/scan?address=${q}">Scan ${q.slice(0, 10)}…</a><a href="/portfolio?token=${q}">Creator fees for token ${q.slice(0, 10)}…</a>`;
    return;
  }
  const pages = ALL.filter(([, l]) => l.toLowerCase().includes(q)).map(([h, l]) => `<a href="${h === "index" ? "/" : "/" + h}">${l}</a>`);
  const hooks = HOOKS.filter((h) => h.includes(q)).map((h) => `<a href="/hook?id=${h}">Hook · ${h.replace(/-/g, " ")}</a>`);
  list.innerHTML = [...pages, ...hooks].slice(0, 10).join("") || '<p class="dim">No matches</p>';
}
const openPalette = () => { pal.hidden = false; input.value = ""; renderPalette(); input.focus(); };
input.addEventListener("input", renderPalette);
input.addEventListener("keydown", (e) => { if (e.key === "Enter") list.querySelector("a")?.click(); });
pal.addEventListener("click", (e) => { if (e.target === pal) pal.hidden = true; });
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openPalette(); }
  if (e.key === "Escape") pal.hidden = true;
});
document.getElementById("openSearch")?.addEventListener("click", openPalette);

applyTheme();

// Wallet + chain (connect buttons, launch count). Loads viem from the CDN.
import("./web3.js").then(async ({ live, client, CONFIG, ABI }) => {
  if (!live) return;
  const n = await client.readContract({ address: CONFIG.ponsLauncher, abi: ABI.launcher, functionName: "launchCount" }).catch(() => null);
  const el = document.getElementById("sideLaunches");
  if (el && n != null) el.textContent = String(n);
}).catch(() => {});
