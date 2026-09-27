// One-time admin deployment from the browser wallet. Progress is kept in localStorage per chain.
import {
  CONFIG, $, esc, toast, friendlyError, client, walletClient, onAccount, getAccount, isAddress, getAddress, eth, addrLink, write, ABI,
  withBuffer, failedTxError,
} from "./web3.js";
import { parseAbi, encodeDeployData, keccak256, concat, toHex, pad, formatEther } from "https://cdn.jsdelivr.net/npm/viem@2.21.0/+esm";
import { BLOCKS } from "./hooks-data.js";

// From public listings, not verified here. Verify on the explorer before use.
const SUGGESTED_POOL_MANAGER = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
const HOOK_FLAGS = (1n << 13n) | (1n << 7n) | (1n << 6n) | (1n << 2n);
const KEY = `hookse-deploy-${CONFIG.chainId}`;
const PONS_ABI = parseAbi(["function feeEscrow() view returns (address)"]);
const PM_ABI = parseAbi(["function protocolFeeController() view returns (address)", "function owner() view returns (address)"]);
const LAUNCHER_ADMIN = parseAbi(["function setTreasury(address)", "function treasury() view returns (address)", "function owner() view returns (address)"]);

const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
let st = { ...load() };
// Addresses already in config.js count as done.
for (const k of ["ponsLauncher", "poolManager", "hookseHook", "hookseLauncher"]) if (isAddress(CONFIG[k] || "")) st[k] ??= CONFIG[k];
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* storage blocked */ } render(); };

const artifacts = {};
const artifact = async (name) => (artifacts[name] ||= await (await fetch(`contracts/${name}.json`)).json());

async function hasCode(a) {
  if (!isAddress(a || "")) return false;
  const code = await client.getCode({ address: a }).catch(() => null);
  return !!code && code !== "0x";
}

async function deploy(name, args) {
  const wallet = await walletClient();
  const a = await artifact(name);
  const data = encodeDeployData({ abi: a.abi, bytecode: a.bytecode, args });
  // Estimating first surfaces constructor reverts before the wallet opens, and sets an explicit gas limit.
  const gas = withBuffer(await client.estimateGas({ account: wallet.account, data }));
  const hash = await wallet.deployContract({ abi: a.abi, bytecode: a.bytecode, args, gas });
  toast(`${name}: waiting for confirmation…`);
  const rc = await client.waitForTransactionReceipt({ hash });
  if (rc.status !== "success" || !rc.contractAddress) {
    throw failedTxError(Object.assign(rc, { gasLimitNeeded: gas.toLocaleString("en-US") }), `${name} deployment`);
  }
  return { address: getAddress(rc.contractAddress), block: Number(rc.blockNumber) };
}

/**
 * Deploys through the CREATE2 deployer. Some mobile wallets cap direct contract creations at
 * 1.2M gas but not ordinary contract calls, so large contracts go through this path.
 */
async function deployViaFactory(name, args) {
  const a = await artifact(name);
  const initCode = encodeDeployData({ abi: a.abi, bytecode: a.bytecode, args });
  const salt = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const address = getAddress(`0x${keccak256(concat(["0xff", st.create2, salt, keccak256(initCode)])).slice(-40)}`);
  const rc = await write({ address: st.create2, abi: (await artifact("Create2Deployer")).abi, functionName: "deploy", args: [salt, initCode] });
  if (!(await hasCode(address))) throw new Error(`${name} not found at ${address}`);
  return { address, block: Number(rc.blockNumber) };
}

/** Finds a CREATE2 salt that puts the hook on an address carrying exactly its v4 permission bits. */
async function mineSalt(factory, initCode, onProgress) {
  const codeHash = keccak256(initCode);
  const prefix = concat(["0xff", factory]);
  for (let i = 0n; i < 5_000_000n; i++) {
    const salt = pad(toHex(i), { size: 32 });
    const addr = `0x${keccak256(concat([prefix, salt, codeHash])).slice(-40)}`;
    if ((BigInt(addr) & 0x3fffn) === HOOK_FLAGS) return { salt, address: getAddress(addr) };
    if (i % 4000n === 0n) { onProgress(Number(i)); await new Promise((r) => setTimeout(r)); }
  }
  throw new Error("No salt found");
}

const treasury = () => {
  const v = $("#treasury").value.trim();
  return v ? getAddress(v) : getAccount();
};

const STEPS = {
  pons: [
    {
      id: "splitterImpl", title: "Deploy fee splitter template", note: "CreatorFeeSplitter, wired to the Pons fee escrow.",
      run: async () => {
        const escrow = await client.readContract({ address: CONFIG.ponsFactory, abi: PONS_ABI, functionName: "feeEscrow" });
        st.splitterImpl = (await deploy("CreatorFeeSplitter", [escrow])).address;
      },
    },
    {
      id: "ponsLauncher", title: "Deploy Pons launcher", note: "PonsLauncher. Your wallet becomes its owner.", needs: ["splitterImpl"],
      run: async () => {
        if (!isAddress(treasury() || "")) throw new Error("Enter a valid treasury address");
        const r = await deploy("PonsLauncher", [CONFIG.ponsFactory, st.splitterImpl, getAccount(), treasury()]);
        st.ponsLauncher = r.address;
        st.startBlock = r.block;
        st.treasury = treasury();
      },
    },
  ],
  v4: [
    {
      id: "create2", title: "Deploy CREATE2 deployer", note: "Lets the hook land on an address with its permission bits.",
      run: async () => { st.create2 = (await deploy("Create2Deployer", [])).address; },
    },
    {
      id: "hookseHook", title: "Mine address + deploy hook", note: "HookseHook. Mining runs in your browser (a few seconds), then one transaction.", needs: ["create2", "pm"],
      run: async (btn) => {
        const pm = getAddress($("#poolManager").value.trim());
        const a = await artifact("HookseHook");
        const initCode = encodeDeployData({ abi: a.abi, bytecode: a.bytecode, args: [pm, getAccount()] });
        const { salt, address } = await mineSalt(st.create2, initCode, (n) => (btn.textContent = `Mining… ${n.toLocaleString()} tried`));
        btn.textContent = "Confirm in wallet…";
        await write({ address: st.create2, abi: (await artifact("Create2Deployer")).abi, functionName: "deploy", args: [salt, initCode] });
        if (!(await hasCode(address))) throw new Error("Hook not found at the mined address");
        st.hookseHook = address;
        st.poolManager = pm;
      },
    },
    {
      id: "hookseLauncher", title: "Deploy v4 launcher", note: "HookseLauncher, bound to the hook and PoolManager. Sent through the CREATE2 deployer.", needs: ["hookseHook", "create2"],
      run: async () => { st.hookseLauncher = (await deployViaFactory("HookseLauncher", [st.poolManager, st.hookseHook])).address; },
    },
    {
      id: "launcherSet", title: "Connect hook to launcher", note: "hook.setLauncher(launcher). Can only be done once.", needs: ["hookseLauncher"],
      run: async () => {
        await write({ address: st.hookseHook, abi: ABI.hookseHook, functionName: "setLauncher", args: [st.hookseLauncher] });
        st.launcherSet = true;
      },
    },
  ],
};
const ALL = [...STEPS.pons, ...STEPS.v4];

function pmReady() {
  return isAddress($("#poolManager").value.trim()) && $("#pmConfirm").checked;
}

function stepHtml(s, i) {
  const done = !!st[s.id];
  const blocked = (s.needs || []).some((n) => (n === "pm" ? !pmReady() : !st[n]));
  const val = typeof st[s.id] === "string" ? addrLink(st[s.id]) : done ? '<span class="badge green">done</span>' : "";
  return `<div class="dep-step${done ? " done" : ""}">
    <span class="dep-n">${done ? "✓" : i + 1}</span>
    <div><b>${s.title}</b><small class="dim">${s.note}</small></div>
    <span class="dep-val">${val}</span>
    <button class="btn ${done ? "btn-dark" : "btn-pink"} btn-xs" data-step="${s.id}" ${blocked || done ? "disabled" : ""}>${done ? "Done" : "Sign"}</button>
  </div>`;
}

function configText() {
  const v = (k) => st[k] || CONFIG[k] || "";
  return `// Generated on deploy.html
export const CONFIG = {
  chainId: ${CONFIG.chainId},
  chainName: ${JSON.stringify(CONFIG.chainName)},
  rpcUrl: ${JSON.stringify(CONFIG.rpcUrl)},
  explorer: ${JSON.stringify(CONFIG.explorer)},
  ponsFactory: ${JSON.stringify(CONFIG.ponsFactory)},
  ponsCoinUrl: ${JSON.stringify(CONFIG.ponsCoinUrl)},
  ponsLauncher: ${JSON.stringify(v("ponsLauncher"))},
  startBlock: ${st.startBlock || CONFIG.startBlock || 0},
  creatorShareBps: 8000,
  poolManager: ${JSON.stringify(v("poolManager"))},
  hookseHook: ${JSON.stringify(v("hookseHook"))},
  hookseLauncher: ${JSON.stringify(st.launcherSet || CONFIG.hookseLauncher ? v("hookseLauncher") : "")},
  reownProjectId: ${JSON.stringify(CONFIG.reownProjectId)},
};
`;
}

function render() {
  $("#stepsPons").innerHTML = STEPS.pons.map(stepHtml).join("");
  $("#stepsV4").innerHTML = STEPS.v4.map((s, i) => stepHtml(s, i + STEPS.pons.length)).join("");
  $("#wProg").textContent = `${ALL.filter((s) => st[s.id]).length} / ${ALL.length}`;
  $("#cfgOut").textContent = configText();
}

document.addEventListener("click", async (e) => {
  const b = e.target.closest("button[data-step]");
  if (!b) return;
  const s = ALL.find((x) => x.id === b.dataset.step);
  b.disabled = true;
  b.textContent = "Confirm in wallet…";
  try {
    await s.run(b);
    save();
    toast(`${s.title}: done`);
  } catch (err) {
    console.error(err);
    toast(friendlyError(err));
    render();
    const box = document.getElementById("depError");
    box.hidden = false;
    box.innerHTML = `<b>${esc(s.title)} failed.</b> ${esc(err.shortMessage || err.message).replace(/https?:\/\/\S+/, (u) => `<a class="link-pink" href="${u}" target="_blank" rel="noopener">View transaction ↗</a>`)}`;
  }
});

$("#suggestPm").addEventListener("click", () => { $("#poolManager").value = SUGGESTED_POOL_MANAGER; $("#pmConfirm").checked = false; checkPm(); });
$("#checkPm").addEventListener("click", () => checkPm());
$("#poolManager").addEventListener("input", render);
$("#pmConfirm").addEventListener("change", render);

async function checkPm() {
  const a = $("#poolManager").value.trim();
  const note = $("#pmNote");
  if (!isAddress(a)) { note.textContent = "Not an address."; return render(); }
  note.textContent = "Checking…";
  try {
    if (!(await hasCode(a))) { note.innerHTML = `<span class="warn-t">No contract at this address on ${esc(CONFIG.chainName)}.</span>`; return render(); }
    const [controller, owner] = await Promise.all(["protocolFeeController", "owner"].map((fn) => client.readContract({ address: a, abi: PM_ABI, functionName: fn })));
    note.innerHTML = `Responds like a v4 PoolManager (owner ${addrLink(owner)}, fee controller ${addrLink(controller)}). <a class="link-pink" href="${CONFIG.explorer}/address/${a}" target="_blank" rel="noopener">Check it on the explorer ↗</a> before confirming.`;
  } catch {
    note.innerHTML = `<span class="warn-t">This contract does not answer like a Uniswap v4 PoolManager.</span>`;
  }
  render();
}

$("#copyCfg").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(configText()); toast("config.js copied"); } catch { toast("Copy failed; select the text instead"); }
});
$("#dlCfg").addEventListener("click", () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([configText()], { type: "text/javascript" }));
  a.download = "config.js";
  a.click();
});
$("#resetDep").addEventListener("click", () => {
  if (!confirm("Forget the addresses saved in this browser? Deployed contracts stay on-chain.")) return;
  st = {};
  try { localStorage.removeItem(KEY); } catch { /* storage blocked */ }
  render();
});

$("#authBlock").innerHTML = BLOCKS.map((b) => `<option value="${b.index}">${b.name}</option>`).join("");
$("#setTreasury").addEventListener("click", async () => {
  const t = $("#newTreasury").value.trim();
  if (!isAddress(st.ponsLauncher || "") || !isAddress(t)) return toast("Need a deployed Pons launcher and a valid address");
  try {
    await write({ address: st.ponsLauncher, abi: LAUNCHER_ADMIN, functionName: "setTreasury", args: [getAddress(t)] });
    toast("Treasury updated");
  } catch (err) { toast(friendlyError(err)); }
});
$("#setAuthor").addEventListener("click", async () => {
  const a = $("#authAddr").value.trim() || "0x0000000000000000000000000000000000000000";
  if (!isAddress(st.hookseHook || "") || !isAddress(a)) return toast("Need a deployed hook and a valid address");
  try {
    await write({ address: st.hookseHook, abi: ABI.hookseHook, functionName: "setAuthor", args: [Number($("#authBlock").value), getAddress(a), Number($("#authBps").value)] });
    toast("Author updated");
  } catch (err) { toast(friendlyError(err)); }
});

onAccount(async (acc) => {
  $("#wAddr").innerHTML = acc ? addrLink(acc) : "—";
  if (!$("#treasury").value && acc) $("#treasury").placeholder = `${acc} (your wallet)`;
  if (acc) {
    const bal = await client.getBalance({ address: acc }).catch(() => null);
    $("#wBal").textContent = bal == null ? "balance unknown" : `${eth(bal, 5)} ETH`;
  } else $("#wBal").textContent = "not connected";
  const id = await client.getChainId().catch(() => null);
  $("#wNet").textContent = id ? String(id) : "—";
  $("#wNetNote").textContent = id === CONFIG.chainId ? CONFIG.chainName : `RPC unreachable or wrong chain (need ${CONFIG.chainId})`;
});

if (st.poolManager) { $("#poolManager").value = st.poolManager; $("#pmConfirm").checked = true; }
render();
// Drop saved addresses whose contracts no longer exist on this chain (e.g. after switching RPC).
(async () => {
  let changed = false;
  for (const k of ["splitterImpl", "ponsLauncher", "create2", "hookseHook", "hookseLauncher"]) {
    if (st[k] && !(await hasCode(st[k]))) { delete st[k]; changed = true; }
  }
  if (!st.hookseHook) delete st.launcherSet;
  if (changed) save();
})();
