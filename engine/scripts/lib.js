// Shared deploy helpers for tests and scripts.
const { ethers } = require("hardhat");

// Uniswap v4 permission bits this hook needs in its address.
const HOOK_FLAGS = (1n << 13n) | (1n << 7n) | (1n << 6n) | (1n << 2n); // beforeInitialize, beforeSwap, afterSwap, afterSwapReturnDelta
const ALL_HOOK_MASK = (1n << 14n) - 1n;

function mineSalt(deployer, initCode) {
  const codeHash = ethers.keccak256(initCode);
  for (let i = 0n; i < 1_000_000n; i++) {
    const salt = ethers.zeroPadValue(ethers.toBeHex(i), 32);
    const addr = ethers.getCreate2Address(deployer, salt, codeHash);
    if ((BigInt(addr) & ALL_HOOK_MASK) === HOOK_FLAGS) return { salt, addr };
  }
  throw new Error("no salt found");
}

async function deployEngine({ poolManager, owner }) {
  const Create2 = await ethers.getContractFactory("Create2Deployer");
  const factory = await Create2.deploy();
  const Hook = await ethers.getContractFactory("HookseHook");
  const initCode = (await Hook.getDeployTransaction(poolManager, owner)).data;
  const { salt, addr } = mineSalt(await factory.getAddress(), initCode);
  await (await factory.deploy(salt, initCode)).wait();
  const hook = Hook.attach(addr);

  const Launcher = await ethers.getContractFactory("HookseLauncher");
  const launcher = await Launcher.deploy(poolManager, addr);
  await (await hook.setLauncher(await launcher.getAddress())).wait();
  return { hook, launcher };
}

// Blocks bitmask values, matching HookseHook constants.
const BLOCKS = { ANTI_SNIPE: 1, SURGE_FEE: 2, AUTO_BURN: 4, LP_REWARDS: 8, NTH_BUY_POT: 16 };

function config(overrides = {}) {
  return {
    blocks: 0, baseFee: 3000, snipeBlocks: 0, snipeFee: 0, snipeMaxBuy: 0n,
    surgeMaxFee: 0, surgeRefSize: 0n, burnBps: 0, lpBps: 0, potBps: 0, potEvery: 0, potMinBuy: 0n,
    ...overrides,
  };
}

module.exports = { deployEngine, mineSalt, config, BLOCKS, HOOK_FLAGS };
