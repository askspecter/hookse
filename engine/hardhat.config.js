require("@nomicfoundation/hardhat-toolbox");
const path = require("path");
const { subtask } = require("hardhat/config");
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require("hardhat/builtin-tasks/task-names");

// Use the solc-js build from npm instead of downloading native compilers.
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args, hre, runSuper) => {
  if (args.solcVersion !== "0.8.26") return runSuper();
  const solc = require("solc");
  return {
    compilerPath: path.join(__dirname, "node_modules", "solc", "soljson.js"),
    isSolcJs: true,
    version: args.solcVersion,
    longVersion: solc.version(),
  };
});

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.26",
    settings: { evmVersion: "cancun", viaIR: true, optimizer: { enabled: true, runs: 44444444 } },
  },
  networks: {
    hardhat: {
      hardfork: "cancun",
      allowUnlimitedContractSize: true,
      // FORK=1 runs tests against a Robinhood Chain mainnet fork (real Pons V2).
      ...(process.env.FORK && { forking: { url: process.env.ROBINHOOD_RPC || "https://rpc.mainnet.chain.robinhood.com" }, chainId: 4663 }),
    },
    robinhood: {
      url: process.env.ROBINHOOD_RPC || "https://rpc.mainnet.chain.robinhood.com",
      chainId: 4663,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    ...(process.env.RPC_URL && {
      target: { url: process.env.RPC_URL, accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [] },
    }),
  },
  mocha: { timeout: 600000 },
};
