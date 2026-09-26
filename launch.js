import {
  CONFIG, ABI, $, esc, toast, friendlyError, client, live, write, getAccount, connect,
  parseEther, formatEther, toHex, zeroAddress, eth,
} from "./web3.js";

const form = $("#launchForm");
const val = (n) => form.elements[n].value.trim();
let launchFee = null;

if (!live) $("#notLive").hidden = false;

function devBuyWei() {
  try { return val("devBuy") ? parseEther(val("devBuy")) : 0n; } catch { return null; }
}

function render() {
  const sym = val("symbol").toUpperCase();
  $("#pvName").textContent = val("name") || "Your coin";
  $("#pvSym").textContent = "$" + (sym || "TICKER");
  const logo = val("logo");
  $("#pvAv").innerHTML = /^https:\/\//.test(logo) ? `<img src="${esc(logo)}" alt="" />` : esc((sym || "?").slice(0, 2));
  const tax = (Number(form.elements.tax.value) / 100).toFixed(2) + "%";
  $("#taxOut").textContent = tax;
  $("#pvTax").textContent = tax;
  const buy = devBuyWei();
  $("#pvBuy").textContent = buy == null ? "invalid" : `${eth(buy, 6)} ETH`;
  $("#pvTotal").textContent = launchFee == null || buy == null ? "—" : `${eth(launchFee + buy, 6)} ETH`;
  $("#launchBtn").textContent = !live ? "Launching unavailable" : getAccount() ? `Launch $${sym || "coin"}` : "Connect wallet to launch";
}

async function loadPons() {
  const [fee, maxTax] = await Promise.all([
    client.readContract({ address: CONFIG.ponsFactory, abi: ABI.pons, functionName: "launchFee" }),
    client.readContract({ address: CONFIG.ponsFactory, abi: ABI.pons, functionName: "maxCreatorTaxBps" }).catch(() => null),
  ]);
  launchFee = fee;
  $("#fee").textContent = `${eth(fee, 6)} ETH`;
  if (maxTax != null) {
    form.elements.tax.max = String(maxTax);
    $("#taxMax").textContent = `Pons allows up to ${(Number(maxTax) / 100).toFixed(2)}%.`;
  }
  render();
}

function validate() {
  if (!val("name")) return "Enter a name";
  if (!/^[A-Za-z0-9]{1,10}$/.test(val("symbol"))) return "Ticker: 1–10 letters or digits";
  if (val("logo") && !/^https:\/\//.test(val("logo"))) return "Logo must be an https:// link";
  if (devBuyWei() == null) return "Buy amount is not a number";
  return null;
}

form.addEventListener("input", render);
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!live) return toast("Contracts not deployed yet");
  if (!getAccount()) {
    try { await connect(); render(); } catch (err) { toast(friendlyError(err)); }
    return;
  }
  const bad = validate();
  if (bad) return toast(bad);

  const btn = $("#launchBtn");
  btn.disabled = true;
  try {
    const [fee, economics] = await Promise.all([
      client.readContract({ address: CONFIG.ponsFactory, abi: ABI.pons, functionName: "launchFee" }),
      client.readContract({ address: CONFIG.ponsFactory, abi: ABI.pons, functionName: "previewLaunchEconomics", args: [0n, zeroAddress] }),
    ]);
    const devBuy = devBuyWei();
    const params = {
      name: val("name"),
      symbol: val("symbol").toUpperCase(),
      logo: val("logo"),
      description: val("description"),
      socials: { twitter: val("twitter"), telegram: val("telegram"), discord: val("discord"), website: val("website"), farcaster: "" },
      creatorTaxBps: Number(form.elements.tax.value),
      launchConfigId: 0n,
      expectedEconomics: economics,
      salt: toHex(crypto.getRandomValues(new Uint8Array(32))),
      minTokensOut: 0n,
    };
    btn.textContent = "Confirm in your wallet…";
    const receipt = await write({ address: CONFIG.ponsLauncher, abi: ABI.launcher, functionName: "launch", args: [params], value: fee + devBuy });
    const count = await client.readContract({ address: CONFIG.ponsLauncher, abi: ABI.launcher, functionName: "launchCount" });
    const [token] = await client.readContract({ address: CONFIG.ponsLauncher, abi: ABI.launcher, functionName: "launches", args: [count - 1n] });
    toast(`Launched $${params.symbol}!`);
    $("#result").innerHTML = `<div class="card done">
      <b>$${esc(params.symbol)} is live on Pons.</b>
      <p><a href="${CONFIG.ponsCoinUrl}${token}" target="_blank" rel="noopener">Trade it on Pons ↗</a> ·
      <a href="${CONFIG.explorer}/tx/${receipt.transactionHash}" target="_blank" rel="noopener">View transaction ↗</a> ·
      <a href="claim.html">Your creator fees →</a></p></div>`;
    form.reset();
  } catch (err) {
    console.error(err);
    toast(friendlyError(err));
  } finally {
    btn.disabled = false;
    render();
  }
});

import("./web3.js").then(({ onAccount }) => onAccount(render));
render();
loadPons().catch(() => toast(`Could not read Pons settings from ${CONFIG.chainName}`));
