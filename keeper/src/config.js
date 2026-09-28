import "dotenv/config";
import { parseEther, isAddress } from "viem";
import { readFileSync } from "node:fs";

// Addresses, machines and collections default to the site's config.js (paired block); env overrides.
// The site's package.json is CommonJS (Vercel functions), so config.js is loaded as a module from its text.
const siteConfig = readFileSync(new URL("../../config.js", import.meta.url), "utf8");
const { CONFIG } = await import(`data:text/javascript,${encodeURIComponent(siteConfig)}`);
const P = CONFIG.paired || {};

function req(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name} (see .env.example)`);
  return v;
}

export function loadConfig() {
  const cfg = {
    rpcUrl: process.env.RPC_URL || "https://rpc.mainnet.chain.robinhood.com",
    chainId: Number(process.env.CHAIN_ID || 4663),
    privateKey: req("KEEPER_PRIVATE_KEY"),
    launcher: process.env.LAUNCHER || P.launcher || "",
    externalLauncher: process.env.EXTERNAL_LAUNCHER || P.externalLauncher || "",
    collections: P.collections || [],
    machines: P.machines || [],
    gachaApiKey: process.env.COLLECTOR_CRYPT_API_KEY || "",
    gachaUrl: process.env.COLLECTOR_CRYPT_URL || "",
    solanaKey: process.env.KEEPER_SOLANA_KEY || "",
    solanaRpc: process.env.SOLANA_RPC || "",
    startBlock: BigInt(process.env.START_BLOCK || P.startBlock || 0),
    openseaApiKey: process.env.OPENSEA_API_KEY || "",
    sweepDisabled: process.env.SWEEP_DISABLED === "1",
    snapshotPort: Number(process.env.SNAPSHOT_PORT || process.env.PORT || 0),
    openseaChain: process.env.OPENSEA_CHAIN || "robinhood",
    seaport: process.env.SEAPORT || "0x0000000000000068F116a894984e2DB1123eB395",
    ceilingMarkupBps: BigInt(process.env.CEILING_MARKUP_BPS || 300),
    maxCeiling: parseEther(process.env.MAX_CEILING_ETH || "5"),
    minHarvest: parseEther(process.env.MIN_HARVEST_ETH || "0.005"),
    minTicketBalance: parseEther(process.env.MIN_TICKET_TOKENS || "0"),
    snapshotDir: process.env.SNAPSHOT_DIR || "../snapshots", // the site serves /snapshots/
    intervalSec: Number(process.env.INTERVAL_SEC || 60),
    dryRun: process.env.DRY_RUN === "1",
    logChunk: BigInt(process.env.LOG_CHUNK || 50_000),
  };
  if (cfg.launcher && !isAddress(cfg.launcher)) throw new Error("LAUNCHER is not an address");
  if (cfg.externalLauncher && !isAddress(cfg.externalLauncher)) throw new Error("EXTERNAL_LAUNCHER is not an address");
  return cfg;
}
