import {
  CONFIG, ABI, $, esc, toast, friendlyError, client, live, write, onAccount, getAccount,
  isAddress, getAddress, eth, addrLink, loadLaunch,
} from "./web3.js";

let coins = [];
if (!live) $("#notLive").hidden = false;

function renderRows() {
  const me = getAccount();
  if (!coins.length) {
    $("#rows").innerHTML = `<tr><td colspan="6" class="dim">${me ? "No coins launched from this wallet yet. <a href=\"launch.html\">Launch one →</a>" : "Connect your wallet to see coins you launched."}</td></tr>`;
  } else {
    $("#rows").innerHTML = coins.map((c, i) => {
      const mine = me && c.creator && getAddress(c.creator) === me;
      return `<tr>
        <td><div class="tok"><div class="av">${esc((c.symbol || "?").slice(0, 2))}</div><span>${esc(c.name || "Unknown")} <span class="dim">$${esc(c.symbol || "")}</span></span></div></td>
        <td>${addrLink(c.splitter)}</td>
        <td class="r mono">${eth(c.claimable, 6)} ETH</td>
        <td class="r mono">${eth(c.totalToCreator, 6)} ETH</td>
        <td class="r mono dim">${eth(c.totalToTreasury, 6)} ETH</td>
        <td class="r nowrap">
          <button class="btn btn-dark btn-xs" data-harvest="${i}">Harvest</button>
          ${mine ? `<button class="btn btn-pink btn-xs" data-claim="${i}">Claim</button>` : `<span class="dim tiny">creator ${addrLink(c.creator)}</span>`}
        </td></tr>`;
    }).join("");
  }
  const mine = coins.filter((c) => me && c.creator && getAddress(c.creator) === me);
  const sum = (k) => mine.reduce((s, c) => s + c[k], 0n);
  $("#sumClaim").textContent = me ? `${eth(sum("claimable"), 6)} ETH` : "—";
  $("#sumPaid").textContent = me ? `${eth(sum("totalToCreator"), 6)} ETH` : "—";
  $("#sumCoins").textContent = me ? String(mine.length) : "—";
  $("#claimAll").disabled = !mine.length;
}

async function loadMine(account) {
  if (!live || !account) { coins = []; return renderRows(); }
  $("#rows").innerHTML = `<tr><td colspan="6" class="dim">Reading ${esc(CONFIG.chainName)}…</td></tr>`;
  try {
    const ids = await client.readContract({ address: CONFIG.ponsLauncher, abi: ABI.launcher, functionName: "launchesOf", args: [account] });
    const all = await Promise.all(ids.map((id) => loadLaunch(id)));
    // A creator can hand their share to another wallet; only show coins this wallet still controls.
    coins = all.filter((c) => c.creator && getAddress(c.creator) === account);
  } catch (err) {
    console.error(err);
    toast("Could not load your coins");
    coins = [];
  }
  renderRows();
}

async function refresh(i) {
  coins[i] = await loadLaunch(coins[i].id);
  renderRows();
}

$("#rows").addEventListener("click", async (e) => {
  const b = e.target.closest("button[data-harvest],button[data-claim]");
  if (!b) return;
  const i = Number(b.dataset.harvest ?? b.dataset.claim);
  const fn = b.dataset.claim != null ? "claim" : "harvest";
  b.disabled = true;
  try {
    await write({ address: coins[i].splitter, abi: ABI.splitter, functionName: fn });
    toast(fn === "claim" ? "Creator fees sent to your wallet" : "Fees harvested");
    await refresh(i);
  } catch (err) {
    toast(friendlyError(err));
  } finally {
    b.disabled = false;
  }
});

$("#claimAll").addEventListener("click", async () => {
  const me = getAccount();
  const mine = coins.map((c, i) => [c, i]).filter(([c]) => getAddress(c.creator) === me);
  for (const [c, i] of mine) {
    try {
      await write({ address: c.splitter, abi: ABI.splitter, functionName: "claim" });
      await refresh(i);
    } catch (err) {
      toast(`$${c.symbol}: ${friendlyError(err)}`);
      return;
    }
  }
  toast("All creator fees claimed");
});

$("#lookup").addEventListener("change", async (e) => {
  const v = e.target.value.trim();
  if (!v) return loadMine(getAccount());
  if (!isAddress(v)) return toast("Paste a token address");
  if (!live) return;
  try {
    const id = await client.readContract({ address: CONFIG.ponsLauncher, abi: ABI.launcher, functionName: "idOf", args: [getAddress(v)] });
    const c = await loadLaunch(id);
    if (getAddress(c.token) !== getAddress(v)) return toast("That token was not launched through Hookse");
    coins = [c];
    renderRows();
  } catch {
    toast("That token was not launched through Hookse");
  }
});

onAccount(loadMine);
