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
export const v4live = isAddress(CONFIG.hookseLauncher || "") && isAddress(CONFIG.hookseHook || "");

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
  hookseLauncher: parseAbi([
    "struct Config { uint8 blocks; uint24 baseFee; uint32 snipeBlocks; uint24 snipeFee; uint128 snipeMaxBuy; uint24 surgeMaxFee; uint128 surgeRefSize; uint16 burnBps; uint16 lpBps; uint16 potBps; uint32 potEvery; uint128 potMinBuy; }",
    "struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }",
    "function launch(string name, string symbol, uint256 supply, int24 startTick, Config cfg) returns (address token, bytes32 id)",
    "function tokenCount() view returns (uint256)",
    "function tokens(uint256) view returns (address)",
    "function keyOf(address token) view returns (PoolKey)",
    "function launches(bytes32 id) view returns (address token, address creator, int24 tickLower, int24 tickUpper, uint128 liquidity)",
    "function collectCreatorFees(address token) returns (uint256 amount0, uint256 amount1)",
    "event Launched(address indexed token, address indexed creator, bytes32 indexed id, string name, string symbol, uint256 supply, int24 startTick)",
  ]),
  hookseHook: parseAbi([
    "struct Config { uint8 blocks; uint24 baseFee; uint32 snipeBlocks; uint24 snipeFee; uint128 snipeMaxBuy; uint24 surgeMaxFee; uint128 surgeRefSize; uint16 burnBps; uint16 lpBps; uint16 potBps; uint32 potEvery; uint128 potMinBuy; }",
    "function getPool(bytes32 id) view returns (Config cfg, uint64 launchBlock, uint64 buyCount)",
    "function owner() view returns (address)",
    "function launcher() view returns (address)",
    "function setLauncher(address)",
    "function setAuthor(uint8 blockIndex, address account, uint16 royaltyBps)",
    "function authors(uint8) view returns (address account, uint16 royaltyBps)",
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
  document.querySelectorAll("[data-connect]").forEach((b) => (b.textContent = account ? short(account) : "Connect wallet"));
  listeners.forEach((fn) => fn(account));
}
const remember = (v) => { try { v ? localStorage.setItem("hookse-wallet", v) : localStorage.removeItem("hookse-wallet"); } catch { /* blocked */ } };
const remembered = () => { try { return localStorage.getItem("hookse-wallet"); } catch { return null; } };

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
      metadata: { name: "Hookse", description: "Launch on Pons V2 and Uniswap v4 hooks", url: location.origin, icons: [] },
      features: { analytics: false, email: false, socials: false, swaps: false, onramp: false, send: false },
      allowUnsupportedChain: true,
      themeMode: "dark",
      themeVariables: { "--w3m-accent": "#fc72ff", "--w3m-font-family": "Geist, system-ui, sans-serif" },
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

/** Simulates (to surface revert reasons), sends from the connected wallet and waits. */
export async function write(req) {
  const wallet = await walletClient();
  const { request } = await client.simulateContract({ account: wallet.account, ...req });
  const hash = await wallet.writeContract(request);
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("Transaction reverted");
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
