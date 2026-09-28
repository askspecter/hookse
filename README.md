# Rigs

Launch coins on Pons V2 with an automatic 80/20 creator-fee split, plus a catalog and builder for Uniswap v4 hook rule blocks. Robinhood Chain (4663).

## Site

Static pages, no build step. Serve the folder (`python3 -m http.server`) or deploy it to any static host.

| Page | What it does |
| --- | --- |
| `/` | Landing page |
| `/deploy` | Admin: deploy every contract from your wallet, generate `config.js`, change treasury and royalties |
| `/app` | Coins: every Rigs coin as a card (curve, v4 pools, auctions) |
| `/launch` | Launch a coin on Pons V2 (wallet signs) |
| `/portfolio` | Earn: claim your 80% of creator fees, harvest, look up a coin (`/claim` redirects here) |
| `/coin?token=…` | Coin page: chart, rules, activity and details on the left, buy/sell panel on the right, creator-only claim, pot winnings |
| `/auctions` | Dutch auctions: create, buy, end and withdraw |
| `/builder` | Build: switch rule blocks on in a swap pipeline, check conflicts, open a pool |
| `/hooks`, `/hook?id=…` | Rules: the five blocks (Launch Guard, Impact Fee, Buy Burn, LP Boost, Counter Pot) and a page for each |
| `/scan` | Decode any v4 hook's permission bits from its address |
| `/integrations`, `/agents`, `rigs.manifest.json` | For integrators and bots |
| `/learn`, `/docs` | Guides and developer docs |
| `/token` | $RIGS: official contract address, price, market cap, burned total, treasury and the 10% buyback & burn |
| `/community`, `/updates`, `/privacy`, `/terms` | Leaderboard, changelog, legal |

Logo uploads go through `api/upload.js` into Vercel KV (connect a KV / Upstash Redis store to the Vercel project) and are served by `api/img.js`. `api/meta.js` serves coin logos and one-liners: Pons coins are read from their launch transaction; any coin's creator can change them by signing a message (checked against the chain). `api/eth-usd.js` returns the ETH/USD spot price (Coinbase, then Kraken, then CoinGecko; cached a minute at the edge) so prices and market caps show in dollars; if no source answers, the pages fall back to ETH. URLs are clean (`/launch`, `/coin?token=…`) via `cleanUrls` in `vercel.json`.

`CONFIG.official` names the official $RIGS coin. It was launched directly on Pons, so the site finds its curve from its launch transaction (verified with a simulated buy) and pins it first on Coins and the home page with an Official badge. Set `official.curve` to skip the lookup.

Shared code: `shell.js` (top bar, mobile tab bar and More sheet, search ⌘K, theme), `web3.js` (viem client, wallet, ABIs), `config.js` (addresses), `hooks-data.js` (rule blocks).

## Going live (from the browser, no private keys)

1. Deploy the site, open `/deploy` and connect the wallet that should own Rigs (it needs a little ETH on Robinhood Chain for gas).
2. Sign the seven steps: fee splitter template, Pons launcher, CREATE2 deployer, hook (address mined in the browser), v4 launcher, hook → launcher link, swap router, auctions. Large contracts go through the CREATE2 deployer so wallets that cap creations at 1.2M gas still work. Progress is saved in that browser.
3. Copy or download the generated `config.js`, replace the one in the repo, and redeploy the site. Also put the launcher address in `rigs.manifest.json`.

Before step 2 of the v4 part, verify the Uniswap v4 PoolManager address for Robinhood Chain on the explorer; the page checks that it answers like a PoolManager but cannot prove it is the official one.

The same page has admin actions: change the treasury and set block-author royalties. After changing contracts, run `npm run export-web` in `engine/` to refresh `contracts/*.json`.

Until the addresses are set in `config.js`, launching, claiming, pool creation and auctions are disabled and the pages say so. All numbers on the site are read from the chain.

## Contracts

See `engine/` — Hardhat project with tests (`npm test`). Not audited.
