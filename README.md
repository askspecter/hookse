# Hookse

Launch coins on Pons V2 with an automatic 80/20 creator-fee split, plus a catalog and builder for Uniswap v4 hook rule blocks. Robinhood Chain (4663).

## Site

Static pages, no build step. Serve the folder (`python3 -m http.server`) or deploy it to any static host.

| Page | What it does |
| --- | --- |
| `index.html` | Landing page |
| `app.html` | Discover: live launches from the launcher, hooks, pools |
| `launch.html` | Launch a coin on Pons V2 (wallet signs) |
| `portfolio.html` | Creator fees: claim your 80%, harvest, look up a coin (`claim.html` redirects here) |
| `builder.html` | Compose rule blocks, check conflicts, get the `HookseHook` config |
| `hooks.html`, `hook.html?id=…` | Rule-block catalog and detail pages |
| `scan.html` | Decode any v4 hook's permission bits from its address |
| `integrations.html`, `agents.html`, `hookse.manifest.json` | For integrators and bots |
| `learn.html`, `docs.html` | Guides and developer docs |
| `community.html`, `updates.html`, `token.html`, `privacy.html`, `terms.html` | Leaderboard, changelog, token, legal |

Shared code: `shell.js` (sidebar, search ⌘K, theme), `web3.js` (viem client, wallet, ABIs), `config.js` (addresses), `hooks-data.js` (rule blocks).

## Going live

1. Deploy the contracts: see `engine/README.md` (`scripts/deploy-pons.js --network robinhood`).
2. Put `ponsLauncher` and `startBlock` in `config.js` (and in `hookse.manifest.json`).
3. Optional: set `reownProjectId` in `config.js` for WalletConnect.

Until `ponsLauncher` is set, launching and claiming are disabled and the pages say so. The stats and pool table on the landing page are sample data.

## Contracts

See `engine/` — Hardhat project with tests (`npm test`). Not audited.
