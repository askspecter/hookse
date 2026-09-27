// Rule blocks of RigsHook (engine/contracts/RigsHook.sol). Parameters mirror RigsHook.Config.
export const BLOCKS = [
  {
    id: "anti-snipe", bit: 1, index: 0, name: "Anti-Snipe", color: "#8b5cf6", icon: "shield", gas: 160,
    short: "Caps early buys and adds a decaying LP fee",
    desc: "For the first blocks after a pool opens, each buy is capped in ETH and pays an extra LP fee that falls linearly to zero.",
    params: [
      { key: "snipeBlocks", label: "Window", unit: "blocks", value: 100, min: 1, max: 1000, step: 1 },
      { key: "snipeMaxBuy", label: "Max buy", unit: "ETH", value: 0.5, min: 0.01, max: 100, step: 0.01 },
      { key: "snipeFee", label: "Extra fee at open", unit: "%", value: 5, min: 0, max: 10, step: 0.1 },
    ],
    tradeoff: "A tight cap can sit below the Nth-Buy Pot's minimum qualifying buy. While the window is open, no buy can then count for the pot. The builder warns you when that happens.",
    mechanics: ["Runs in beforeSwap (fee) and afterSwap (cap).", "Cap is checked on the ETH actually paid, so exact-output buys cannot bypass it.", "Fee decays by block number: extra × blocksLeft / window."],
  },
  {
    id: "surge-fee", bit: 2, index: 1, name: "Surge Fee", color: "#ff8a00", icon: "bars", gas: 120,
    short: "LP fee rises with trade size",
    desc: "The LP fee climbs from the base fee toward a ceiling as a swap's ETH-equivalent size approaches a reference size.",
    params: [
      { key: "surgeMaxFee", label: "Fee ceiling", unit: "%", value: 3, min: 0.05, max: 10, step: 0.05 },
      { key: "surgeRefSize", label: "Size at ceiling", unit: "ETH", value: 1, min: 0.01, max: 1000, step: 0.01 },
    ],
    tradeoff: "Large honest trades pay more too. Pick a reference size well above typical retail swaps.",
    mechanics: ["Dynamic fee returned from beforeSwap with the override flag.", "Token-denominated sizes are converted to ETH at the current pool price.", "Fee = base + (ceiling − base) × min(size, ref) / ref."],
  },
  {
    id: "auto-burn", bit: 4, index: 2, name: "Auto Burn", color: "#ff4d4d", icon: "flame", gas: 140,
    short: "Burns a share of each buy's output",
    desc: "A share of every exact-input buy's token output is sent straight to the dead address, shrinking supply with volume.",
    params: [{ key: "burnBps", label: "Burn share", unit: "%", value: 1, min: 0, max: 5, step: 0.05 }],
    tradeoff: "Exact-output buys specify the token amount, so there is no output side to burn from; those buys are not burned.",
    mechanics: ["Taken in afterSwap through the returned delta.", "Tokens go to 0x…dEaD via PoolManager.take.", "Sells are never burned."],
  },
  {
    id: "lp-rewards", bit: 8, index: 3, name: "LP Rewards", color: "#40b66b", icon: "drop", gas: 150,
    short: "Donates a slice of each swap to LPs",
    desc: "A share of every swap is donated to liquidity in range at the current price, on top of the normal LP fee.",
    params: [{ key: "lpBps", label: "Donation share", unit: "%", value: 0.5, min: 0, max: 5, step: 0.05 }],
    tradeoff: "If no liquidity is in range the donation is skipped, so nothing is charged for it.",
    mechanics: ["Taken in afterSwap, then passed to PoolManager.donate.", "Only in-range positions receive it."],
  },
  {
    id: "nth-buy-pot", bit: 16, index: 4, name: "Nth-Buy Pot", color: "#ffc700", icon: "pot", gas: 180,
    short: "A public counter pays every Nth buy",
    desc: "A share of each swap fills a pot. Every Nth buy above a minimum size wins the whole pot. There is no randomness: the counter is on-chain.",
    params: [
      { key: "potBps", label: "Pot share", unit: "%", value: 1, min: 0, max: 5, step: 0.05 },
      { key: "potEvery", label: "Every Nth buy", unit: "", value: 50, min: 2, max: 10000, step: 1 },
      { key: "potMinBuy", label: "Min qualifying buy", unit: "ETH", value: 0.01, min: 0, max: 10, step: 0.001 },
    ],
    tradeoff: "Because the counter is public, bots can time the Nth buy. Pair with Anti-Snipe and a sensible minimum buy.",
    mechanics: ["Winner is the address in hookData, else tx.origin.", "Winnings are pulled with claim(currency) on the hook."],
  },
];


export const BASE_FEES = [
  { fee: 0.05, label: "Stable or tightly pegged pairs" },
  { fee: 0.3, label: "Recommended default" },
  { fee: 1, label: "Thin or volatile pairs" },
];

// v4 hook permission flags, bit 13 down to bit 0 of the hook address.
export const FLAGS = [
  "beforeInitialize", "afterInitialize", "beforeAddLiquidity", "afterAddLiquidity", "beforeRemoveLiquidity",
  "afterRemoveLiquidity", "beforeSwap", "afterSwap", "beforeDonate", "afterDonate",
  "beforeSwapReturnDelta", "afterSwapReturnDelta", "afterAddLiquidityReturnDelta", "afterRemoveLiquidityReturnDelta",
];

const PATHS = {
  shield: '<path d="M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6z"/>',
  bars: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
  flame: '<path d="M12 3c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-4 3-6 1 2 2 2 3 2 0-3-1-5 0-7z"/>',
  drop: '<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/>',
  pot: '<path d="M5 10h14l-1.5 9h-11zM8 10V7a4 4 0 0 1 8 0v3"/>',
  cycle: '<path d="M4 12a8 8 0 0 1 14-5l2 2M20 12a8 8 0 0 1-14 5l-2-2M20 4v5h-5M4 20v-5h5"/>',
};
export const blockIcon = (b, size = 16) =>
  `<span class="bicon" style="color:${b.color};background:${b.color}22;border-color:${b.color}44"><svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${PATHS[b.icon]}</svg></span>`;

// ---------------------------------------------------------------- shared rule logic (Builder + Launch wizard)

export const defaultValues = () => Object.fromEntries(BLOCKS.map((b) => [b.id, Object.fromEntries(b.params.map((p) => [p.key, p.value]))]));

/** RigsHook.Config for the chosen base fee (%), enabled block ids and parameter values. Amounts in wei as strings. */
export function configFor(baseFee, on, v) {
  const pips = (pct) => Math.round(pct * 10000);
  const bps = (pct) => Math.round(pct * 100);
  const wei = (eth) => (BigInt(Math.round(eth * 1e6)) * 10n ** 12n).toString();
  let blocks = 0;
  BLOCKS.forEach((b) => { if (on.has(b.id)) blocks |= b.bit; });
  return {
    blocks, baseFee: pips(baseFee),
    snipeBlocks: v["anti-snipe"].snipeBlocks, snipeFee: pips(v["anti-snipe"].snipeFee), snipeMaxBuy: wei(v["anti-snipe"].snipeMaxBuy),
    surgeMaxFee: pips(v["surge-fee"].surgeMaxFee), surgeRefSize: wei(v["surge-fee"].surgeRefSize),
    burnBps: bps(v["auto-burn"].burnBps), lpBps: bps(v["lp-rewards"].lpBps), potBps: bps(v["nth-buy-pot"].potBps),
    potEvery: v["nth-buy-pot"].potEvery, potMinBuy: wei(v["nth-buy-pot"].potMinBuy),
  };
}

/** Rule combinations that would misbehave or make the launch revert. */
export function conflictsFor(baseFee, on, v) {
  const out = [];
  if (on.has("anti-snipe") && on.has("nth-buy-pot") && v["anti-snipe"].snipeMaxBuy < v["nth-buy-pot"].potMinBuy) {
    out.push(`Anti-Snipe caps buys at ${v["anti-snipe"].snipeMaxBuy} ETH, below the pot's ${v["nth-buy-pot"].potMinBuy} ETH minimum: no buy can count for the pot during the snipe window.`);
  }
  if (on.has("surge-fee") && v["surge-fee"].surgeMaxFee <= baseFee) out.push("Surge Fee ceiling is not above the base fee, so it never changes anything.");
  const takes = (on.has("auto-burn") ? v["auto-burn"].burnBps : 0) + (on.has("lp-rewards") ? v["lp-rewards"].lpBps : 0) + (on.has("nth-buy-pot") ? v["nth-buy-pot"].potBps : 0);
  if (takes + 0.25 * BLOCKS.length > 10) out.push(`Takes add up to ${takes.toFixed(2)}%. With the maximum royalties that passes the 10% cap, so the launch would revert.`);
  if (baseFee > 10) out.push("Base LP fee is capped at 10%.");
  return out;
}

/** Opening tick for `supply` tokens valued at `mcapEth`: price is tokens per ETH, rounded down to spacing 60. */
export function startTickFor(supply, mcapEth) {
  return Math.floor(Math.floor(Math.log(supply / mcapEth) / Math.log(1.0001)) / 60) * 60;
}
