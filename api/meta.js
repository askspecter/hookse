// GET  /api/meta?tokens=0x…,0x…  -> { [token]: { logo, description } }
// POST { token, logo, description, time, signature } -> { logo, description }
//
// Coin metadata for Rigs coins. Pons coins: read once from the launch transaction's calldata
// (PonsLauncher.launch params) and cached. Any coin: its creator can set a logo and one-liner by
// signing metaMessage() (same text as web3.js); we check the signer against the on-chain creator.
const { kv } = require("./_kv");

// Keep in sync with config.js.
const RPC_URL = process.env.RPC_URL || "https://rpc.mainnet.chain.robinhood.com";
const PONS_LAUNCHER = process.env.PONS_LAUNCHER || "0xC8aD3EaeD98980f94c36F842d99ecFB96511E4DD";
const RIGS_LAUNCHER = process.env.RIGS_LAUNCHER || "0x9b33583252B833864e35b555cB3d5F0cFFABeDfa";
const START_BLOCK = BigInt(process.env.START_BLOCK || 73912247);

const MAX_AGE = 10 * 60;
const PER_HOUR = 30;
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const metaMessage = (token, logo, description, time) =>
  `Rigs: set the details for coin ${token.toLowerCase()}\nLogo: ${logo || "none"}\nDescription: ${description || "none"}\nTime: ${time}`;

let viem;
async function client() {
  viem ||= await import("viem");
  return viem.createPublicClient({ transport: viem.http(RPC_URL) });
}

const LAUNCH_SIG = "struct Socials { string twitter; string telegram; string discord; string website; string farcaster; } struct LaunchParams { string name; string symbol; string logo; string description; Socials socials; uint16 creatorTaxBps; uint256 launchConfigId; bytes32 expectedEconomics; bytes32 salt; uint256 minTokensOut; }";
const ponsAbi = () => viem.parseAbi([
  LAUNCH_SIG.split(" struct LaunchParams")[0],
  "struct LaunchParams" + LAUNCH_SIG.split(" struct LaunchParams")[1],
  "function launch(LaunchParams p) payable returns (uint256)",
  "function idOf(address token) view returns (uint256)",
  "function launches(uint256) view returns (address token, address curve, address splitter, address creator, uint64 launchedAt)",
  "event Launched(uint256 indexed id, address indexed creator, address indexed token, address curve, address splitter, uint256 devBuy)",
]);
const rigsAbi = () => viem.parseAbi([
  "struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }",
  "function keyOf(address token) view returns (PoolKey)",
  "function launches(bytes32 id) view returns (address token, address creator, int24 tickLower, int24 tickUpper, uint128 liquidity, bool existing)",
]);
const splitterAbi = () => viem.parseAbi(["function creator() view returns (address)"]);

/** Current creator of a Rigs coin (Pons: the fee splitter's creator; Rigs pool: the opener), or null. */
async function creatorOf(c, token) {
  const pons = ponsAbi();
  const id = await c.readContract({ address: PONS_LAUNCHER, abi: pons, functionName: "idOf", args: [token] }).catch(() => null);
  if (id != null) {
    const l = await c.readContract({ address: PONS_LAUNCHER, abi: pons, functionName: "launches", args: [id] }).catch(() => null);
    if (l && l[0].toLowerCase() === token.toLowerCase()) {
      return c.readContract({ address: l[2], abi: splitterAbi(), functionName: "creator" }).catch(() => l[3]);
    }
  }
  const rigs = rigsAbi();
  const k = await c.readContract({ address: RIGS_LAUNCHER, abi: rigs, functionName: "keyOf", args: [token] }).catch(() => null);
  if (!k || k.currency1.toLowerCase() !== token.toLowerCase()) return null;
  const poolId = viem.keccak256(viem.encodeAbiParameters(
    [{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }],
    [k.currency0, k.currency1, k.fee, k.tickSpacing, k.hooks]));
  const l = await c.readContract({ address: RIGS_LAUNCHER, abi: rigs, functionName: "launches", args: [poolId] });
  return l[1];
}

/** Logo and description a Pons coin was launched with, from its launch transaction. */
async function fromLaunchTx(c, token) {
  const logs = await c.getContractEvents({ address: PONS_LAUNCHER, abi: ponsAbi(), eventName: "Launched", args: { token }, fromBlock: START_BLOCK });
  if (!logs.length) return null;
  const tx = await c.getTransaction({ hash: logs[0].transactionHash });
  const { args } = viem.decodeFunctionData({ abi: ponsAbi(), data: tx.input });
  const p = args[0];
  return { logo: /^https:\/\//.test(p.logo) ? p.logo.slice(0, 300) : "", description: String(p.description || "").slice(0, 160) };
}

module.exports = async (req, res) => {
  try {
    if (req.method === "GET") {
      const tokens = String(req.query.tokens || "").split(",").filter((t) => ADDR_RE.test(t)).slice(0, 50).map((t) => t.toLowerCase());
      const out = {};
      let c = null;
      for (const t of tokens) {
        const raw = await kv("GET", `meta:${t}`);
        if (raw) { out[t] = JSON.parse(raw); continue; }
        c ||= await client();
        const m = await fromLaunchTx(c, t).catch(() => null);
        out[t] = m || {};
        // Unknown coins are re-checked after 10 minutes; Pons launch data never changes.
        await kv("SET", `meta:${t}`, JSON.stringify(out[t]), ...(m ? [] : ["EX", 600]));
      }
      res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=300");
      return res.status(200).json(out);
    }
    if (req.method !== "POST") return res.status(405).json({ error: "GET or POST only" });

    const body = typeof req.body === "object" && req.body ? req.body : {};
    const token = String(body.token || "");
    const logo = String(body.logo || "");
    const description = String(body.description || "");
    const time = Number(body.time);
    const signature = String(body.signature || "");
    if (!ADDR_RE.test(token)) return res.status(400).json({ error: "Bad token address" });
    if (logo && (!/^https:\/\//.test(logo) || logo.length > 300)) return res.status(400).json({ error: "Logo must be an https link, at most 300 characters" });
    if (description.length > 160) return res.status(400).json({ error: "Description is at most 160 characters" });
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isInteger(time) || time > now + 60 || now - time > MAX_AGE) return res.status(400).json({ error: "Signature expired, try again" });
    if (!/^0x[0-9a-fA-F]+$/.test(signature)) return res.status(400).json({ error: "Missing signature" });

    const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
    const rateKey = `rl:meta:${ip}`;
    const count = await kv("INCR", rateKey);
    if (count === 1) await kv("EXPIRE", rateKey, 3600);
    if (count > PER_HOUR) return res.status(429).json({ error: "Too many requests, try again later" });

    const c = await client();
    const creator = await creatorOf(c, token).catch(() => null);
    if (!creator || /^0x0{40}$/i.test(creator)) return res.status(404).json({ error: "Not a Rigs coin" });
    // verifyMessage also accepts smart-contract wallets (ERC-1271 / ERC-6492).
    const ok = await c.verifyMessage({ address: creator, message: metaMessage(token, logo, description, time), signature }).catch(() => false);
    if (!ok) return res.status(403).json({ error: "Only the coin's creator can change its details" });

    const meta = { logo, description };
    await kv("SET", `meta:${token.toLowerCase()}`, JSON.stringify(meta));
    return res.status(200).json(meta);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
