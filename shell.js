// App shell: top bar (desktop), bottom tabs + "More" sheet (mobile), search palette, theme + accent.
// Every page loads it; app pages wrap their content in <main class="app-main">…</main>.
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
  shield: '<path d="M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6z"/>',
  chev: '<path d="m6 9 6 6 6-6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  home: '<path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  cards: '<rect x="7" y="4" width="12" height="16" rx="2"/><path d="M4 7v11a2 2 0 0 0 2 2"/><path d="m13 9 1.2 2.4 2.3.3-1.7 1.6.4 2.4-2.2-1.2-2.2 1.2.4-2.4-1.7-1.6 2.3-.3z"/>',
  dots: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
};
export const icon = (k, size = 16) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>`;

const NAV = [
  ["app", "Coins", "discover"],
  ["launch", "Launch", "launch"],
  ["gacha", "Gacha", "cards"],
  ["portfolio", "Earn", "portfolio"],
  ["auctions", "Auctions", "gavel"],
  ["builder", "Build", "builder"],
];
const MORE = [
  ["hooks", "Rules", "shield", "The five rule blocks"],
  ["scan", "Scan", "scan", "Decode any v4 hook"],
  ["integrations", "Integrations", "plug", "Pons, Uniswap, wallets"],
  ["agents", "Agents", "bot", "Skill file for bots"],
  ["learn", "Learn", "book", "Short guides"],
  ["docs", "Docs", "doc", "Contracts and addresses"],
  ["community", "Community", "people", "Top creators"],
  ["updates", "Updates", "flame", "What changed"],
];
const EXTRA = [["deploy", "Deploy contracts (admin)"], ["index", "Home"], ["privacy", "Privacy"], ["terms", "Terms"]];
const ACCENTS = { blue: "#1591ff", cyan: "#22b2ff", green: "#40b66b", amber: "#e0a030" };
const X_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>';

const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } },
};

function applyTheme() {
  const theme = store.get("rigs-theme") || "dark";
  const accent = ACCENTS[store.get("rigs-accent")] ? store.get("rigs-accent") : "blue";
  const resolved = theme === "system" ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : theme;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.setProperty("--accent", ACCENTS[accent]);
  document.querySelectorAll("[data-theme-set]").forEach((b) => b.classList.toggle("on", b.dataset.themeSet === theme));
  document.querySelectorAll("[data-accent]").forEach((b) => b.classList.toggle("on", b.dataset.accent === accent));
}

const page = location.pathname.split("/").pop().replace(".html", "") || "index";
const active = document.body.dataset.nav || page;
const url = (href) => (href === "index" ? "/" : "/" + href);
const inMore = MORE.some(([h]) => h === active);

const appearance = `
  <div class="set-row"><span>Theme</span><div class="seg">${["light", "system", "dark"].map((t) => `<button data-theme-set="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join("")}</div></div>
  <div class="set-row"><span>Accent</span><div class="accents">${Object.entries(ACCENTS).map(([k, c]) => `<button data-accent="${k}" style="--c:${c}" aria-label="${k} accent"></button>`).join("")}</div></div>
  <div class="set-row"><span>Network</span><span class="net-chip"><img class="chain-ic" src="/assets/robinhood.png" alt="" />Robinhood Chain <em>4663</em></span></div>`;
const footLinks = `<a href="/docs#fee-model">Methodology</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a class="x-link" href="https://x.com/userigsfun" target="_blank" rel="noopener" aria-label="Rigs on X">${X_ICON}@userigsfun</a>`;

// Desktop: one top bar. Mobile: slim top bar, bottom tabs, and a "More" sheet.
document.getElementById("sidebar")?.remove();
const top = document.createElement("header");
top.className = "topbar";
top.innerHTML = `
  <div class="topbar-in">
    <a href="/" class="logo"><img class="logo-img" src="/assets/logo-64.png" width="28" height="28" alt="Rigs" /><span>Rigs</span></a>
    <nav class="top-nav">${NAV.map(([h, l]) => `<a href="${url(h)}" class="${active === h ? "on" : ""}">${l}</a>`).join("")}
      <div class="drop" id="moreDrop"><button class="${inMore ? "on" : ""}" id="moreToggle" aria-haspopup="true">More ${icon("chev", 12)}</button>
        <div class="drop-menu card">${MORE.map(([h, l, ic, d]) => `<a href="${url(h)}" class="${active === h ? "on" : ""}">${icon(ic, 16)}<span><b>${l}</b><small>${d}</small></span></a>`).join("")}</div>
      </div>
    </nav>
    <div class="top-right">
      <button class="icon-btn search-btn" id="openSearch" aria-label="Search">${icon("search", 15)}<span>Search</span><kbd>⌘K</kbd></button>
      <span class="net-chip top-net" title="Robinhood Chain · 4663"><img class="chain-ic" src="/assets/robinhood.png" alt="" /><i></i></span>
      <div class="drop drop-r" id="setDrop"><button class="icon-btn" id="setToggle" aria-label="Settings">${icon("gear", 16)}</button>
        <div class="drop-menu card set-menu">${appearance}<nav class="set-links">${footLinks}</nav></div>
      </div>
      <button class="btn btn-primary top-connect" data-connect>${icon("wallet", 15)}<span>Connect wallet</span></button>
    </div>
  </div>`;
document.body.prepend(top);

if (page !== "index" && active !== "index") {
  const foot = document.createElement("footer");
  foot.className = "app-foot";
  foot.innerHTML = `<div class="app-foot-in"><span><b>Rigs</b> · composable markets, built with hooks · Robinhood Chain</span><nav><a href="/docs">Docs</a><a href="/updates">Updates</a>${footLinks}</nav></div>`;
  (document.querySelector(".app") || document.body).after(foot);
}

const tabs = document.createElement("nav");
tabs.className = "tabbar";
const TABS = [["app", "Coins", "discover"], ["launch", "Launch", "plus"], ["portfolio", "Earn", "portfolio"], ["auctions", "Auctions", "gavel"]];
tabs.innerHTML = TABS.map(([h, l, ic]) => `<a href="${url(h)}" class="${active === h ? "on" : ""}${h === "launch" ? " tab-launch" : ""}">${icon(ic, 20)}<span>${l}</span></a>`).join("")
  + `<button id="sheetOpen" class="${!TABS.some(([h]) => h === active) && active !== "index" ? "on" : ""}">${icon("dots", 20)}<span>More</span></button>`;
document.body.append(tabs);

const sheet = document.createElement("div");
sheet.className = "sheet";
sheet.innerHTML = `
  <div class="sheet-panel" role="dialog" aria-label="More">
    <div class="sheet-grab"></div>
    <div class="sheet-head"><b>More</b><button class="icon-btn" id="sheetClose" aria-label="Close">×</button></div>
    <div class="sheet-grid">${[["index", "Home", "home", "Start page"], ["gacha", "Gacha", "cards", "Coins that rip real packs"], ["builder", "Build", "builder", "Compose a hook"], ...MORE].map(([h, l, ic, d]) => `<a href="${url(h)}" class="${active === h ? "on" : ""}">${icon(ic, 18)}<span><b>${l}</b><small>${d}</small></span></a>`).join("")}</div>
    <div class="sheet-set">${appearance}</div>
    <nav class="set-links sheet-links">${footLinks}</nav>
  </div>`;
document.body.append(sheet);

const setSheet = (open) => document.body.classList.toggle("sheet-open", open);
tabs.querySelector("#sheetOpen").addEventListener("click", () => setSheet(true));
sheet.querySelector("#sheetClose").addEventListener("click", () => setSheet(false));
sheet.addEventListener("click", (e) => { if (e.target === sheet || e.target.closest("a")) setSheet(false); });
const drops = [...top.querySelectorAll(".drop")];
drops.forEach((d) => d.querySelector("button").addEventListener("click", (e) => {
  e.stopPropagation();
  const open = !d.classList.contains("open");
  drops.forEach((x) => x.classList.remove("open"));
  d.classList.toggle("open", open);
}));
document.addEventListener("click", (e) => { if (!e.target.closest(".drop-menu")) drops.forEach((x) => x.classList.remove("open")); });
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-theme-set]");
  const a = e.target.closest("[data-accent]");
  if (t) store.set("rigs-theme", t.dataset.themeSet);
  if (a) store.set("rigs-accent", a.dataset.accent);
  if (t || a) applyTheme();
});

// ---------------------------------------------------------------- search palette
const ALL = [...NAV, ...MORE, ...EXTRA.map(([h, l]) => [h, l, "doc"])];
const pal = document.createElement("div");
pal.className = "palette";
pal.hidden = true;
pal.innerHTML = `<div class="palette-box card"><input placeholder="Jump to a page, hook or token address…" /><div class="palette-list"></div></div>`;
document.body.append(pal);
const input = pal.querySelector("input");
const list = pal.querySelector(".palette-list");
const HOOKS = [["anti-snipe", "Launch Guard"], ["surge-fee", "Impact Fee"], ["auto-burn", "Buy Burn"], ["lp-rewards", "LP Boost"], ["nth-buy-pot", "Counter Pot"]];
function renderPalette() {
  const q = input.value.trim().toLowerCase();
  if (/^0x[0-9a-f]{40}$/i.test(q)) {
    list.innerHTML = `<a href="/scan?address=${q}">Scan ${q.slice(0, 10)}…</a><a href="/portfolio?token=${q}">Creator fees for token ${q.slice(0, 10)}…</a>`;
    return;
  }
  const pages = ALL.filter(([, l]) => l.toLowerCase().includes(q)).map(([h, l]) => `<a href="${h === "index" ? "/" : "/" + h}">${l}</a>`);
  const hooks = HOOKS.filter(([, n]) => n.toLowerCase().includes(q)).map(([h, n]) => `<a href="/hook?id=${h}">Rule · ${n}</a>`);
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
  document.querySelectorAll("[data-launch-count]").forEach((el) => { if (n != null) el.textContent = String(n); });
}).catch(() => {});
