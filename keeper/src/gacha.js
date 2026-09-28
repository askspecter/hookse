// Collector Crypt gacha machine client (docs.collectorcrypt.com/gacha/api).
// Flow per pack: generatePack (a USDC payment transaction partly signed by Collector Crypt)
// → the keeper's Solana wallet signs it → submitTransaction → openPack sends the pulled card
// NFT to the keeper wallet. Every request carries the partner key in `x-api-key`.
import { Transaction, VersionedTransaction } from "@solana/web3.js";
import { keccak256, toBytes } from "viem";

export const GACHA_URL = { mainnet: "https://gacha.collectorcrypt.com", devnet: "https://dev-gacha.collectorcrypt.com" };

/** Registry id of a machine; must match paired.js machineId() on the site. */
export const machineId = (code) => keccak256(toBytes(`collectorcrypt:${code}`));

export class Gacha {
  constructor({ apiKey, baseUrl, log = () => {} }) {
    if (!apiKey) throw new Error("COLLECTOR_CRYPT_API_KEY is not set");
    this.apiKey = apiKey;
    this.base = baseUrl || GACHA_URL.mainnet;
    this.log = log;
  }

  async #req(method, path, body) {
    const res = await fetch(this.base + path, {
      method,
      headers: { "x-api-key": this.apiKey, "content-type": "application/json", accept: "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.success === false) {
      throw new Error(`Collector Crypt ${path} ${res.status}: ${json.error || json.message || json.details || JSON.stringify(json).slice(0, 200)}`);
    }
    return json;
  }

  /** Machines with price, odds, stock and EV; used to check a machine is open before paying. */
  machines() {
    return this.#req("GET", "/api/machines");
  }

  async isOpen(code) {
    const s = await this.#req("GET", "/api/status").catch(() => null);
    if (!s) return true; // status is advisory; generatePack refuses a closed machine anyway
    if (s.machineStatus && s.machineStatus !== "running") return false;
    const m = s[code] || s.machines?.[code];
    return !m || (m.status || m) !== "closed";
  }

  /**
   * Buys and opens one pack from `code` with the keeper's Solana wallet.
   * Returns { mint, memo, paySignature, sendSignature, rarity, name, image }.
   */
  async pull(code, solana, dryRun) {
    const { memo, transaction } = await this.#req("POST", "/api/generatePack", { playerAddress: solana.address, packType: code });
    const signed = solana.signSerialized(transaction);
    const sim = await solana.simulate(signed);
    if (sim) throw new Error(`pack payment simulation failed: ${sim}`);
    if (dryRun) { this.log(`[dry-run] would pay for a ${code} pack (${memo})`); return null; }

    const sub = await this.#req("POST", "/api/submitTransaction", { signedTransaction: signed });
    this.log(`paid for ${code} pack ${memo} ✓ ${sub.signature}`);
    await solana.conn.confirmTransaction(sub.signature, "confirmed").catch(() => {});

    // openPack answers 404 until the payment is visible on-chain.
    let opened;
    for (let i = 0; i < 24; i++) {
      try { opened = await this.#req("POST", "/api/openPack", { memo }); break; } catch (e) {
        if (!/ 404| 400/.test(e.message) || i === 23) throw e;
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
    const mint = opened.nft_address || opened.nftAddress || opened.nftWon?.id;
    if (!mint) throw new Error(`openPack for ${memo} returned no NFT address`);
    const content = opened.nftWon?.content || {};
    const name = content.metadata?.name || "card";
    const image = content.links?.image || content.files?.[0]?.uri || "";
    this.log(`pulled ${name} (${opened.rarity}) ${mint} ✓ ${opened.transactionSignature}`);
    return { mint, memo, paySignature: sub.signature, sendSignature: opened.transactionSignature, rarity: opened.rarity, name, image };
  }
}

/** Signs a base64 transaction Collector Crypt already partly signed, keeping their signature. */
export function signSerialized(b64, keypair) {
  const buf = Buffer.from(b64, "base64");
  try {
    const vtx = VersionedTransaction.deserialize(buf);
    vtx.sign([keypair]);
    return Buffer.from(vtx.serialize()).toString("base64");
  } catch {
    const tx = Transaction.from(buf);
    tx.partialSign(keypair);
    return tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
  }
}
