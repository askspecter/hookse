// Fill `ponsLauncher` and `startBlock` after running engine/scripts/deploy-pons.js on Robinhood Chain.
// While `ponsLauncher` is empty, launching and claiming are disabled and the site says so.
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
  // Reown (WalletConnect) Project ID from https://cloud.reown.com. Empty = browser wallet only.
  reownProjectId: "",
};
