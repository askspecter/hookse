(async () => {
  try {
    const w = await import("./web3.js");
    if (!w.live) return;
    const abi = [...w.ABI.launcher, ...(await import("https://cdn.jsdelivr.net/npm/viem@2.21.0/+esm")).parseAbi(["function treasury() view returns (address)"])];
    const [t, n] = await Promise.all([
      w.client.readContract({ address: w.CONFIG.ponsLauncher, abi, functionName: "treasury" }),
      w.client.readContract({ address: w.CONFIG.ponsLauncher, abi, functionName: "launchCount" }),
    ]);
    document.getElementById("treasury").innerHTML = w.addrLink(t);
    document.getElementById("count").textContent = String(n);
  } catch (err) { console.error(err); }
})();
