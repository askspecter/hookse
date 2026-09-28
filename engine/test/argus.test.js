const { expect } = require("chai");
const { ethers } = require("hardhat");

const USDC = (n) => ethers.parseUnits(String(n), 6);

async function setup() {
  const [owner, creator, trader, treasury, other] = await ethers.getSigners();
  const usdc = await (await ethers.getContractFactory("MockUsdc")).deploy();
  const portal = await (await ethers.getContractFactory("MockArgusPortal")).deploy();
  const impl = await (await ethers.getContractFactory("ArgusVault")).deploy(usdc);
  const launcher = await (await ethers.getContractFactory("ArgusLauncher")).deploy(portal, impl, owner.address, treasury.address);
  await usdc.mint(creator.address, USDC(1000));
  await usdc.mint(trader.address, USDC(1000));

  const params = (o = {}) => ({
    name: "Arc Frog", symbol: "AFROG", totalSupply: ethers.parseEther("1000000000"),
    startFdvUsdc6: USDC(5000), bondFdvUsdc6: USDC(60000), buyTaxBps: 300, sellTaxBps: 300,
    creatorBps: 10000, burnBps: 0, dividendBps: 0, liquidityBps: 0, devBuyQuote: 0n, quoteAsset: usdc.target, expectConvert: 1, ...o,
  });
  const meta = { imageURI: "https://userigs.fun/api/img?id=x", website: "", twitter: "", telegram: "", description: "" };
  async function launch(signer = creator, o = {}, salt = ethers.id("s1")) {
    const p = params(o);
    if (p.devBuyQuote) await usdc.connect(signer).approve(launcher, p.devBuyQuote);
    const predicted = await launcher.vaultFor(signer.address, salt);
    await (await launcher.connect(signer).launch(p, meta, salt, ethers.id("hook"))).wait();
    const id = (await launcher.launchCount()) - 1n;
    const l = await launcher.launches(id);
    const vault = await ethers.getContractAt("ArgusVault", l.vault);
    const token = await ethers.getContractAt("MockArgusToken", l.token);
    const splitter = await ethers.getContractAt("MockArgusSplitter", await vault.splitter());
    return { id, l, vault, token, splitter, predicted };
  }
  /** Simulates Argus crediting the creator (the vault) with tax. */
  async function credit(splitter, q, t = 0n, token) {
    if (q) { await usdc.connect(trader).approve(splitter, q); }
    if (t) { await token.connect(trader).approve(splitter, t); }
    await splitter.connect(trader).credit(q, t);
  }
  return { owner, creator, trader, treasury, other, usdc, portal, impl, launcher, params, meta, launch, credit };
}

describe("Argus (Arc) launch (80% creator / 20% treasury)", () => {
  it("launches with the coin's own vault as the Argus creator, at the predicted address", async () => {
    const { launch, portal, creator, launcher } = await setup();
    const { l, vault, predicted } = await launch();
    expect(l.vault).to.equal(predicted);
    expect(l.creator).to.equal(creator.address);
    expect(await vault.creator()).to.equal(creator.address);
    expect(await vault.launcher()).to.equal(launcher.target);
    const rec = await portal.launches(l.token);
    expect(rec[0]).to.equal(l.vault);
    expect(await portal.lastSalt()).to.equal(ethers.id("s1"));
    expect(await portal.lastHookSalt()).to.equal(ethers.id("hook"));
    expect(await launcher.idOf(l.token)).to.equal(0n);
    expect(await launcher.logoOf(l.token)).to.equal("https://userigs.fun/api/img?id=x");
    expect(await launcher.launchesOf(creator.address)).to.deep.equal([0n]);
  });

  it("forwards dev-buy coins and the unspent quote to the creator", async () => {
    const { launch, creator, usdc } = await setup();
    const before = await usdc.balanceOf(creator.address);
    const { token, vault } = await launch(creator, { devBuyQuote: USDC(10) });
    expect(await usdc.balanceOf(creator.address)).to.equal(before - USDC(9));
    expect(await token.balanceOf(creator.address)).to.equal(USDC(9) * 1000n);
    expect(await usdc.balanceOf(vault)).to.equal(0n);
    expect(await token.balanceOf(vault)).to.equal(0n);
  });

  it("release claims from Argus and splits quote and coin 80/20", async () => {
    const { launch, credit, creator, treasury, usdc, portal, trader, other } = await setup();
    const { token, vault, splitter, l } = await launch();
    await portal.give(l.token, trader.address, ethers.parseEther("1000"));
    await credit(splitter, USDC(100), ethers.parseEther("50"), token);
    const c0 = await usdc.balanceOf(creator.address);
    await vault.connect(other).release();
    expect(await usdc.balanceOf(creator.address)).to.equal(c0 + USDC(80));
    expect(await usdc.balanceOf(treasury.address)).to.equal(USDC(20));
    expect(await token.balanceOf(creator.address)).to.equal(ethers.parseEther("40"));
    expect(await token.balanceOf(treasury.address)).to.equal(ethers.parseEther("10"));
    expect(await vault.totalToCreator(usdc)).to.equal(USDC(80));
    expect(await vault.totalToTreasury(usdc)).to.equal(USDC(20));
  });

  it("still splits funds when someone claims to the vault directly", async () => {
    const { launch, credit, creator, treasury, usdc, other } = await setup();
    const { vault, splitter } = await launch();
    await credit(splitter, USDC(50));
    await splitter.connect(other).claim(vault); // permissionless on Argus
    const c0 = await usdc.balanceOf(creator.address);
    await vault.release(); // the Argus claim now reverts NothingToClaim; release still works
    expect(await usdc.balanceOf(creator.address)).to.equal(c0 + USDC(40));
    expect(await usdc.balanceOf(treasury.address)).to.equal(USDC(10));
  });

  it("a blocked creator does not block the treasury share", async () => {
    const { launch, credit, creator, treasury, usdc } = await setup();
    const { vault, splitter } = await launch();
    await credit(splitter, USDC(100));
    await usdc.setBlocked(creator.address, true);
    await vault.release();
    expect(await usdc.balanceOf(treasury.address)).to.equal(USDC(20));
    expect(await vault.creatorOwed(usdc)).to.equal(USDC(80));
    expect(await vault.unsplit(usdc)).to.equal(0n);
    await credit(splitter, USDC(10));
    await vault.release(); // the owed 80 is not split again
    expect(await usdc.balanceOf(treasury.address)).to.equal(USDC(22));
    expect(await vault.creatorOwed(usdc)).to.equal(USDC(88));
    await usdc.setBlocked(creator.address, false);
    const c0 = await usdc.balanceOf(creator.address);
    await vault.release();
    expect(await usdc.balanceOf(creator.address)).to.equal(c0 + USDC(88));
    expect(await vault.creatorOwed(usdc)).to.equal(0n);
  });

  it("creator can hand over the share; only the creator", async () => {
    const { launch, credit, creator, other, usdc } = await setup();
    const { vault, splitter } = await launch();
    await expect(vault.connect(other).setCreator(other.address)).to.be.revertedWith("not creator");
    await vault.connect(creator).setCreator(other.address);
    await credit(splitter, USDC(10));
    await vault.release();
    expect(await usdc.balanceOf(other.address)).to.equal(USDC(8));
  });

  it("vaults cannot be re-initialized or launched twice; implementation is inert", async () => {
    const { launch, launcher, impl, portal, params, meta, other, creator } = await setup();
    const { vault } = await launch();
    await expect(vault.initialize(other.address)).to.be.revertedWith("initialized");
    await expect(vault.launchOn(portal, params(), meta, ethers.ZeroHash, ethers.ZeroHash)).to.be.revertedWith("launched");
    await expect(impl.initialize(other.address)).to.be.revertedWith("initialized");
    // Same creator + salt: the clone address is taken.
    await expect(launcher.connect(creator).launch(params(), meta, ethers.id("s1"), ethers.ZeroHash)).to.be.reverted;
    await launch(creator, {}, ethers.id("s2"));
    expect(await launcher.launchCount()).to.equal(2n);
  });

  it("only the owner sets the treasury", async () => {
    const { launcher, other, owner } = await setup();
    await expect(launcher.connect(other).setTreasury(other.address)).to.be.reverted;
    await launcher.connect(owner).setTreasury(other.address);
    expect(await launcher.treasury()).to.equal(other.address);
  });
});
