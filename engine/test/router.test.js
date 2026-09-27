const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployEngine, config, BLOCKS } = require("../scripts/lib");

const E = (n) => ethers.parseEther(String(n));

describe("RigsRouter", () => {
  async function setup() {
    const [owner, creator, trader, other] = await ethers.getSigners();
    const pm = await (await ethers.getContractFactory("PoolManager")).deploy(owner.address);
    const { hook, launcher } = await deployEngine({ poolManager: await pm.getAddress(), owner: owner.address });
    const router = await (await ethers.getContractFactory("RigsRouter")).deploy(pm);
    await launcher.connect(creator).launch("Frog", "FROG", E(1_000_000_000), 184200,
      config({ blocks: BLOCKS.NTH_BUY_POT | BLOCKS.AUTO_BURN, burnBps: 100, potBps: 100, potEvery: 2, potMinBuy: E(0.001) }));
    const tokenAddr = await launcher.tokens(0);
    const token = await ethers.getContractAt("RigsToken", tokenAddr);
    const k = await launcher.keyOf(tokenAddr);
    const key = { currency0: k[0], currency1: k[1], fee: k[2], tickSpacing: k[3], hooks: k[4] };
    return { owner, creator, trader, other, pm, hook, launcher, router, token, key };
  }

  it("buys with ETH and sells back for ETH", async () => {
    const { trader, router, token, key } = await setup();
    const out = await router.connect(trader).buy.staticCall(key, 0n, trader.address, { value: E(0.1) });
    await router.connect(trader).buy(key, out, trader.address, { value: E(0.1) });
    const bal = await token.balanceOf(trader.address);
    expect(bal).to.equal(out);

    await token.connect(trader).approve(router, bal);
    const ethOut = await router.connect(trader).sell.staticCall(key, bal / 2n, 0n, trader.address);
    const before = await ethers.provider.getBalance(trader.address);
    const rc = await (await router.connect(trader).sell(key, bal / 2n, ethOut, trader.address)).wait();
    expect(await ethers.provider.getBalance(trader.address)).to.equal(before + ethOut - rc.gasUsed * rc.gasPrice);
  });

  it("enforces the minimum output", async () => {
    const { trader, router, key } = await setup();
    const out = await router.connect(trader).buy.staticCall(key, 0n, trader.address, { value: E(0.1) });
    await expect(router.connect(trader).buy(key, out + 1n, trader.address, { value: E(0.1) })).to.be.revertedWithCustomError(router, "TooLittleReceived");
  });

  it("credits pot winnings to the real buyer, not the router", async () => {
    const { trader, router, hook, key } = await setup();
    await router.connect(trader).buy(key, 0n, trader.address, { value: E(0.01) });
    await router.connect(trader).buy(key, 0n, trader.address, { value: E(0.01) }); // 2nd qualifying buy wins
    expect(await hook.claimable(trader.address, key.currency1)).to.be.gt(0n);
    expect(await hook.claimable(await router.getAddress(), key.currency1)).to.equal(0n);
  });
});
