// GET /api/sol-meta?mint=<address> -> token metadata JSON (name, symbol, description, image) for a coin launched
// on pump.fun through Rigs. This URL is the coin's on-chain metadata `uri`, so it must stay stable.
const { kv } = require("./_kv");

module.exports = async (req, res) => {
  const mint = String(req.query?.mint || "");
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) return res.status(400).json({ error: "Bad mint" });
  try {
    const raw = await kv("GET", `solmeta:${mint}`);
    if (!raw) return res.status(404).json({ error: "Not found" });
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
    return res.status(200).json(JSON.parse(raw));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
