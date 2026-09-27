const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { deployEngine, config, BLOCKS } = require("../scripts/lib");

const MIN_SQRT = 4295128739n + 1n;
const settings = { takeClaims: false, settleUsingBurn: false };
const E = (n) => ethers.parseEther(String(n));
const warp = async (s) => { await network.provider.send("evm_increaseTime", [s]); await network.provider.send("evm_mine"); };

describe("Existing-asset pools", () => {
  async function setup() {
    const [owner, holder, buyer, other] = await ethers.getSigners();
    const pm = await (await ethers.getContractFactory("PoolManager")).deploy(owner.address);
    const router = await (await ethers.getContractFactory("PoolSwapTest")).deploy(pm);
    const { hook, launcher } = await deployEngine({ poolManager: await pm.getAddress(), owner: owner.address });
    const token = await (await ethers.getContractFactory("MockPonsToken")).deploy("Old Coin", "OLD", holder.address);
    return { owner, holder, buyer, other, pm, router, hook, launcher, token };
  }

  it("opens a hooked pool for an existing token, locks the tokens and pays LP fees to the opener", async () => {
    const { holder, buyer, pm, router, launcher, token } = await setup();
    const amount = E(100_000_000);
    await token.connect(holder).approve(launcher, amount);
    const before = await token.balanceOf(holder.address);
    await launcher.connect(holder).openExisting(token, amount, 184200, config({ blocks: BLOCKS.AUTO_BURN, burnBps: 100 }));
    const spent = before - (await token.balanceOf(holder.address));
    expect(spent).to.be.lte(amount);
    expect(await token.balanceOf(await pm.getAddress())).to.be.closeTo(amount, amount / 1_000_000n);

    const k = await launcher.keyOf(token);
    const key = { currency0: k[0], currency1: k[1], fee: k[2], tickSpacing: k[3], hooks: k[4] };
    await router.connect(buyer).swap(key, { zeroForOne: true, amountSpecified: -E(0.5), sqrtPriceLimitX96: MIN_SQRT }, settings, "0x", { value: E(0.5) });
    expect(await token.balanceOf(buyer.address)).to.be.gt(0n);

    const ethBefore = await ethers.provider.getBalance(holder.address);
    await launcher.connect(buyer).collectCreatorFees(token);
    expect(await ethers.provider.getBalance(holder.address)).to.be.gt(ethBefore);
    const id = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address", "address", "uint24", "int24", "address"], [...k]));
    expect((await launcher.launches(id)).existing).to.equal(true);
  });

  it("rejects a second pool for the same token and non-contract tokens", async () => {
    const { holder, launcher, token } = await setup();
    await token.connect(holder).approve(launcher, E(2_000_000));
    await launcher.connect(holder).openExisting(token, E(1_000_000), 184200, config());
    await expect(launcher.connect(holder).openExisting(token, E(1_000_000), 184200, config())).to.be.reverted;
    await expect(launcher.connect(holder).openExisting(holder.address, 1n, 184200, config())).to.be.revertedWithCustomError(launcher, "BadToken");
  });
});

describe("Dutch auctions", () => {
  async function setup() {
    const [seller, buyer, other] = await ethers.getSigners();
    const token = await (await ethers.getContractFactory("MockPonsToken")).deploy("Sale", "SALE", seller.address);
    const auctions = await (await ethers.getContractFactory("RigsAuctions")).deploy();
    await token.connect(seller).approve(auctions, E(1000));
    // 1000 tokens, price 0.01 → 0.001 ETH per token over 1 hour
    await auctions.connect(seller).create(token, E(1000), E(0.01), E(0.001), 0, 3600);
    return { seller, buyer, other, token, auctions };
  }

  it("price falls linearly to the floor", async () => {
    const { auctions } = await setup();
    expect(await auctions.priceOf(0)).to.be.closeTo(E(0.01), E(0.0001));
    await warp(1800);
    expect(await auctions.priceOf(0)).to.be.closeTo(E(0.0055), E(0.0001));
    await warp(3600);
    expect(await auctions.priceOf(0)).to.equal(E(0.001));
  });

  it("sells at the current price, refunds excess and caps at what is left", async () => {
    const { auctions, buyer, token } = await setup();
    const cost = await auctions.quote(0, E(10));
    await expect(auctions.connect(buyer).buy(0, E(10), { value: cost / 2n })).to.be.revertedWithCustomError(auctions, "Underpaid");
    const before = await ethers.provider.getBalance(buyer.address);
    const rc = await (await auctions.connect(buyer).buy(0, E(10), { value: E(1) })).wait();
    const paid = before - (await ethers.provider.getBalance(buyer.address)) - rc.gasUsed * rc.gasPrice;
    expect(await token.balanceOf(buyer.address)).to.equal(E(10));
    expect(paid).to.be.closeTo(E(0.1), E(0.001)); // excess refunded
    await auctions.connect(buyer).buy(0, E(5000), { value: E(20) });
    expect((await auctions.auctions(0)).sold).to.equal(E(1000));
    await expect(auctions.connect(buyer).buy(0, 1n, { value: E(1) })).to.be.revertedWithCustomError(auctions, "SoldOut");
  });

  it("seller withdraws proceeds any time and unsold tokens after the end", async () => {
    const { auctions, seller, buyer, other, token } = await setup();
    await auctions.connect(buyer).buy(0, E(100), { value: E(2) });
    await expect(auctions.connect(other).withdraw(0)).to.be.revertedWithCustomError(auctions, "NotSeller");
    const tokBefore = await token.balanceOf(seller.address);
    await auctions.connect(seller).withdraw(0);
    expect(await token.balanceOf(seller.address)).to.equal(tokBefore); // still running: no tokens back
    await auctions.connect(seller).end(0);
    await expect(auctions.connect(buyer).buy(0, 1n, { value: E(1) })).to.be.revertedWithCustomError(auctions, "NotActive");
    await auctions.connect(seller).withdraw(0);
    expect(await token.balanceOf(seller.address)).to.equal(tokBefore + E(900));
  });

  it("rejects bad parameters", async () => {
    const { auctions, token, seller } = await setup();
    await expect(auctions.connect(seller).create(token, E(1), E(0.001), E(0.01), 0, 3600)).to.be.revertedWithCustomError(auctions, "BadParams");
    await expect(auctions.connect(seller).create(token, E(1), E(0.01), E(0.001), 0, 31 * 86400)).to.be.revertedWithCustomError(auctions, "BadParams");
  });
});
