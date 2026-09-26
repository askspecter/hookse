# Hookse engine

Smart contracts for Hookse: pool-first token launches on Uniswap v4 with composable rule blocks.

## Contracts

| Contract | Role |
| --- | --- |
| `HookseHook` | Single v4 hook that runs each pool's selected rule blocks and pays block-author royalties |
| `HookseLauncher` | Mints a fixed-supply token, opens the ETH/token pool on the hook, seeds the whole supply as locked single-sided liquidity, and lets the creator collect LP fees |
| `HookseToken` | Plain fixed-supply ERC-20 |
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

## Use

```sh
npm install
npm test                       # compile + run the test suite on a local chain
POOL_MANAGER=0x… RPC_URL=… PRIVATE_KEY=… npx hardhat run scripts/deploy.js --network target
```

Compilation uses the `solc` npm package (0.8.26, via-IR, cancun), so no compiler download is needed.

> These contracts have not been audited. Do not deploy them with real funds before an independent audit.
