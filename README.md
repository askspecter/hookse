# Rigs

Launch coins on Pons V2 with an automatic 80/20 creator-fee split, plus a catalog and builder for Uniswap v4 hook rule blocks. Robinhood Chain (4663).

## Site

Static pages, no build step. Serve the folder (`python3 -m http.server`) or deploy it to any static host.

| Page | What it does |
| --- | --- |
| `index.html` | Landing page |
| `deploy.html` | Admin: deploy every contract from your wallet, generate `config.js`, change treasury and royalties |
| `app.html` | Discover: live launches from the launcher, hooks, pools |
| `launch.html` | Launch a coin on Pons V2 (wallet signs) |
| `portfolio.html` | Creator fees: claim your 80%, harvest, look up a coin (`claim.html` redirects here) |
| `auctions.html` | Dutch auctions: create, buy, end and withdraw |
| `builder.html` | Compose rule blocks, check conflicts, get the `RigsHook` config |
| `hooks.html`, `hook.html?id=…` | Rule-block catalog and detail pages |
| `scan.html` | Decode any v4 hook's permission bits from its address |
| `integrations.html`, `agents.html`, `rigs.manifest.json` | For integrators and bots |
| `learn.html`, `docs.html` | Guides and developer docs |
| `community.html`, `updates.html`, `token.html`, `privacy.html`, `terms.html` | Leaderboard, changelog, token, legal |

Logo uploads go through `api/upload.js` into Vercel KV (connect a KV / Upstash Redis store to the Vercel project) and are served by `api/img.js`.

Shared code: `shell.js` (sidebar, search ⌘K, theme), `web3.js` (viem client, wallet, ABIs), `config.js` (addresses), `hooks-data.js` (rule blocks).

## Going live (from the browser, no private keys)

1. Deploy the site, open `deploy.html` and connect the wallet that should own Rigs (it needs a little ETH on Robinhood Chain for gas).
2. Sign the seven steps: fee splitter template, Pons launcher, CREATE2 deployer, hook (address mined in the browser), v4 launcher, hook → launcher link, auctions. Large contracts go through the CREATE2 deployer so wallets that cap creations at 1.2M gas still work. Progress is saved in that browser.
3. Copy or download the generated `config.js`, replace the one in the repo, and redeploy the site. Also put the launcher address in `rigs.manifest.json`.

Before step 2 of the v4 part, verify the Uniswap v4 PoolManager address for Robinhood Chain on the explorer; the page checks that it answers like a PoolManager but cannot prove it is the official one.

The same page has admin actions: change the treasury and set block-author royalties. After changing contracts, run `npm run export-web` in `engine/` to refresh `contracts/*.json`.

Until the addresses are set in `config.js`, launching, claiming, pool creation and auctions are disabled and the pages say so. All numbers on the site are read from the chain.

## Contracts

See `engine/` — Hardhat project with tests (`npm test`). Not audited.
