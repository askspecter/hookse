// Wallet + chain helpers shared by the launch and claim pages.
import {
  createPublicClient, createWalletClient, custom, http, defineChain, parseAbi,
  formatEther, parseEther, isAddress, toHex, getAddress, zeroAddress,
} from "https://cdn.jsdelivr.net/npm/viem@2.21.0/+esm";
import { CONFIG } from "./config.js";

export { CONFIG, formatEther, parseEther, isAddress, toHex, getAddress, zeroAddress };

export const chain = defineChain({
  id: CONFIG.chainId,
  name: CONFIG.chainName,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [CONFIG.rpcUrl] } },
  blockExplorers: { default: { name: "Blockscout", url: CONFIG.explorer } },
});
export const client = createPublicClient({ chain, transport: http() });
export const live = isAddress(CONFIG.ponsLauncher || "");
export const v4live = isAddress(CONFIG.rigsLauncher || "") && isAddress(CONFIG.rigsHook || "");
export const auctionsLive = isAddress(CONFIG.rigsAuctions || "");
export const routerLive = isAddress(CONFIG.rigsRouter || "");

export const ABI = {
  pons: parseAbi([
    "function launchFee() view returns (uint256)",
    "function maxCreatorTaxBps() view returns (uint16)",
    "function previewLaunchEconomics(uint256 launchConfigId, address pairToken) view returns (bytes32)",
  ]),
  launcher: parseAbi([
    "struct Socials { string twitter; string telegram; string discord; string website; string farcaster; }",
    "struct LaunchParams { string name; string symbol; string logo; string description; Socials socials; uint16 creatorTaxBps; uint256 launchConfigId; bytes32 expectedEconomics; bytes32 salt; uint256 minTokensOut; }",
    "function launch(LaunchParams p) payable returns (uint256)",
    "function launchCount() view returns (uint256)",
    "function launches(uint256) view returns (address token, address curve, address splitter, address creator, uint64 launchedAt)",
    "function launchesOf(address creator) view returns (uint256[])",
    "function idOf(address token) view returns (uint256)",
    "event Launched(uint256 indexed id, address indexed creator, address indexed token, address curve, address splitter, uint256 devBuy)",
  ]),
  splitter: parseAbi([
    "function creator() view returns (address)",
    "function claimable() view returns (uint256)",
    "function pending() view returns (uint256)",
    "function creatorOwed() view returns (uint256)",
    "function totalToCreator() view returns (uint256)",
    "function totalToTreasury() view returns (uint256)",
    "function harvest()",
    "function claim() returns (uint256)",
    "function setCreator(address next)",
  ]),
  erc20: parseAbi(["function name() view returns (string)", "function symbol() view returns (string)"]),
  rigsLauncher: parseAbi([
    "struct Config { uint8 blocks; uint24 baseFee; uint32 snipeBlocks; uint24 snipeFee; uint128 snipeMaxBuy; uint24 surgeMaxFee; uint128 surgeRefSize; uint16 burnBps; uint16 lpBps; uint16 potBps; uint32 potEvery; uint128 potMinBuy; }",
    "struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }",
    "function launch(string name, string symbol, uint256 supply, int24 startTick, Config cfg) returns (address token, bytes32 id)",
    "function tokenCount() view returns (uint256)",
    "function tokens(uint256) view returns (address)",
    "function keyOf(address token) view returns (PoolKey)",
    "function launches(bytes32 id) view returns (address token, address creator, int24 tickLower, int24 tickUpper, uint128 liquidity, bool existing)",
    "function openExisting(address token, uint256 amount, int24 startTick, Config cfg) returns (bytes32 id)",
    "function collectCreatorFees(address token) returns (uint256 amount0, uint256 amount1)",
    "event Launched(address indexed token, address indexed creator, bytes32 indexed id, string name, string symbol, uint256 supply, int24 startTick)",
  ]),
  rigsRouter: parseAbi([
    "struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }",
    "function buy(PoolKey key, uint256 minOut, address recipient) payable returns (uint256 out)",
    "function sell(PoolKey key, uint256 amountIn, uint256 minOut, address recipient) returns (uint256 out)",
  ]),
  ponsCurve: parseAbi([
    "function buy(uint256 quoteIn, uint256 minTokensOut, address recipient) payable returns (uint256 tokensOut)",
    "function sell(uint256 tokensIn, uint256 minQuoteOut, address recipient) returns (uint256 quoteOut)",
  ]),
  poolManager: parseAbi([
    "function extsload(bytes32 slot) view returns (bytes32)",
    "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)",
  ]),
  rigsAuctions: parseAbi([
    "struct Auction { address seller; address token; uint128 amount; uint128 sold; uint128 startPrice; uint128 floorPrice; uint64 start; uint64 end; uint128 proceeds; bool unsoldWithdrawn; }",
    "function create(address token, uint256 amount, uint256 startPrice, uint256 floorPrice, uint64 start, uint64 duration) returns (uint256)",
    "function buy(uint256 id, uint256 tokens) payable returns (uint256 bought, uint256 cost)",
    "function end(uint256 id)",
    "function withdraw(uint256 id) returns (uint256 eth, uint256 tokens)",
    "function priceOf(uint256 id) view returns (uint256)",
    "function quote(uint256 id, uint256 tokens) view returns (uint256)",
    "function auctions(uint256 id) view returns (Auction)",
    "function auctionCount() view returns (uint256)",
  ]),
  erc20Full: parseAbi([
    "function name() view returns (string)", "function symbol() view returns (string)", "function decimals() view returns (uint8)",
    "function balanceOf(address) view returns (uint256)", "function allowance(address owner, address spender) view returns (uint256)",
    "function totalSupply() view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
  ]),
  rigsHook: parseAbi([
    "struct Config { uint8 blocks; uint24 baseFee; uint32 snipeBlocks; uint24 snipeFee; uint128 snipeMaxBuy; uint24 surgeMaxFee; uint128 surgeRefSize; uint16 burnBps; uint16 lpBps; uint16 potBps; uint32 potEvery; uint128 potMinBuy; }",
    "function getPool(bytes32 id) view returns (Config cfg, uint64 launchBlock, uint64 buyCount)",
    "function owner() view returns (address)",
    "function launcher() view returns (address)",
    "function setLauncher(address)",
    "function setAuthor(uint8 blockIndex, address account, uint16 royaltyBps)",
    "function authors(uint8) view returns (address account, uint16 royaltyBps)",
    "function claimable(address account, address currency) view returns (uint256)",
    "function claim(address currency) returns (uint256)",
    "function pot(bytes32 id, address currency) view returns (uint256)",
  ]),
};

// ---------------------------------------------------------------- small helpers

export const $ = (s, r = document) => r.querySelector(s);
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
export const eth = (wei, d = 4) => {
  const n = Number(formatEther(wei ?? 0n));
  return n === 0 ? "0" : n < 10 ** -d ? `<${10 ** -d}` : n.toLocaleString("en-US", { maximumFractionDigits: d });
};
/**
 * Price with the leading zeros collapsed, like 0.0₈1715 for 0.000000001715.
 * Numbers at or above 0.001 print normally with `sig` significant digits.
 */
export function fmtPrice(n, sig = 4) {
  if (n == null || !isFinite(n)) return "—";
  if (n === 0) return "0";
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 0.001) return String(+n.toPrecision(sig));
  // zeros between "0." and the first significant digit
  const zeros = -Math.floor(Math.log10(n)) - 1;
  const digits = String(Math.round(n * 10 ** (zeros + sig))).slice(0, sig).replace(/0+$/, "") || "0";
  const sub = String(zeros).split("").map((d) => "₀₁₂₃₄₅₆₇₈₉"[d]).join("");
  return `0.0${sub}${digits}`;
}

export const CHAIN_LOGO = "/assets/robinhood.png";

// ---------------------------------------------------------------- coin details (logo, one-liner)

const metaCache = new Map();
/** Logo/description for tokens from /api/meta (cached per page). Missing API → empty details. */
export async function loadMeta(tokens) {
  const want = [...new Set(tokens.map((t) => t.toLowerCase()))].filter((t) => !metaCache.has(t));
  for (let i = 0; i < want.length; i += 50) {
    const part = want.slice(i, i + 50);
    const json = await fetch(`/api/meta?tokens=${part.join(",")}`).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
    part.forEach((t) => metaCache.set(t, json[t] || {}));
  }
  return Object.fromEntries(tokens.map((t) => [t.toLowerCase(), metaCache.get(t.toLowerCase()) || {}]));
}
export const metaOf = (token) => metaCache.get(String(token).toLowerCase()) || {};

const metaMessage = (token, logo, description, time) =>
  `Rigs: set the details for coin ${token.toLowerCase()}\nLogo: ${logo || "none"}\nDescription: ${description || "none"}\nTime: ${time}`;

/** Creator signs and saves a coin's logo and one-liner (checked on the server against the chain). */
export async function saveMeta(token, { logo = "", description = "" }) {
  const wallet = await walletClient();
  const time = Math.floor(Date.now() / 1000);
  const signature = await wallet.signMessage({ account: wallet.account, message: metaMessage(token, logo, description, time) });
  const res = await fetch("/api/meta", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, logo, description, time, signature }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Could not save (${res.status})`);
  metaCache.set(token.toLowerCase(), json);
  return json;
}

/** Round coin avatar: the coin's logo when it has one, else its initials. */
export function coinAvatar(symbol, logo, cls = "av") {
  const init = esc(String(symbol || "?").slice(0, 2));
  return /^https:\/\//.test(logo || "") ? `<div class="${cls}"><img src="${esc(logo)}" alt="" loading="lazy" onerror="this.replaceWith('${init}')" /></div>` : `<div class="${cls}">${init}</div>`;
}

export const addrLink = (a) => `<a class="mono" href="${CONFIG.explorer}/address/${a}" target="_blank" rel="noopener">${short(a)}</a>`;

let toastTimer;
export function toast(msg) {
  let t = $("#toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; document.body.append(t); }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3600);
}

export function friendlyError(err) {
  const m = err?.shortMessage || err?.message || String(err);
  if (/User rejected|denied/i.test(m)) return "Cancelled in wallet";
  if (/insufficient funds/i.test(m)) return "Not enough ETH for this transaction";
  return m.split("\n")[0].slice(0, 180);
}

// ---------------------------------------------------------------- wallet

let account = null;
let provider = null;
const listeners = new Set();
export const getAccount = () => account;
export const onAccount = (fn) => { listeners.add(fn); fn(account); };

function setAccount(addr) {
  try { account = addr ? getAddress(String(addr).split(":").pop()) : null; } catch { account = null; }
  // Buttons with an icon keep it and only swap their <span> label.
  document.querySelectorAll("[data-connect]").forEach((b) => ((b.querySelector("span") || b).textContent = account ? short(account) : "Connect wallet"));
  listeners.forEach((fn) => fn(account));
}
const remember = (v) => { try { v ? localStorage.setItem("rigs-wallet", v) : localStorage.removeItem("rigs-wallet"); } catch { /* blocked */ } };
const remembered = () => { try { return localStorage.getItem("rigs-wallet"); } catch { return null; } };

const NETWORK = {
  id: CONFIG.chainId, name: CONFIG.chainName, chainNamespace: "eip155", caipNetworkId: `eip155:${CONFIG.chainId}`,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [CONFIG.rpcUrl] } },
  blockExplorers: { default: { name: "Blockscout", url: CONFIG.explorer } },
};
let kitPromise = null;
function appKit() {
  kitPromise ||= import("https://cdn.jsdelivr.net/npm/@reown/appkit-cdn@1.8.24/dist/appkit.js").then(({ createAppKit, WagmiAdapter }) => {
    const projectId = CONFIG.reownProjectId;
    const kit = createAppKit({
      adapters: [new WagmiAdapter({ projectId, networks: [NETWORK] })], networks: [NETWORK], defaultNetwork: NETWORK, projectId,
      metadata: { name: "Rigs", description: "Open Rigs pools on Uniswap v4 and Pons V2", url: location.origin, icons: [new URL("/assets/icon-512.png", location.href).href] },
      features: { analytics: false, email: false, socials: false, swaps: false, onramp: false, send: false },
      allowUnsupportedChain: true,
      themeMode: "dark",
      themeVariables: { "--w3m-accent": "#1591ff", "--w3m-font-family": "\"Geist Mono\", ui-monospace, monospace" },
    });
    kit.subscribeAccount((s) => {
      if (s.isConnected && s.address) {
        provider = kit.getWalletProvider?.() || provider;
        remember("reown");
        if (s.address.toLowerCase() !== account?.toLowerCase()) setAccount(s.address);
      } else if (!s.isConnected && account) { provider = null; remember(null); setAccount(null); }
    });
    kit.subscribeProviders?.((p) => { if (p?.eip155) provider = p.eip155; });
    return kit;
  });
  return kitPromise;
}

async function connectReown() {
  const kit = await appKit();
  if (!account) {
    await new Promise((resolve, reject) => {
      let opened = false;
      const unsubs = [];
      const done = (fn) => { unsubs.forEach((u) => typeof u === "function" && u()); fn(); };
      unsubs.push(kit.subscribeAccount((s) => { if (s.isConnected && s.address) done(resolve); }));
      unsubs.push(kit.subscribeState((s) => {
        if (s.open) opened = true;
        else if (opened && !account) done(() => reject(new Error("Wallet connection cancelled")));
      }));
      kit.open();
    });
  }
  provider = kit.getWalletProvider?.() || provider;
  return account;
}

async function connectInjected() {
  if (!window.ethereum) throw new Error("No wallet found — install a browser wallet");
  const [acc] = await window.ethereum.request({ method: "eth_requestAccounts" });
  provider = window.ethereum;
  remember("injected");
  setAccount(acc);
  return account;
}

export const connect = () => (CONFIG.reownProjectId ? connectReown() : connectInjected());

async function ensureChain(transport) {
  const hex = await transport.request({ method: "eth_chainId" }).catch(() => null);
  if (hex && Number(hex) === CONFIG.chainId) return;
  try {
    await transport.request({ method: "wallet_switchEthereumChain", params: [{ chainId: toHex(CONFIG.chainId) }] });
  } catch (err) {
    if (err?.code !== 4902) throw new Error(`Switch your wallet to ${CONFIG.chainName} and try again.`);
    await transport.request({
      method: "wallet_addEthereumChain",
      params: [{ chainId: toHex(CONFIG.chainId), chainName: CONFIG.chainName, rpcUrls: [CONFIG.rpcUrl],
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, blockExplorerUrls: [CONFIG.explorer] }],
    });
  }
}

export async function walletClient() {
  if (!account) await connect();
  const transport = provider || window.ethereum;
  if (!transport) throw new Error("No wallet connected");
  const accs = await transport.request({ method: "eth_accounts" }).catch(() => []);
  if (accs?.[0] && accs[0].toLowerCase() !== account?.toLowerCase()) setAccount(accs[0]);
  if (!account) throw new Error("Connect your wallet first.");
  await ensureChain(transport);
  return createWalletClient({ account, chain, transport: custom(transport) });
}

// Some mobile wallets silently cap a transaction's gas at 1.2M; a revert right at that number means the cap hit.
const WALLET_CAP = 1_200_000n;
export function failedTxError(receipt, what = "Transaction") {
  const link = `${CONFIG.explorer}/tx/${receipt.transactionHash}`;
  if (receipt.gasUsed >= WALLET_CAP - 20_000n && receipt.gasUsed <= WALLET_CAP) {
    return Object.assign(new Error(`${what} ran out of gas: your wallet capped the gas limit at 1.2M. Raise the gas limit in the wallet (to at least ${receipt.gasLimitNeeded ?? "the suggested amount"}), or use MetaMask. ${link}`), { link });
  }
  return Object.assign(new Error(`${what} failed. Details: ${link}`), { link });
}

/** Gas estimate plus 25%, passed explicitly so wallets do not pick their own (lower) limit. */
export const withBuffer = (g) => (g * 125n) / 100n;

/** Simulates (to surface revert reasons), sends from the connected wallet and waits. */
export async function write(req) {
  const wallet = await walletClient();
  const { request } = await client.simulateContract({ account: wallet.account, ...req });
  const gas = withBuffer(await client.estimateContractGas({ account: wallet.account, ...req }));
  const hash = await wallet.writeContract({ ...request, gas });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw failedTxError(Object.assign(receipt, { gasLimitNeeded: gas.toLocaleString("en-US") }));
  return receipt;
}

// Wire every [data-connect] button and restore a previous session quietly.
document.querySelectorAll("[data-connect]").forEach((b) =>
  b.addEventListener("click", () => (account && CONFIG.reownProjectId ? appKit().then((k) => k.open()) : connect()).catch((e) => toast(friendlyError(e)))),
);
if (remembered() === "reown" && CONFIG.reownProjectId) (window.requestIdleCallback || setTimeout)(() => appKit().catch(() => {}));
if (remembered() === "injected" && window.ethereum) {
  window.ethereum.request({ method: "eth_accounts" }).then((a) => { if (a?.[0]) { provider = window.ethereum; setAccount(a[0]); } }).catch(() => {});
}
window.ethereum?.on?.("accountsChanged", (a) => setAccount(a?.[0] || null));

// ---------------------------------------------------------------- launches

/** Reads name/symbol/decimals of any ERC-20 (null fields if it does not answer). */
export async function tokenInfo(address) {
  const r = (functionName) => client.readContract({ address, abi: ABI.erc20Full, functionName }).catch(() => null);
  const [name, symbol, decimals] = await Promise.all([r("name"), r("symbol"), r("decimals")]);
  return { address, name, symbol, decimals: decimals ?? 18 };
}

/** Approves `spender` for `amount` if the current allowance is lower. */
export async function ensureAllowance(token, spender, amount) {
  const allowed = await client.readContract({ address: token, abi: ABI.erc20Full, functionName: "allowance", args: [getAccount(), spender] });
  if (allowed >= amount) return;
  await write({ address: token, abi: ABI.erc20Full, functionName: "approve", args: [spender, amount] });
}

export async function loadLaunch(id) {
  const [token, curve, splitter, creatorAtLaunch, launchedAt] = await client.readContract({
    address: CONFIG.ponsLauncher, abi: ABI.launcher, functionName: "launches", args: [BigInt(id)],
  });
  const r = (address, abi, functionName) => client.readContract({ address, abi, functionName }).catch(() => null);
  const [name, symbol, creator, claimable, totalToCreator, totalToTreasury] = await Promise.all([
    r(token, ABI.erc20, "name"), r(token, ABI.erc20, "symbol"), r(splitter, ABI.splitter, "creator"),
    r(splitter, ABI.splitter, "claimable"), r(splitter, ABI.splitter, "totalToCreator"), r(splitter, ABI.splitter, "totalToTreasury"),
  ]);
  return { id: Number(id), token, curve, splitter, creatorAtLaunch, creator, launchedAt: Number(launchedAt), name, symbol,
    claimable: claimable ?? 0n, totalToCreator: totalToCreator ?? 0n, totalToTreasury: totalToTreasury ?? 0n };
}
