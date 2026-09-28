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
  rigsHook: "0x9B2c27AD954b3e20F8739670D9c26a18e9daE0C4",
  rigsLauncher: "0x9b33583252B833864e35b555cB3d5F0cFFABeDfa",
  rigsAuctions: "0x4d96761b25bc1E552dBB2d4B2f01A8cF1e64320C",
  rigsRouter: "0x9BfA528A6e01B20552089f7368Da82dF1aB65b8a",
  // The official $RIGS coin, launched directly on Pons. `curve` is optional: the site finds it from the launch transaction.
  official: { token: "0x02BB02536762aD8dE1f211C0f5dd25bC033A7194", curve: "", buybackPct: 10 },
  // Other chains. Solana launches go through pump.fun (api/sol-launch.js).
  solana: { treasury: "CeEtCANnK4a5H2WHhpCqZiJMwEZSzJ7bWTLYL6ZK1hVk" },
  // Arc launches go through Argus Portal #7 (addresses from arguspad.io/argus-v4.json v3). `launcher` is set on /deploy.
  arc: {
    chainId: 5042,
    chainName: "Arc",
    rpcUrl: "https://rpc.arc-scan.org",
    explorer: "https://arc-scan.org",
    argusUrl: "https://arguspad.io",
    portal: "0xB021Be536808f551b31789422Fd28a6c9c6e97Da",
    stateView: "0xF3334192D15450CdD385c8B70e03f9A6bD9E673b",
    usdc: "0x3600000000000000000000000000000000000000",
    treasury: "0x79b045B9Cd343b993A758aA6e38A1723CfaD8F91",
    launcher: "",
  },
  // Paired coins: creator fees buy NFTs or Collector Crypt gacha packs, raffled to holders. Set on /deploy.
  paired: {
    registry: "",
    raffles: "",
    launcher: "", // coins paired with a Robinhood Chain NFT collection
    externalLauncher: "", // coins paired with a Collector Crypt gacha machine (Solana)
    startBlock: 0,
    snapshotBaseUrl: "snapshots/", // raffle snapshots the keeper commits
    machines: [
      { code: "pokemon_50", name: "Pokémon $50", priceUsd: 50 },
      { code: "pokemon_250", name: "Pokémon Legendary $250", priceUsd: 250 },
    ],
    collections: [], // { address, name, slug, image } for Robinhood Chain NFT collections
  },
  // Where hook ideas and integration requests are emailed. Empty hides those forms.
  contactEmail: "support@userigs.fun",
  reownProjectId: "5c559ec7c86f657976f14d599d5e66b5",
};
