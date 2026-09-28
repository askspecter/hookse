// Paired coins: a Pons coin whose creator fees buy NFTs (a Robinhood Chain collection) or
// Collector Crypt gacha packs (graded cards on Solana), then raffles them to holders.
import { keccak256, toBytes, encodeAbiParameters, getAddress, parseAbi } from "https://cdn.jsdelivr.net/npm/viem@2.21.0/+esm";
import { CONFIG } from "./config.js";

export const PAIRED = CONFIG.paired || {};
export const SOLANA_CHAIN = 792703809; // Relay's id for Solana, as stored in ExternalVault
export const POLICY = ["Raffle", "Hold", "Burn"];

/** Registry id of a Collector Crypt gacha machine: listed like a Solana collection. */
export const machineId = (code) => keccak256(toBytes(`collectorcrypt:${code}`));
/** Same as ExternalLauncher.collectionKey(chainId, collection). */
export const collectionKey = (chainId, id32) =>
  getAddress(`0x${keccak256(encodeAbiParameters([{ type: "uint64" }, { type: "bytes32" }], [BigInt(chainId), id32])).slice(-40)}`);

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
};
