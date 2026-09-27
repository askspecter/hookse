# Rigs — skill file for agents

Rigs runs on Robinhood Chain (chain id 4663, RPC `https://rpc.mainnet.chain.robinhood.com`).
Everything below is a plain contract call. No account, no API key. Always re-read live addresses
from `/rigs.manifest.json` on the Rigs site (or `/config.js`) before acting; the list here can lag.

## Addresses (Robinhood Chain)

| Contract | Address |
| --- | --- |
| PoolManager (Uniswap v4) | `0x8366a39CC670B4001A1121B8F6A443A643e40951` |
| RigsHook | `0x9B2c27AD954b3e20F8739670D9c26a18e9daE0C4` |
| RigsLauncher | `0x9b33583252B833864e35b555cB3d5F0cFFABeDfa` |
| RigsRouter | `0x9BfA528A6e01B20552089f7368Da82dF1aB65b8a` |
| RigsAuctions | `0x4d96761b25bc1E552dBB2d4B2f01A8cF1e64320C` |
| PonsLauncher (80/20 creator fees) | `0xC8aD3EaeD98980f94c36F842d99ecFB96511E4DD` |
| Pons V2 factory | `0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e` |

ABIs: `rigs.manifest.json` and `/contracts/*.json` (Rigs contracts).

## Pool key and pool id

Every Rigs pool pairs native ETH with one token:

```
key = (currency0 = 0x0000…0000, currency1 = token, fee = 0x800000, tickSpacing = 60, hooks = RigsHook)
poolId = keccak256(abi.encode(key))
```

`RigsLauncher.keyOf(token)` returns the key. `currency1 == token` means Rigs has a pool for it.

## Read

- Rules: `RigsHook.getPool(poolId)` → `(Config cfg, launchBlock, buyCount)`. `cfg.blocks` bits:
  1 Anti-Snipe, 2 Surge Fee, 4 Auto Burn, 8 LP Rewards, 16 Nth-Buy Pot. Fees in pips, takes in bps.
- Fee for a trade now: `RigsHook.quoteFee(poolId, ethSize)` (pips, before takes).
- Price: `PoolManager.extsload(keccak256(poolId ‖ bytes32(6)))`, low 160 bits = sqrtPriceX96.
  Token raw units per wei = (sqrtPriceX96 / 2^96)^2.
- Launch data: `RigsLauncher.launches(poolId)` → token, creator, ticks, liquidity, existing.
- Pons coins: `PonsLauncher.idOf(token)`, `launches(id)` → token, curve, splitter, creator, time.

## Quote and trade

- Rigs pool, buy: simulate `RigsRouter.buy(key, 0, recipient)` with `value = ETH in`; the return is tokens out.
  Send the same call with `minOut = quote × (1 − slippage)`.
- Rigs pool, sell: `approve(RigsRouter, amount)`, simulate `RigsRouter.sell(key, amount, 0, recipient)`,
  then send with a real `minOut`.
- Pons coin before graduation: same pattern on the curve: `buy(quoteIn, minTokensOut, recipient)` (payable)
  and `sell(tokensIn, minQuoteOut, recipient)` after approving the curve. A revert means it graduated;
  trade it on Pons.

## Launch

- Pons V2 coin with an 80/20 creator split: `PonsLauncher.launch(params)` with
  `value = pons.launchFee() + optional dev buy`, and
  `params.expectedEconomics = pons.previewLaunchEconomics(0, address(0))`.
- New token in an instant Rigs pool: `RigsLauncher.launch(name, symbol, supply, startTick, cfg)`.
  `startTick` is a multiple of 60; price in tokens per ETH is `1.0001^startTick`.
- Existing token: `approve(RigsLauncher, amount)` then `RigsLauncher.openExisting(token, amount, startTick, cfg)`.
  The tokens are locked for good; one Rigs pool per token.

## Claim

- Pons creator share (creator only): `CreatorFeeSplitter(splitter).claim()`. Anyone may `harvest()`.
- Rigs pool LP fees: `RigsLauncher.collectCreatorFees(token)` (anyone can call; pays the creator).
- Pot winnings and royalties: `RigsHook.claimable(account, currency)` then `RigsHook.claim(currency)`
  with `currency = 0x0` for ETH or the token address.

## Auctions

`RigsAuctions`: `auctionCount()`, `auctions(id)`, `priceOf(id)`, `quote(id, tokens)`,
`buy(id, tokens)` payable (excess refunded), `create(token, amount, startPrice, floorPrice, 0, duration)`
after approving, seller `end(id)` and `withdraw(id)`. Prices are wei per whole token (1e18 units).

## Safety rules

1. Quote with a simulation before every swap and send a real minimum out. Never send `minOut = 0`.
2. Read the pool's rules first. During an Anti-Snipe window buys above the cap revert and pay an extra fee.
3. Never sign a call whose simulation reverted.
4. Every number is a chain read at one block. Re-read right before you act on it.
5. Only move funds the wallet owner asked you to move. The contracts are not audited.
