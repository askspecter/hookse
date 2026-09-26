// Deploys the Pons V2 launcher on Robinhood Chain:
//   TREASURY=0x… PRIVATE_KEY=0x… npx hardhat run scripts/deploy-pons.js --network robinhood
// OWNER defaults to the deployer. PONS_FACTORY defaults to the Pons V2 factory on chain 4663.
const { ethers } = require("hardhat");

const PONS_V2_FACTORY = "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e";

async function main() {
  const [deployer] = await ethers.getSigners();
  const treasury = process.env.TREASURY;
  if (!treasury) throw new Error("set TREASURY to the address that receives the 20% share");
  const owner = process.env.OWNER || deployer.address;
  const ponsAddr = process.env.PONS_FACTORY || PONS_V2_FACTORY;

  const pons = await ethers.getContractAt("IPonsFactory", ponsAddr);
  const escrow = await pons.feeEscrow();
  const impl = await (await ethers.getContractFactory("CreatorFeeSplitter")).deploy(escrow);
  await impl.waitForDeployment();
  const launcher = await (await ethers.getContractFactory("PonsLauncher")).deploy(ponsAddr, impl, owner, treasury);
  const rc = await (await launcher.waitForDeployment()).deploymentTransaction().wait();

  console.log("Pons factory:          ", ponsAddr);
  console.log("Pons fee escrow:       ", escrow);
  console.log("CreatorFeeSplitter impl:", await impl.getAddress());
  console.log("PonsLauncher:          ", await launcher.getAddress());
  console.log("startBlock:            ", rc.blockNumber);
  console.log("\nPut PonsLauncher and startBlock into ../config.js");
}

main().catch(e => { console.error(e); process.exit(1); });
