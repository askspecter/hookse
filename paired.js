// Paired coins: a Pons coin whose creator fees buy NFTs (a Robinhood Chain collection) or
// Collector Crypt gacha packs (graded cards on Solana), then raffles them to holders.
// Contracts: engine/contracts/paired (from LaunchNFT). The keeper (keeper/) buys, records and delivers.
import {
  keccak256, toBytes, toHex, encodeAbiParameters, encodeFunctionData, getAddress, isAddress, parseAbi, zeroAddress, parseEventLogs,
} from "https://cdn.jsdelivr.net/npm/viem@2.21.0/+esm";
import { CONFIG } from "./config.js";

export const PAIRED = CONFIG.paired || {};
export const SOLANA_CHAIN = 792703809; // Relay's id for Solana, as stored in ExternalVault
export const POLICY = ["Raffle", "Hold", "Burn"];
export const pairedLive = isAddress(PAIRED.externalLauncher || "") || isAddress(PAIRED.launcher || "");
export const gachaLive = isAddress(PAIRED.externalLauncher || "");
export const MACHINES = PAIRED.machines || [];

/** Registry id of a Collector Crypt gacha machine: listed like a Solana collection. */
export const machineId = (code) => keccak256(toBytes(`collectorcrypt:${code}`));
export const machineOf = (id32) => MACHINES.find((m) => machineId(m.code) === String(id32).toLowerCase());
/** Same as ExternalLauncher.collectionKey(chainId, collection). */
export const collectionKey = (chainId, id32) =>
  getAddress(`0x${keccak256(encodeAbiParameters([{ type: "uint64" }, { type: "bytes32" }], [BigInt(chainId), id32])).slice(-40)}`);

// Struct names differ from web3.js's LaunchParams: viem caches parsed signatures by their text.
const LAUNCH_BASE = "string name; string symbol; string logo; string description; Socials socials; uint16 creatorTaxBps; uint256 launchConfigId; bytes32 expectedEconomics; bytes32 salt;";
export const PAIRED_ABI = {
  registry: parseAbi([
    "function setCollection(address collection, bool listed)",
    "function setMarketplace(address marketplace, bool allowed)",
    "function setKeeper(address keeper)",
    "function setTreasury(address treasury)",
    "function isCollection(address) view returns (bool)",
    "function isMarketplace(address) view returns (bool)",
    "function keeper() view returns (address)",
    "function treasury() view returns (address)",
    "function owner() view returns (address)",
  ]),
  launcher: parseAbi([
    "struct Socials { string twitter; string telegram; string discord; string website; string farcaster; }",
    `struct NftLaunchParams { ${LAUNCH_BASE} address collection; uint8 policy; }`,
    "function launch(NftLaunchParams p) payable returns (uint256 id)",
    "function launchCount() view returns (uint256)",
    "function launches(uint256) view returns (address token, address curve, address router, address vault, address collection, address creator)",
    "event Launched(uint256 indexed id, address indexed creator, address indexed collection, address token, address curve, address router, address vault, uint8 policy)",
  ]),
  extLauncher: parseAbi([
    "struct Socials { string twitter; string telegram; string discord; string website; string farcaster; }",
    `struct GachaLaunchParams { ${LAUNCH_BASE} uint64 chainId; bytes32 collection; bool isEvm; uint8 policy; }`,
    "function launch(GachaLaunchParams p) payable returns (uint256 id)",
    "function launchCount() view returns (uint256)",
    "function launches(uint256) view returns (address token, address curve, address router, address vault, address collection, address creator)",
    "event Launched(uint256 indexed id, address indexed creator, address indexed collection, uint64 chainId, address token, address curve, address router, address vault, uint8 policy)",
  ]),
  vault: parseAbi([
    "function policy() view returns (uint8)",
    "function externalCollection() view returns (bytes32)",
    "function collection() view returns (address)",
    "function pendingAmount() view returns (uint256)",
    "function pendingReadyAt() view returns (uint256)",
    "function totalWithdrawn() view returns (uint256)",
    "function totalSpent() view returns (uint256)",
    "function held(uint256) view returns (bool)",
    "function prizeOwedTo(uint256) view returns (address)",
    "function prizeDestination(uint256) view returns (bytes32)",
    "function setPrizeDestination(uint256 tokenId, bytes32 destination)",
    "function cancelWithdrawal()",
    "event Bought(address indexed marketplace, uint256 indexed tokenId, uint256 price)",
    "event PrizeOwed(uint256 indexed tokenId, address indexed to)",
    "event PrizeSent(uint256 indexed tokenId, address indexed to)",
    "event PrizeDelivered(uint256 indexed tokenId, address indexed to, bytes32 destination, bytes32 externalTx)",
  ]),
  router: parseAbi(["function pending() view returns (uint256)", "function harvest()"]),
  raffles: parseAbi([
    "struct Raffle { uint256 tokenId; bytes32 root; uint256 totalTickets; uint64 publishedAt; uint64 drawBlock; uint256 winningTicket; bool drawn; bool claimed; }",
    "function raffleCount(address vault) view returns (uint256)",
    "function raffles(address vault, uint256 id) view returns (Raffle)",
    "function claim(address vault, uint256 id, address account, uint256 start, uint256 end, bytes32[] proof)",
  ]),
  erc20: parseAbi(["function name() view returns (string)", "function symbol() view returns (string)"]),
};

// ------------------------------------------------------------------ base58 (Solana addresses)

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function b58ToHex32(s) {
  let n = 0n;
  for (const c of String(s).trim()) {
    const i = B58.indexOf(c);
    if (i < 0) throw new Error("Not a Solana address");
    n = n * 58n + BigInt(i);
  }
  const hex = n.toString(16).padStart(64, "0");
  if (hex.length !== 64 || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(s).trim())) throw new Error("Not a Solana address");
  return `0x${hex}`;
}
export function hex32ToB58(hex) {
  let n = BigInt(hex);
  let out = "";
  while (n > 0n) { out = B58[Number(n % 58n)] + out; n /= 58n; }
  const bytes = toBytes(hex);
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) out = "1" + out;
  return out;
}

// ------------------------------------------------------------------ reads

const json = (path) => fetch(path, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
const snapUrl = (f) => `${PAIRED.snapshotBaseUrl || "snapshots/"}${f}`;
/** What the keeper publishes: live machine data (price, odds, EV, stock) and pull receipts. */
export const liveMachines = () => json(`/${snapUrl("machines.json")}`);
export const pullReceipts = async () => (await json(`/${snapUrl("receipts.json")}`)) || [];
export const raffleSnapshot = (vault, id) => json(`/${snapUrl(`${vault.toLowerCase()}-${id}.json`)}`);

/** Every paired coin: gacha coins get ids e0, e1…; NFT coins 0, 1…. */
export async function pairedCoins(client) {
  const out = [];
  for (const [kind, address, abi] of [["nft", PAIRED.launcher, PAIRED_ABI.launcher], ["gacha", PAIRED.externalLauncher, PAIRED_ABI.extLauncher]]) {
    if (!isAddress(address || "")) continue;
    const n = Number(await client.readContract({ address, abi, functionName: "launchCount" }));
    const rows = await Promise.all(Array.from({ length: n }, (_, i) =>
      client.readContract({ address, abi, functionName: "launches", args: [BigInt(i)] }).then(async ([token, curve, router, vault, collection, creator]) => {
        const r = (fn) => client.readContract({ address: vault, abi: PAIRED_ABI.vault, functionName: fn }).catch(() => null);
        const e = (fn) => client.readContract({ address: token, abi: PAIRED_ABI.erc20, functionName: fn }).catch(() => "");
        const [policy, id32, name, symbol] = await Promise.all([r("policy"), kind === "gacha" ? r("externalCollection") : null, e("name"), e("symbol")]);
        return {
          id: `${kind === "gacha" ? "e" : ""}${i}`, kind, token, curve, router, vault, collection, creator, name, symbol,
          policy: POLICY[policy ?? 0], machine: id32 ? machineOf(id32) : null,
          nft: kind === "nft" ? (PAIRED.collections || []).find((c) => c.address.toLowerCase() === collection.toLowerCase()) : null,
        };
      })));
    out.push(...rows);
  }
  return out;
}

/** Vault state, pulls and raffles for one coin. */
export async function pairedDetail(client, c) {
  const r = (fn, args) => client.readContract({ address: c.vault, abi: PAIRED_ABI.vault, functionName: fn, args }).catch(() => 0n);
  const [balance, pendingFees, pending, readyAt, withdrawn, spent, bought, owed, delivered] = await Promise.all([
    client.getBalance({ address: c.vault }),
    client.readContract({ address: c.router, abi: PAIRED_ABI.router, functionName: "pending" }).catch(() => 0n),
    c.kind === "gacha" ? r("pendingAmount") : 0n,
    c.kind === "gacha" ? r("pendingReadyAt") : 0n,
    c.kind === "gacha" ? r("totalWithdrawn") : 0n,
    c.kind === "gacha" ? r("totalSpent") : 0n,
    events(client, c.vault, "Bought"),
    events(client, c.vault, "PrizeOwed"),
    events(client, c.vault, c.kind === "gacha" ? "PrizeDelivered" : "PrizeSent"),
  ]);
  const receipts = (await pullReceipts()).filter((x) => x.vault?.toLowerCase() === c.vault.toLowerCase());
  const pulls = bought.map((l) => {
    const tokenId = l.args.tokenId;
    const rc = receipts.find((x) => BigInt(x.tokenId) === tokenId) || {};
    const mint = c.kind === "gacha" ? hex32ToB58(toHex(tokenId, { size: 32 })) : null;
    const win = owed.find((o) => o.args.tokenId === tokenId);
    const done = delivered.find((o) => o.args.tokenId === tokenId);
    return { tokenId, mint, price: l.args.price, tx: l.transactionHash, name: rc.name, rarity: rc.rarity, image: rc.image, winner: win?.args.to || done?.args.to || null, delivered: !!done };
  }).reverse();

  const count = Number(await client.readContract({ address: PAIRED.raffles, abi: PAIRED_ABI.raffles, functionName: "raffleCount", args: [c.vault] }).catch(() => 0n));
  const raffles = await Promise.all(Array.from({ length: count }, (_, i) =>
    client.readContract({ address: PAIRED.raffles, abi: PAIRED_ABI.raffles, functionName: "raffles", args: [c.vault, BigInt(i)] }).then((x) => ({ id: i, ...x }))));
  return { balance, pendingFees, pending, readyAt, inFlight: withdrawn - spent, pulls, raffles: raffles.reverse() };
}

async function events(client, address, eventName) {
  return client.getContractEvents({ address, abi: PAIRED_ABI.vault, eventName, fromBlock: BigInt(PAIRED.startBlock || 0), toBlock: "latest" }).catch(() => []);
}

/** ETH one pack costs at today's price, with the keeper's 1% headroom (bridge fees are on top). */
export const packEth = (m, usd) => (usd > 0 && m ? (Number(m.priceUsd) / usd) * 1.01 : null);

// ------------------------------------------------------------------ writes

/**
 * Launches a paired coin on Pons. `target` is { machine } for a gacha coin or { collection } for an NFT coin.
 * Returns { id, token, vault, hash }.
 */
export async function launchPaired({ client, wallet, ponsAbi }, f, target) {
  const external = !!target.machine;
  const address = external ? PAIRED.externalLauncher : PAIRED.launcher;
  if (!isAddress(address || "")) throw new Error("Paired launches are not open yet");
  const [fee, economics] = await Promise.all([
    client.readContract({ address: CONFIG.ponsFactory, abi: ponsAbi, functionName: "launchFee" }),
    client.readContract({ address: CONFIG.ponsFactory, abi: ponsAbi, functionName: "previewLaunchEconomics", args: [0n, zeroAddress] }),
  ]);
  const base = {
    name: f.name.trim(), symbol: f.symbol, logo: f.logo, description: f.description.trim(),
    socials: { twitter: f.twitter || "", telegram: "", discord: "", website: f.website || "", farcaster: "" },
    creatorTaxBps: Number(f.taxBps), launchConfigId: 0n, expectedEconomics: economics,
    salt: toHex(crypto.getRandomValues(new Uint8Array(32))), policy: 0, // raffle every pull to holders
  };
  const abi = external ? PAIRED_ABI.extLauncher : PAIRED_ABI.launcher;
  const args = [external ? { ...base, chainId: BigInt(SOLANA_CHAIN), collection: machineId(target.machine.code), isEvm: false } : { ...base, collection: getAddress(target.collection) }];
  const req = { account: wallet.account, address, abi, functionName: "launch", args, value: fee };
  await client.simulateContract(req); // surfaces a revert reason before the wallet opens
  const gas = ((await client.estimateContractGas(req)) * 13n) / 10n;
  const hash = await wallet.sendTransaction({ account: wallet.account, to: address, value: fee, gas, data: encodeFunctionData({ abi, functionName: "launch", args }) });
  const rc = await client.waitForTransactionReceipt({ hash });
  if (rc.status !== "success") throw new Error(`Launch failed${rc.gasUsed >= 1_190_000n && rc.gasUsed <= 1_200_000n ? ": your wallet capped gas at 1.2M. Raise the gas limit to 4,000,000, or use MetaMask" : ""}. ${CONFIG.explorer}/tx/${hash}`);
  const [ev] = parseEventLogs({ abi, eventName: "Launched", logs: rc.logs });
  return { id: `${external ? "e" : ""}${ev.args.id}`, token: ev.args.token, vault: ev.args.vault, hash };
}

/** The raffle winner of a gacha pull saves the Solana wallet the card is sent to. */
export const setPrizeWallet = (write, vault, tokenId, solAddress) =>
  write({ address: vault, abi: PAIRED_ABI.vault, functionName: "setPrizeDestination", args: [tokenId, b58ToHex32(solAddress)] });
