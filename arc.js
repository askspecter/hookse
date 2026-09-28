// Arc (Circle's chain) launches through Argus Portal #7, with the coin's Rigs ArgusVault as the Argus creator.
// The vault splits everything Argus credits the creator: 80% to the person who launched, 20% to the Rigs treasury.
import {
  createPublicClient, http, defineChain, parseAbi, isAddress, getAddress, keccak256, concat, pad, toHex,
  encodeAbiParameters, encodePacked, formatUnits, parseUnits, decodeEventLog,
} from "https://cdn.jsdelivr.net/npm/viem@2.21.0/+esm";
import { CONFIG, arcWalletClient, getAccount, withBuffer, connect } from "./web3.js";

export const ARC = CONFIG.arc || {};
export const arcChain = defineChain({
  id: ARC.chainId,
  name: ARC.chainName || "Arc",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [ARC.rpcUrl] } },
  blockExplorers: { default: { name: "ArcScan", url: ARC.explorer } },
});
// Arc RPCs refuse JSON-RPC batches (-32600), so every read is its own request.
export const arcClient = createPublicClient({ chain: arcChain, transport: http(ARC.rpcUrl, { batch: false, retryCount: 2 }) });
export const arcLive = isAddress(ARC.launcher || "") && isAddress(ARC.portal || "");

const TOTAL_SUPPLY = 10n ** 27n; // 1,000,000,000 coins, 18 decimals (Argus family constant)
const HOOK_FLAGS = 0x2044n; // Argus tax hook permission bits (bundle constants.hookFlags)

export const ARC_ABI = {
  portal: parseAbi([
    "function tokenCount() view returns (uint256)",
    "function getTokens(uint256 offset, uint256 limit) view returns (address[] page)",
    "function launches(address token) view returns (address creator, int24 tickStart, bool tokenIsToken0, address locker, address hook, address splitter, uint16 buyTaxBps, uint16 sellTaxBps, uint256 positionId, int24 tickBond, address quoteAsset)",
    "function predictSplitter(address creator, bytes32 salt) view returns (address)",
    "function hookInitCodeHash(address splitter_, uint16 buyTaxBps, uint16 sellTaxBps, address quote) view returns (bytes32)",
    "function hookCreate2Salt(address creator, bytes32 hookSalt) pure returns (bytes32)",
    "function predictHook(address creator, bytes32 salt, bytes32 hookSalt, uint16 buyTaxBps, uint16 sellTaxBps, address quote) view returns (address hook, uint160 mask, bool valid)",
    "function quoteApproved(address quote) view returns (bool)",
    "function treasuryBps() view returns (uint16)",
  ]),
  launcher: parseAbi([
    "struct ArgusLaunchParams { string name; string symbol; uint256 totalSupply; uint256 startFdvUsdc6; uint256 bondFdvUsdc6; uint16 buyTaxBps; uint16 sellTaxBps; uint16 creatorBps; uint16 burnBps; uint16 dividendBps; uint16 liquidityBps; uint256 devBuyQuote; address quoteAsset; uint8 expectConvert; }",
    "struct ArgusLaunchMeta { string imageURI; string website; string twitter; string telegram; string description; }",
    "function launch(ArgusLaunchParams p, ArgusLaunchMeta meta, bytes32 salt, bytes32 hookSalt) returns (uint256 id, address token)",
    "function vaultFor(address creator, bytes32 salt) view returns (address)",
    "function launchCount() view returns (uint256)",
    "function launches(uint256) view returns (address token, address vault, address creator, uint64 launchedAt)",
    "function launchesOf(address creator) view returns (uint256[])",
    "function logoOf(address token) view returns (string)",
    "function treasury() view returns (address)",
    "event Launched(uint256 indexed id, address indexed creator, address indexed token, address vault, uint256 devBuy)",
  ]),
  vault: parseAbi([
    "function release()",
    "function creator() view returns (address)",
    "function unsplit(address asset) view returns (uint256)",
    "function creatorOwed(address asset) view returns (uint256)",
    "function totalToCreator(address asset) view returns (uint256)",
    "function setCreator(address next)",
  ]),
  splitter: parseAbi([
    "function claimableQuote6(address account) view returns (uint256)",
    "function claimableUsdc6(address account) view returns (uint256)",
  ]),
  hook: parseAbi(["function poolId() view returns (bytes32)", "function bonded() view returns (bool)"]),
  stateView: parseAbi(["function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)"]),
  erc20: parseAbi([
    "function name() view returns (string)", "function symbol() view returns (string)",
    "function balanceOf(address) view returns (uint256)", "function allowance(address, address) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
  ]),
};

const read = (address, abi, functionName, args = []) => arcClient.readContract({ address, abi, functionName, args });
export const usdc6 = (v) => Number(formatUnits(v ?? 0n, 6));

/** Market cap in USDC of a 1B-supply coin at a v4 tick (quote = USDC, 6 decimals; coin 18 decimals). */
export function fdvAtTick(tick, tokenIsToken0) {
  const p = 1.0001 ** Number(tick); // currency1 per currency0, raw units
  const quotePerCoinRaw = tokenIsToken0 ? p : 1 / p;
  return (quotePerCoinRaw * 1e27) / 1e6;
}

/** Market cap in USDC from a pool's sqrtPriceX96. */
export function fdvAtSqrt(sqrtPriceX96, tokenIsToken0) {
  const s = Number(sqrtPriceX96) / 2 ** 96;
  const p = s * s;
  const quotePerCoinRaw = tokenIsToken0 ? p : 1 / p;
  return (quotePerCoinRaw * 1e27) / 1e6;
}

/**
 * The starting and bonding market caps of the most recent USDC launch on Argus Portal #7, so Rigs launches open
 * on the same curve as ArgusPad's own. Returns FDVs in USDC and as raw 6-decimal amounts.
 */
export async function argusCurve() {
  const count = Number(await read(ARC.portal, ARC_ABI.portal, "tokenCount"));
  if (!count) throw new Error("No Argus launches to copy the curve from");
  const from = Math.max(0, count - 8);
  const tokens = (await read(ARC.portal, ARC_ABI.portal, "getTokens", [BigInt(from), BigInt(count - from)])).reverse();
  for (const t of tokens) {
    const r = await read(ARC.portal, ARC_ABI.portal, "launches", [t]).catch(() => null);
    if (!r || r[10].toLowerCase() !== ARC.usdc.toLowerCase()) continue;
    const a = fdvAtTick(r[1], r[2]);
    const b = fdvAtTick(r[9], r[2]);
    const start = Math.min(a, b), bond = Math.max(a, b);
    if (!(start > 0 && bond > start)) continue;
    return { start, bond, startRaw: BigInt(Math.round(start * 1e6)), bondRaw: BigInt(Math.round(bond * 1e6)), from: t };
  }
  throw new Error("Could not read a recent Argus launch curve");
}

const create2 = (deployer, salt, hash) => getAddress(`0x${keccak256(concat(["0xff", deployer, salt, hash])).slice(-40)}`);
const SALT_FORMULAS = [
  (c, h) => keccak256(encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [c, h])),
  (c, h) => keccak256(encodePacked(["address", "bytes32"], [c, h])),
  (_c, h) => h,
];

/**
 * Finds a hookSalt that puts this launch's tax hook on an address carrying the Argus permission bits.
 * The Portal's own salt formula and deployer are confirmed against predictHook before mining, and the result is
 * confirmed again (valid == true) before it is used.
 */
export async function mineHookSalt({ creator, salt, buyTaxBps, sellTaxBps, quote }, onProgress = () => {}) {
  const splitter = await read(ARC.portal, ARC_ABI.portal, "predictSplitter", [creator, salt]);
  const codeHash = await read(ARC.portal, ARC_ABI.portal, "hookInitCodeHash", [splitter, buyTaxBps, sellTaxBps, quote]);
  const probe = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const [probeSalt, [probeHook, mask]] = await Promise.all([
    read(ARC.portal, ARC_ABI.portal, "hookCreate2Salt", [creator, probe]),
    read(ARC.portal, ARC_ABI.portal, "predictHook", [creator, salt, probe, buyTaxBps, sellTaxBps, quote]),
  ]);
  const formula = SALT_FORMULAS.find((f) => f(creator, probe) === probeSalt);
  if (!formula) throw new Error("Unexpected Argus hook salt format; launching is paused for safety");
  const deployer = [ARC.portal].find((d) => create2(d, probeSalt, codeHash) === getAddress(probeHook));
  if (!deployer) throw new Error("Unexpected Argus hook deployer; launching is paused for safety");

  const targets = [...new Set([BigInt(mask) & 0x3fffn, HOOK_FLAGS].filter((x) => x !== 0n && x !== 0x3fffn))];
  const prefix = concat(["0xff", deployer]);
  let tried = 0;
  for (const target of targets) {
    for (let i = 0n; i < 2_000_000n; i++) {
      const hookSalt = pad(toHex(i), { size: 32 });
      const addr = `0x${keccak256(concat([prefix, formula(creator, hookSalt), codeHash])).slice(-40)}`;
      tried++;
      if ((BigInt(addr) & 0x3fffn) === target) {
        const [hook, , valid] = await read(ARC.portal, ARC_ABI.portal, "predictHook", [creator, salt, hookSalt, buyTaxBps, sellTaxBps, quote]);
        if (valid && getAddress(hook) === getAddress(addr)) return { hookSalt, hook: getAddress(addr) };
        break; // this bit pattern is not what the Portal wants; try the next interpretation
      }
      if (i % 3000n === 0n) { onProgress(tried); await new Promise((r) => setTimeout(r)); }
    }
  }
  throw new Error("Could not find a valid hook address");
}

async function arcWrite(wallet, req) {
  const { request } = await arcClient.simulateContract({ account: wallet.account, ...req });
  const gas = withBuffer(await arcClient.estimateContractGas({ account: wallet.account, ...req }));
  const hash = await wallet.writeContract({ ...request, gas });
  const rc = await arcClient.waitForTransactionReceipt({ hash });
  if (rc.status !== "success") throw new Error(`Transaction failed. Details: ${ARC.explorer}/tx/${hash}`);
  return rc;
}

/**
 * Launches on Argus through the Rigs launcher. f: {name, symbol, description, logo, website, twitter, telegram,
 * buyTaxBps, sellTaxBps, burnBps, devBuy (USDC string)}.
 */
export async function launchOnArc(f, onStep = () => {}) {
  if (!arcLive) throw new Error("Arc launches are not open yet");
  if (!getAccount()) await connect();
  const creator = getAccount();
  onStep("Reading the current Argus curve…");
  const curve = await argusCurve();
  const salt = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const vault = await read(ARC.launcher, ARC_ABI.launcher, "vaultFor", [creator, salt]);
  const buyTaxBps = Number(f.buyTaxBps), sellTaxBps = Number(f.sellTaxBps), burnBps = Number(f.burnBps || 0);
  onStep("Finding the hook address…");
  const { hookSalt } = await mineHookSalt({ creator: vault, salt, buyTaxBps, sellTaxBps, quote: ARC.usdc },
    (n) => onStep(`Finding the hook address… ${n.toLocaleString("en-US")} tried`));

  const devBuy = f.devBuy ? parseUnits(String(f.devBuy), 6) : 0n;
  onStep("Switch to Arc in your wallet…");
  const wallet = await arcWalletClient(arcChain);
  if (devBuy > 0n) {
    const allowed = await read(ARC.usdc, ARC_ABI.erc20, "allowance", [creator, ARC.launcher]);
    if (allowed < devBuy) {
      onStep("Approve the dev buy (USDC)…");
      await arcWrite(wallet, { address: ARC.usdc, abi: ARC_ABI.erc20, functionName: "approve", args: [ARC.launcher, devBuy] });
    }
  }
  const p = {
    name: f.name, symbol: f.symbol, totalSupply: TOTAL_SUPPLY, startFdvUsdc6: curve.startRaw, bondFdvUsdc6: curve.bondRaw,
    buyTaxBps, sellTaxBps, creatorBps: 10_000 - burnBps, burnBps, dividendBps: 0, liquidityBps: 0,
    devBuyQuote: devBuy, quoteAsset: ARC.usdc, expectConvert: 1,
  };
  const meta = { imageURI: f.logo, website: f.website || "", twitter: f.twitter || "", telegram: f.telegram || "", description: f.description || "" };
  onStep("Confirm the launch in your wallet…");
  const rc = await arcWrite(wallet, { address: ARC.launcher, abi: ARC_ABI.launcher, functionName: "launch", args: [p, meta, salt, hookSalt] });
  for (const log of rc.logs) {
    try {
      const ev = decodeEventLog({ abi: ARC_ABI.launcher, data: log.data, topics: log.topics });
      if (ev.eventName === "Launched") return { token: ev.args.token, vault: ev.args.vault, hash: rc.transactionHash };
    } catch { /* another contract's log */ }
  }
  return { token: null, vault, hash: rc.transactionHash };
}

/** One Rigs coin on Arc: record, symbol, logo, market cap (USDC = USD) and bonding state. */
async function arcCoin(id) {
  const [token, vault, creator, launchedAt] = await read(ARC.launcher, ARC_ABI.launcher, "launches", [BigInt(id)]);
  const [name, symbol, logo, rec] = await Promise.all([
    read(token, ARC_ABI.erc20, "name").catch(() => ""),
    read(token, ARC_ABI.erc20, "symbol").catch(() => ""),
    read(ARC.launcher, ARC_ABI.launcher, "logoOf", [token]).catch(() => ""),
    read(ARC.portal, ARC_ABI.portal, "launches", [token]).catch(() => null),
  ]);
  let marketCap = null, bonded = false;
  if (rec) {
    const hook = rec[4];
    const [poolId, isBonded] = await Promise.all([
      read(hook, ARC_ABI.hook, "poolId").catch(() => null),
      read(hook, ARC_ABI.hook, "bonded").catch(() => false),
    ]);
    bonded = !!isBonded;
    if (poolId) {
      const slot = await read(ARC.stateView, ARC_ABI.stateView, "getSlot0", [poolId]).catch(() => null);
      if (slot && slot[0] > 0n) marketCap = fdvAtSqrt(slot[0], rec[2]);
    }
  }
  return { id, token, vault, creator, launchedAt: Number(launchedAt), name, symbol, logo, marketCap, bonded, splitter: rec?.[5], buyTaxBps: rec?.[6], sellTaxBps: rec?.[7] };
}

/** The newest Rigs coins on Arc (up to `limit`), or [] when Arc is not live or unreachable. */
export async function loadArcCoins(limit = 60) {
  if (!arcLive) return [];
  try {
    const n = Number(await read(ARC.launcher, ARC_ABI.launcher, "launchCount"));
    const ids = [];
    for (let i = n - 1; i >= 0 && ids.length < limit; i--) ids.push(i);
    const out = [];
    for (let i = 0; i < ids.length; i += 6) out.push(...(await Promise.all(ids.slice(i, i + 6).map((id) => arcCoin(id).catch(() => null)))));
    return out.filter(Boolean);
  } catch {
    return [];
  }
}

/** Creator earnings of one Arc coin, in USDC: what a release would pay the creator now, and paid so far. */
export async function arcEarnings(coin) {
  const [unsplit, owed, paid, credited] = await Promise.all([
    read(coin.vault, ARC_ABI.vault, "unsplit", [ARC.usdc]).catch(() => 0n),
    read(coin.vault, ARC_ABI.vault, "creatorOwed", [ARC.usdc]).catch(() => 0n),
    read(coin.vault, ARC_ABI.vault, "totalToCreator", [ARC.usdc]).catch(() => 0n),
    coin.splitter ? read(coin.splitter, ARC_ABI.splitter, "claimableQuote6", [coin.vault]).catch(() => 0n) : 0n,
  ]);
  return { claimable: usdc6(owed) + usdc6(unsplit + credited) * 0.8, paid: usdc6(paid) - usdc6(owed) };
}

export async function myArcCoins(account) {
  if (!arcLive || !account) return [];
  const ids = await read(ARC.launcher, ARC_ABI.launcher, "launchesOf", [account]).catch(() => []);
  return (await Promise.all(ids.map((id) => arcCoin(Number(id)).catch(() => null)))).filter(Boolean);
}

/** Claims the coin's creator share from Argus and splits it: 80% to the creator, 20% to Rigs. Anyone may call. */
export async function releaseArc(vault) {
  const wallet = await arcWalletClient(arcChain);
  return arcWrite(wallet, { address: vault, abi: ARC_ABI.vault, functionName: "release" });
}
