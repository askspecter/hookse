// $RIGS token page: official address, live price and market cap, burned total, treasury.
const $ = (id) => document.getElementById(id);
const DEAD = "0x000000000000000000000000000000000000dEaD";

(async () => {
  const w = await import("./web3.js");
  const { CONFIG, client, ABI } = w;
  const token = CONFIG.official?.token ? w.getAddress(CONFIG.official.token) : null;
  if (!token) return;
  $("ca").textContent = token;
  $("tradeBtn").href = $("coinLink").href = `/coin?token=${token}`;
  $("exLink").href = `${CONFIG.explorer}/token/${token}`;
  $("ponsLink").href = `${CONFIG.ponsCoinUrl}${token}`;
  $("deadLink").href = `${CONFIG.explorer}/token/${token}?a=${DEAD}`;
  $("copyCa").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(token); $("copyCa").textContent = "Copied"; setTimeout(() => ($("copyCa").textContent = "Copy"), 1500); } catch { /* clipboard blocked */ }
  });
  const treasuryAbi = [...ABI.launcher, ...(await import("https://cdn.jsdelivr.net/npm/viem@2.21.0/+esm")).parseAbi(["function treasury() view returns (address)"])];
  const [info, burned, treasury, usd, pons] = await Promise.all([
    w.tokenInfo(token),
    client.readContract({ address: token, abi: ABI.erc20Full, functionName: "balanceOf", args: [DEAD] }).catch(() => null),
    w.live ? client.readContract({ address: CONFIG.ponsLauncher, abi: treasuryAbi, functionName: "treasury" }).catch(() => null) : null,
    w.ethUsd(),
    w.ponsCoinInfo(token, CONFIG.official.curve).catch(() => null),
  ]);
  if (burned != null) $("tkBurned").textContent = `${Number(w.formatUnits(burned, info.decimals)).toLocaleString("en-US", { maximumFractionDigits: 0 })} ${info.symbol || "RIGS"}`;
  if (treasury) $("treasury").innerHTML = w.addrLink(treasury);
  if (pons?.curve) {
    const [mcEth, supply] = await Promise.all([
      w.marketCapEth({ kind: "pons", token, curve: pons.curve }).catch(() => null),
      client.readContract({ address: token, abi: ABI.erc20Full, functionName: "totalSupply" }).catch(() => null),
    ]);
    if (mcEth != null) {
      const priceEth = supply ? mcEth / Number(w.formatUnits(supply, info.decimals)) : null;
      $("tkMcap").textContent = usd ? w.fmtUsd(mcEth * usd) : `${w.fmtPrice(mcEth)} ETH`;
      if (priceEth != null) $("tkPrice").textContent = usd ? w.fmtUsd(priceEth * usd) : `${w.fmtPrice(priceEth)} ETH`;
    }
  }
})().catch((err) => console.error(err));
