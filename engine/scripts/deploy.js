// Deploys RigsHook (at a permission-flagged CREATE2 address) and RigsLauncher.
// POOL_MANAGER=<address> uses an existing Uniswap v4 PoolManager; otherwise one is deployed (local testing).
const { ethers } = require("hardhat");
const { deployEngine } = require("./lib");

async function main() {
  const [deployer] = await ethers.getSigners();
  let pm = process.env.POOL_MANAGER;
  if (!pm) {
    const PoolManager = await ethers.getContractFactory("PoolManager");
    pm = await (await PoolManager.deploy(deployer.address)).getAddress();
    console.log("PoolManager (new):", pm);
  }
  const { hook, launcher } = await deployEngine({ poolManager: pm, owner: deployer.address });
  console.log("RigsHook:       ", await hook.getAddress());
  console.log("RigsLauncher:   ", await launcher.getAddress());
}

main().catch(e => { console.error(e); process.exit(1); });
