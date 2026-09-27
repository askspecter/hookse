const board = document.getElementById("board");
const esc = (s) => String(s).replace(/[<>&"]/g, "");
(async () => {
  try {
    const w = await import("./web3.js");
    if (!w.live) { board.innerHTML = `<tr><td colspan="5" class="dim">The leaderboard fills in once the Rigs launcher is deployed.</td></tr>`; return; }
    const n = Number(await w.client.readContract({ address: w.CONFIG.ponsLauncher, abi: w.ABI.launcher, functionName: "launchCount" }));
    const all = await Promise.all(Array.from({ length: Math.min(n, 300) }, (_, i) => w.loadLaunch(n - 1 - i)));
    const by = new Map();
    for (const l of all) {
      const k = l.creatorAtLaunch;
      const r = by.get(k) || { creator: k, coins: 0, paid: 0n, latest: l };
      r.coins++; r.paid += l.totalToCreator; if (l.launchedAt > r.latest.launchedAt) r.latest = l;
      by.set(k, r);
    }
    const rows = [...by.values()].sort((a, b) => b.coins - a.coins || (b.paid > a.paid ? 1 : -1)).slice(0, 50);
    board.innerHTML = rows.length ? rows.map((r, i) => `<tr><td class="dim mono">${i + 1}</td><td>${w.addrLink(r.creator)}</td><td class="r mono">${r.coins}</td><td class="r mono">${w.eth(r.paid, 5)} ETH</td><td class="r">$${esc(r.latest.symbol || "?")}</td></tr>`).join("")
      : `<tr><td colspan="5" class="dim">No launches yet.</td></tr>`;
  } catch (err) {
    console.error(err);
    board.innerHTML = `<tr><td colspan="5" class="dim">Could not reach the chain.</td></tr>`;
  }
})();
