# Rigs engine

Smart contracts for Rigs: pool-first token launches on Uniswap v4 with composable rule blocks.

## Contracts

| Contract | Role |
| --- | --- |
| `RigsHook` | Single v4 hook that runs each pool's selected rule blocks and pays block-author royalties |
| `RigsLauncher` | Mints a fixed-supply token, opens the ETH/token pool on the hook, seeds the whole supply as locked single-sided liquidity, and lets the creator collect LP fees |
| `RigsAuctions` | Dutch auctions of any ERC-20 for ETH |
| `RigsToken` | Plain fixed-supply ERC-20 |
| `Create2Deployer` | Deploys the hook at an address whose low bits carry its v4 permissions |

### Rule blocks

| Block | Bit | What it does |
| --- | --- | --- |
| Anti-Snipe | 1 | For `snipeBlocks` after launch: max ETH per buy (`snipeMaxBuy`) and an extra LP fee (`snipeFee`) that decays linearly |
| Surge Fee | 2 | LP fee rises from `baseFee` to `surgeMaxFee` as trade size approaches `surgeRefSize` ETH |
| Auto Burn | 4 | `burnBps` of each exact-input buy's token output goes to `0x…dEaD` |
| LP Rewards | 8 | `lpBps` of each swap is donated to in-range liquidity |
| Nth-Buy Pot | 16 | `potBps` of each swap funds a pot; every `potEvery`-th buy of at least `potMinBuy` ETH wins it (winner from `hookData`, else `tx.origin`) |

Fees are in pips (3000 = 0.30%), takes in basis points. Takes are charged on the swap's unspecified side. Total takes, including up to 0.25% royalty per block, are capped at 10%. Pot winnings and royalties are pulled with `claim(currency)`.

## Pons V2 launches (80% creator / 20% treasury)

Ported from the Pons V2 engine in `askspecter/LaunchNFT` (`IPons`, `Launcher`, `FeeRouter`), with the NFT vault replaced by a creator payout.

| Contract | Role |
| --- | --- |
| `pons/PonsLauncher` | Entry point. Clones a `CreatorFeeSplitter`, calls Pons `launchToken` with `creatorFeeRecipient = splitter`, and optionally buys on the curve for the creator with ETH above the launch fee. Indexes launches by token and creator. Owner can change the treasury. |
| `pons/CreatorFeeSplitter` | The coin's Pons creator-fee recipient (so Pons shows this contract as the creator). `harvest()` (anyone) sweeps the curve, claims from the Pons escrow, sends 20% to the treasury and credits 80% to the creator. `claim()` (creator only) harvests and pays out. `setCreator()` hands the share to another wallet. It cannot change the Pons fee recipient. |
| `pons/IPons` | Pons V2 factory / escrow / curve interface. |

Pons V2 factory on Robinhood Chain (4663): `0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e`.

```sh
TREASURY=0x… PRIVATE_KEY=0x… npx hardhat run scripts/deploy-pons.js --network robinhood
FORK=1 npx hardhat test test/pons.fork.test.js   # real Pons on a mainnet fork
```

Then set `ponsLauncher` and `startBlock` in `../config.js`. The site's `launch.html` and `claim.html` go live once it is set.

## Use

```sh
npm install
npm test                       # compile + run the test suite on a local chain
POOL_MANAGER=0x… RPC_URL=… PRIVATE_KEY=… npx hardhat run scripts/deploy.js --network target
```

Compilation uses the `solc` npm package (0.8.26, via-IR, cancun), so no compiler download is needed.

> These contracts have not been audited. Do not deploy them with real funds before an independent audit.
