// Checks the Collector Crypt partner key and, with PULL=1, rips one real pack with the keeper's
// Solana wallet. Use DEVNET=1 first (devnet USDC: https://spl-token-faucet.com/?token-name=USDC-Dev).
//   COLLECTOR_CRYPT_API_KEY=… DEVNET=1 npm run gacha-check
//   COLLECTOR_CRYPT_API_KEY=… DEVNET=1 PULL=1 MACHINE=pokemon_50 KEEPER_SOLANA_KEY=… npm run gacha-check
import "dotenv/config";
import { Gacha, GACHA_URL } from "../src/gacha.js";
import { log } from "../src/log.js";

const devnet = process.env.DEVNET === "1";
const gacha = new Gacha({ apiKey: process.env.COLLECTOR_CRYPT_API_KEY, baseUrl: devnet ? GACHA_URL.devnet : GACHA_URL.mainnet, log });
const machines = await gacha.machines();
log(`key works on ${devnet ? "devnet" : "mainnet"}. Machines:`);
console.log(JSON.stringify(machines, null, 2).slice(0, 4000));

if (process.env.PULL === "1") {
  const { SolanaSide } = await import("../src/solana.js");
  const solana = new SolanaSide({ secretKey: process.env.KEEPER_SOLANA_KEY, rpc: process.env.SOLANA_RPC || (devnet ? "https://api.devnet.solana.com" : undefined) });
  const code = process.env.MACHINE || "pokemon_50";
  log(`pulling one ${code} pack with ${solana.address}…`);
  const r = await gacha.pull(code, solana, process.env.DRY_RUN === "1");
  console.log(r);
}
