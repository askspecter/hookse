const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { deployEngine, config, BLOCKS } = require("../scripts/lib");

const ETH = ethers.ZeroAddress;
const DEAD = "0x000000000000000000000000000000000000dEaD";
const MIN_SQRT = 4295128739n + 1n;
const MAX_SQRT = 1461446703485210103287273052203988822378723970342n - 1n;
const SUPPLY = ethers.parseEther("1000000000");
const START_TICK = 184200; // ~1e8 tokens per ETH
const settings = { takeClaims: false, settleUsingBurn: false };

async function mine(n) {
  await network.provider.send("hardhat_mine", ["0x" + n.toString(16)]);
}

async function setup(cfgOverrides) {
  const [owner, creator, buyer, author, other] = await ethers.getSigners();
  const pm = await (await ethers.getContractFactory("PoolManager")).deploy(owner.address);
  const router = await (await ethers.getContractFactory("PoolSwapTest")).deploy(pm);
  const { hook, launcher } = await deployEngine({ poolManager: await pm.getAddress(), owner: owner.address });

  const cfg = config(cfgOverrides);
  const tx = await launcher.connect(creator).launch("Test Hook", "THOOK", SUPPLY, START_TICK, cfg);
  const rc = await tx.wait();
  const ev = rc.logs.map(l => { try { return launcher.interface.parseLog(l); } catch { return null; } }).find(e => e && e.name === "Launched");
  const tokenAddr = ev.args.token;
  const token = await ethers.getContractAt("RigsToken", tokenAddr);
  const key = await launcher.keyOf(tokenAddr);
  const poolKey = { currency0: key[0], currency1: key[1], fee: key[2], tickSpacing: key[3], hooks: key[4] };

  const buy = (signer, wei, hookData = "0x") =>
    router.connect(signer).swap(poolKey, { zeroForOne: true, amountSpecified: -wei, sqrtPriceLimitX96: MIN_SQRT }, settings, hookData, { value: wei });
  const sell = async (signer, amount) => {
    await token.connect(signer).approve(await router.getAddress(), amount);
    return router.connect(signer).swap(poolKey, { zeroForOne: false, amountSpecified: -amount, sqrtPriceLimitX96: MAX_SQRT }, settings, "0x");
  };
  return { owner, creator, buyer, author, other, pm, router, hook, launcher, token, poolKey, id: ev.args.id, buy, sell };
}

describe("Rigs engine", function () {
  it("launches a token and seeds the entire supply into a locked v4 pool", async () => {
    const { pm, launcher, token, creator } = await setup();
    const pmBal = await token.balanceOf(await pm.getAddress());
    expect(pmBal).to.be.closeTo(SUPPLY, SUPPLY / 1_000_000n);
    expect(pmBal + (await token.balanceOf(DEAD))).to.equal(SUPPLY);
    expect(await token.creator()).to.equal(creator.address);
    expect(await launcher.tokenCount()).to.equal(1n);
  });

  it("lets anyone buy and sell through the hooked pool", async () => {
    const { buyer, token, buy, sell } = await setup();
    await buy(buyer, ethers.parseEther("0.1"));
    const got = await token.balanceOf(buyer.address);
    expect(got).to.be.gt(ethers.parseEther("1000000"));
    const ethBefore = await ethers.provider.getBalance(buyer.address);
    await sell(buyer, got / 2n);
    expect(await ethers.provider.getBalance(buyer.address)).to.be.gt(ethBefore - ethers.parseEther("0.01"));
  });

  it("blocks direct pool creation on the hook by anyone but the launcher", async () => {
    const { pm, hook, poolKey, other } = await setup();
    const fake = { ...poolKey, tickSpacing: 10 };
    await expect(pm.connect(other).initialize(fake, 79228162514264337593543950336n)).to.be.reverted;
    await expect(hook.connect(other).register(fake, config())).to.be.revertedWithCustomError(hook, "NotLauncher");
  });

  it("rejects configs whose takes exceed the cap", async () => {
    const { launcher, creator } = await setup();
    const bad = config({ blocks: BLOCKS.AUTO_BURN, burnBps: 1000 });
    await expect(launcher.connect(creator).launch("Bad", "BAD", SUPPLY, START_TICK, bad)).to.be.reverted;
  });

  describe("Anti-Snipe", () => {
    const cfg = { blocks: BLOCKS.ANTI_SNIPE, snipeBlocks: 10, snipeFee: 50000, snipeMaxBuy: ethers.parseEther("0.05") };

    it("caps buy size during the opening window, then lifts it", async () => {
      const { buyer, buy, hook } = await setup(cfg);
      await expect(buy(buyer, ethers.parseEther("0.2"))).to.be.reverted;
      await buy(buyer, ethers.parseEther("0.04"));
      await mine(10);
      await buy(buyer, ethers.parseEther("0.2"));
    });

    it("adds an extra LP fee that decays to the base fee", async () => {
      const { hook, id } = await setup(cfg);
      const early = await hook.quoteFee(id, 0);
      await mine(5);
      const mid = await hook.quoteFee(id, 0);
      await mine(10);
      const late = await hook.quoteFee(id, 0);
      expect(early).to.be.gt(mid);
      expect(mid).to.be.gt(late);
      expect(late).to.equal(3000n);
    });
  });

  it("Surge Fee: bigger trades pay a higher LP fee, capped at the max", async () => {
    const { hook, id } = await setup({ blocks: BLOCKS.SURGE_FEE, surgeMaxFee: 30000, surgeRefSize: ethers.parseEther("1") });
    expect(await hook.quoteFee(id, 0)).to.equal(3000n);
    expect(await hook.quoteFee(id, ethers.parseEther("0.5"))).to.equal(16500n);
    expect(await hook.quoteFee(id, ethers.parseEther("5"))).to.equal(30000n);
  });

  it("Auto Burn: sends a share of each buy's output to the dead address", async () => {
    const { buyer, buy, token } = await setup({ blocks: BLOCKS.AUTO_BURN, burnBps: 200 });
    const deadBefore = await token.balanceOf(DEAD);
    await buy(buyer, ethers.parseEther("0.1"));
    const burned = (await token.balanceOf(DEAD)) - deadBefore;
    const got = await token.balanceOf(buyer.address);
    // buyer receives 98% of output, 2% is burned
    expect(burned * 49n).to.be.closeTo(got, got / 1000n);
  });

  it("Nth-Buy Pot: every Nth qualifying buy wins the pot", async () => {
    const { buyer, other, buy, sell, hook, id, token } = await setup({
      blocks: BLOCKS.NTH_BUY_POT, potBps: 300, potEvery: 3, potMinBuy: ethers.parseEther("0.01"),
    });
    const tok = await token.getAddress();
    const winnerData = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [other.address]);

    await buy(buyer, ethers.parseEther("0.05"));
    await buy(buyer, ethers.parseEther("0.001")); // below minimum, not counted
    await sell(buyer, (await token.balanceOf(buyer.address)) / 4n); // funds the pot in ETH
    await buy(buyer, ethers.parseEther("0.05"));
    expect(await hook.pot(id, tok)).to.be.gt(0n);
    expect(await hook.pot(id, ETH)).to.be.gt(0n);

    await buy(buyer, ethers.parseEther("0.05"), winnerData); // 3rd qualifying buy
    expect(await hook.pot(id, tok)).to.equal(0n);
    const wonTok = await hook.claimable(other.address, tok);
    const wonEth = await hook.claimable(other.address, ETH);
    expect(wonTok).to.be.gt(0n);
    expect(wonEth).to.be.gt(0n);

    await hook.connect(other).claim(tok);
    expect(await token.balanceOf(other.address)).to.equal(wonTok);
    const before = await ethers.provider.getBalance(other.address);
    const rc = await (await hook.connect(other).claim(ETH)).wait();
    expect(await ethers.provider.getBalance(other.address)).to.equal(before + wonEth - rc.gasUsed * rc.gasPrice);
  });

  it("LP Rewards + creator fees: donations and LP fees are claimable by the creator", async () => {
    const { buyer, creator, buy, sell, launcher, token } = await setup({ blocks: BLOCKS.LP_REWARDS, lpBps: 100 });
    await buy(buyer, ethers.parseEther("0.2"));
    await sell(buyer, (await token.balanceOf(buyer.address)) / 2n);
    const ethBefore = await ethers.provider.getBalance(creator.address);
    const tokBefore = await token.balanceOf(creator.address);
    await launcher.connect(buyer).collectCreatorFees(await token.getAddress());
    expect(await ethers.provider.getBalance(creator.address)).to.be.gt(ethBefore);
    expect(await token.balanceOf(creator.address)).to.be.gt(tokBefore);
  });

  it("Author royalties: block authors earn on pools that use their block", async () => {
    const { owner, buyer, author, buy, hook, token } = await setup({ blocks: BLOCKS.AUTO_BURN, burnBps: 100 });
    await hook.connect(owner).setAuthor(2, author.address, 25); // AUTO_BURN is block index 2
    await buy(buyer, ethers.parseEther("0.1"));
    const tok = await token.getAddress();
    const owed = await hook.claimable(author.address, tok);
    expect(owed).to.be.gt(0n);
    await hook.connect(author).claim(tok);
    expect(await token.balanceOf(author.address)).to.equal(owed);
    await expect(hook.connect(buyer).setAuthor(2, buyer.address, 25)).to.be.revertedWithCustomError(hook, "NotOwner");
  });
});
