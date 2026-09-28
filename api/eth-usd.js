// GET /api/eth-usd -> { usd, source, at }. ETH/USD spot from public exchange APIs, first one that answers.
// GET /api/eth-usd?asset=SOL does the same for SOL/USD (Solana coins).
// Cached at the edge for a minute so every visitor shares one lookup.
const SOURCES = {
  ETH: [
    ["coinbase", "https://api.coinbase.com/v2/prices/ETH-USD/spot", (j) => j?.data?.amount],
    ["kraken", "https://api.kraken.com/0/public/Ticker?pair=ETHUSD", (j) => j?.result && Object.values(j.result)[0]?.c?.[0]],
    ["coingecko", "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd", (j) => j?.ethereum?.usd],
  ],
  SOL: [
    ["coinbase", "https://api.coinbase.com/v2/prices/SOL-USD/spot", (j) => j?.data?.amount],
    ["kraken", "https://api.kraken.com/0/public/Ticker?pair=SOLUSD", (j) => j?.result && Object.values(j.result)[0]?.c?.[0]],
    ["coingecko", "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd", (j) => j?.solana?.usd],
  ],
};

async function fetchJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const asset = String(req.query?.asset || "ETH").toUpperCase();
  const sources = SOURCES[asset];
  if (!sources) return res.status(400).json({ error: "asset must be ETH or SOL" });
  for (const [source, url, pick] of sources) {
    try {
      const usd = Number(pick(await fetchJson(url)));
      if (usd > 0 && isFinite(usd)) {
        res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=600");
        return res.status(200).json({ asset, usd, source, at: Math.floor(Date.now() / 1000) });
      }
    } catch { /* try the next source */ }
  }
  res.setHeader("Cache-Control", "no-store");
  return res.status(502).json({ error: `No ${asset}/USD source answered` });
};
