// Copies ABI + creation bytecode of the deployable contracts into ../contracts/ for deploy.html.
// Run after `npx hardhat compile`: node scripts/export-web.js
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "..", "contracts");
const LIST = [
  ["pons/CreatorFeeSplitter.sol", "CreatorFeeSplitter"],
  ["pons/PonsLauncher.sol", "PonsLauncher"],
  ["Create2Deployer.sol", "Create2Deployer"],
  ["RigsHook.sol", "RigsHook"],
  ["RigsLauncher.sol", "RigsLauncher"],
  ["RigsAuctions.sol", "RigsAuctions"],
];

fs.mkdirSync(OUT, { recursive: true });
for (const [file, name] of LIST) {
  const a = require(path.join(__dirname, "..", "artifacts", "contracts", file, `${name}.json`));
  fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify({ contractName: name, abi: a.abi, bytecode: a.bytecode }) + "\n");
  console.log(`${name}: ${(a.bytecode.length - 2) / 2} bytes`);
}
