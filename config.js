// Contract addresses. After deploying on deploy.html, paste the generated block over this file
// (or send the addresses to be committed). Empty addresses switch the matching features off.
export const CONFIG = {
  chainId: 4663,
  chainName: "Robinhood Chain",
  rpcUrl: "https://rpc.mainnet.chain.robinhood.com",
  explorer: "https://robinhoodchain.blockscout.com",
  ponsFactory: "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e",
  ponsCoinUrl: "https://www.ponsfamily.com/launchpad/", // + token address
  ponsLauncher: "",
  startBlock: 0,
  creatorShareBps: 8000, // mirrors CreatorFeeSplitter.CREATOR_BPS
  // Uniswap v4 (direct hooked pools from the Builder)
  poolManager: "",
  hookseHook: "",
  hookseLauncher: "",
  // Reown (WalletConnect) Project ID from https://cloud.reown.com. Public by design.
  reownProjectId: "5c559ec7c86f657976f14d599d5e66b5",
};
