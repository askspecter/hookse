# Rigs

Launch coins on Pons V2 with an automatic 80/20 creator-fee split, plus a catalog and builder for Uniswap v4 hook rule blocks. Robinhood Chain (4663).

## Site

Static pages, no build step. Serve the folder (`python3 -m http.server`) or deploy it to any static host.

| Page | What it does |
| --- | --- |
| `/` | Landing page |
| `/deploy` | Admin: deploy every contract from your wallet (Robinhood Chain and Arc), generate `config.js`, change treasury and royalties |
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
| `/community`, `/updates`, `/privacy`, `/terms` | Leaderboard, changelog, legal |

Logo uploads go through `api/upload.js` into Vercel KV (connect a KV / Upstash Redis store to the Vercel project) and are served by `api/img.js`. `api/meta.js` serves coin logos and one-liners: Pons coins are read from their launch transaction; any coin's creator can change them by signing a message (checked against the chain). `api/eth-usd.js` returns the ETH/USD spot price (Coinbase, then Kraken, then CoinGecko; cached a minute at the edge) so prices and market caps show in dollars; if no source answers, the pages fall back to ETH. URLs are clean (`/launch`, `/coin?token=…`) via `cleanUrls` in `vercel.json`.

### Solana (pump.fun)

`/launch` has a chain picker. Solana launches go through pump.fun: `api/sol-launch.js` builds the transactions with the official `@pump-fun/pump-sdk` (create the coin, create its fee-sharing config, set 80% creator / 20% Rigs), the creator's Phantom or Solflare wallet signs them in one prompt, and the function sends them in order and lists the coin once the 20% share is on-chain. `api/sol-meta.js` serves each coin's metadata, and `api/sol-coins.js` lists the coins with their market cap and a fresh read of the split. pump.fun keeps the creator as admin of the split, so a coin that later removes the Rigs share is dropped from Rigs automatically.

Recommended on the Vercel project (Settings → Environment Variables), then redeploy:

| Variable | Value |
| --- | --- |
| `SOL_TREASURY` | Optional. Overrides the Rigs Solana treasury (default `CeEtCANnK4a5H2WHhpCqZiJMwEZSzJ7bWTLYL6ZK1hVk`, also in `config.js`). |
| `SOLANA_RPC_URL` | A Solana mainnet RPC URL (Helius, QuickNode, …). The public RPC rate-limits. |

### Arc (ArgusPad)

Arc launches go through Argus Portal #7 (`CONFIG.arc`, addresses from the official `arguspad.io/argus-v4.json` bundle, version 3). Argus credits the creator's share of every tax and LP fee to whoever called `Portal.launch`, and its splitter's `claim(account)` is permissionless. So each Rigs coin on Arc launches from its own `ArgusVault` (a minimal-proxy clone made by `ArgusLauncher`), which becomes the Argus creator. `release()` on the vault, callable by anyone, claims from Argus and pays 80% to the creator and 20% to the Rigs Arc treasury, in USDC (and in the coin, for the token leg). A creator payout that fails is kept for the next release and never blocks the treasury share.

The site mines each launch's hook salt in the browser: it first checks the Portal's own salt formula and hook deployer against `predictHook`, and uses a salt only after `predictHook` says it is valid. The launch curve (starting and bonding market cap) is read from the newest USDC launch on Portal #7, so Rigs coins open on the same curve as ArgusPad's own. Taxes are 1–10% per side; the creator share can include buyback & burn. Coins show on `/app#arc`, creators claim on `/portfolio#arc`.

To go live, open `/deploy`, sign the two Arc steps (vault template, launcher; gas is USDC on Arc), and put the generated `arc.launcher` into `config.js`.



Shared code: `shell.js` (top bar, mobile tab bar and More sheet, search ⌘K, theme), `web3.js` (viem client, wallet, ABIs), `config.js` (addresses), `hooks-data.js` (rule blocks).

## Going live (from the browser, no private keys)

1. Deploy the site, open `/deploy` and connect the wallet that should own Rigs (it needs a little ETH on Robinhood Chain for gas).
2. Sign the seven steps: fee splitter template, Pons launcher, CREATE2 deployer, hook (address mined in the browser), v4 launcher, hook → launcher link, swap router, auctions. Large contracts go through the CREATE2 deployer so wallets that cap creations at 1.2M gas still work. Progress is saved in that browser.
3. Copy or download the generated `config.js`, replace the one in the repo, and redeploy the site. Also put the launcher address in `rigs.manifest.json`.

Before step 2 of the v4 part, verify the Uniswap v4 PoolManager address for Robinhood Chain on the explorer; the page checks that it answers like a PoolManager but cannot prove it is the official one.

The same page has admin actions: change the treasury and set block-author royalties. After changing contracts, run `npm run export-web` in `engine/` to refresh `contracts/*.json`.

Until the addresses are set in `config.js`, launching, claiming, pool creation and auctions are disabled and the pages say so. All numbers on the site are read from the chain.

## Contracts

See `engine/` — Hardhat project with tests (`npm test`). Arc contracts are in `engine/contracts/arc/`. Not audited.
