// Robinhood Chain mainnet deployment. Regenerate on deploy.html after deploying new contracts.
export const CONFIG = {
  chainId: 4663,
  chainName: "Robinhood Chain",
  rpcUrl: "https://rpc.mainnet.chain.robinhood.com",
  explorer: "https://robinhoodchain.blockscout.com",
  ponsFactory: "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e",
  ponsCoinUrl: "https://www.ponsfamily.com/launchpad/",
  ponsLauncher: "0xC8aD3EaeD98980f94c36F842d99ecFB96511E4DD",
  startBlock: 73912247,
  creatorShareBps: 8000,
  poolManager: "0x8366a39CC670B4001A1121B8F6A443A643e40951",
  // v4 hook + launcher: redeploy on deploy.html (the earlier pair predates existing-asset pools).
  rigsHook: "",
  rigsLauncher: "",
  rigsAuctions: "",
  // Where hook ideas and integration requests are emailed. Empty hides those forms.
  contactEmail: "",
  reownProjectId: "5c559ec7c86f657976f14d599d5e66b5",
};
