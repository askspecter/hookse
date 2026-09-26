const { expect } = require("chai");
const { ethers } = require("hardhat");

const ZERO32 = ethers.ZeroHash;
const socials = { twitter: "", telegram: "", discord: "", website: "", farcaster: "" };

async function setup() {
  const [owner, creator, trader, treasury, other] = await ethers.getSigners();
  const pons = await (await ethers.getContractFactory("MockPonsFactory")).deploy();
  const escrow = await pons.feeEscrow();
  const impl = await (await ethers.getContractFactory("CreatorFeeSplitter")).deploy(escrow);
  const launcher = await (await ethers.getContractFactory("PonsLauncher")).deploy(pons, impl, owner.address, treasury.address);
  const fee = await pons.launchFee();

  const params = (o = {}) => ({
    name: "Hook Frog", symbol: "HFROG", logo: "", description: "", socials,
    creatorTaxBps: 100, launchConfigId: 0n, expectedEconomics: ZERO32, salt: ethers.id("salt"), minTokensOut: 0n, ...o,
  });
  async function launch(signer = creator, devBuy = 0n) {
    await (await launcher.connect(signer).launch(params(), { value: fee + devBuy })).wait();
    const id = (await launcher.launchCount()) - 1n;
    const l = await launcher.launches(id);
    return {
      id, token: await ethers.getContractAt("MockPonsToken", l.token), curve: await ethers.getContractAt("MockPonsCurve", l.curve),
      splitter: await ethers.getContractAt("CreatorFeeSplitter", l.splitter), creator: l.creator,
    };
  }
  const buy = (curve, signer, wei) => curve.connect(signer).buy(wei, 0n, signer.address, { value: wei });
  return { owner, creator, trader, treasury, other, pons, launcher, fee, params, launch, buy };
}

describe("Pons V2 launch (80% creator / 20% treasury)", () => {
  it("launches on Pons with the coin's own splitter as creator-fee recipient", async () => {
    const { launch, pons, launcher, creator } = await setup();
    const l = await launch();
    expect(await pons.lastRecipient()).to.equal(await l.splitter.getAddress());
    expect(await pons.lastTax()).to.equal(100n);
    expect(l.creator).to.equal(creator.address);
    expect(await l.splitter.creator()).to.equal(creator.address);
    expect(await l.splitter.curve()).to.equal(await l.curve.getAddress());
    expect(await launcher.idOf(await l.token.getAddress())).to.equal(l.id);
    expect(await launcher.launchesOf(creator.address)).to.deep.equal([l.id]);
  });

  it("requires at least the Pons launch fee", async () => {
    const { launcher, params, fee, creator } = await setup();
    await expect(launcher.connect(creator).launch(params(), { value: fee - 1n })).to.be.revertedWith("launch fee");
  });

  it("buys on the curve for the creator with ETH above the launch fee", async () => {
    const { launch, creator } = await setup();
    const l = await launch(creator, ethers.parseEther("0.1"));
    expect(await l.token.balanceOf(creator.address)).to.equal(ethers.parseEther("0.099") * 1_000_000n);
  });

  it("harvest splits creator fees 80/20 and the creator claims their share", async () => {
    const { launch, buy, trader, creator, treasury, other } = await setup();
    const l = await launch();
    await buy(l.curve, trader, ethers.parseEther("10")); // 0.1 ETH creator fee
    // Fees stay on the curve until swept, so views only see them after a harvest.
    expect(await l.splitter.claimable()).to.equal(0n);

    const tBefore = await ethers.provider.getBalance(treasury.address);
    await l.splitter.connect(other).harvest(); // anyone can harvest
    expect((await ethers.provider.getBalance(treasury.address)) - tBefore).to.equal(ethers.parseEther("0.02"));
    expect(await l.splitter.creatorOwed()).to.equal(ethers.parseEther("0.08"));

    await buy(l.curve, trader, ethers.parseEther("5")); // another 0.05 ETH, claimed with auto-harvest
    const cBefore = await ethers.provider.getBalance(creator.address);
    const rc = await (await l.splitter.connect(creator).claim()).wait();
    const got = (await ethers.provider.getBalance(creator.address)) - cBefore + rc.gasUsed * rc.gasPrice;
    expect(got).to.equal(ethers.parseEther("0.12"));
    expect(await l.splitter.totalToTreasury()).to.equal(ethers.parseEther("0.03"));
    expect(await l.splitter.claimable()).to.equal(0n);
  });

  it("only the creator can claim or hand over the creator share", async () => {
    const { launch, buy, trader, creator, other } = await setup();
    const l = await launch();
    await buy(l.curve, trader, ethers.parseEther("1"));
    await expect(l.splitter.connect(other).claim()).to.be.revertedWith("not creator");
    await expect(l.splitter.connect(other).setCreator(other.address)).to.be.revertedWith("not creator");
    await l.splitter.connect(creator).setCreator(other.address);
    await l.splitter.connect(other).claim();
    expect(await l.splitter.creatorOwed()).to.equal(0n);
  });

  it("cannot be re-initialized and only the owner moves the treasury", async () => {
    const { launch, launcher, other, owner } = await setup();
    const l = await launch();
    await expect(l.splitter.initialize(other.address)).to.be.revertedWith("initialized");
    await expect(l.splitter.setCurve(other.address)).to.be.revertedWith("curve set");
    await expect(launcher.connect(other).setTreasury(other.address)).to.be.revertedWithCustomError(launcher, "OwnableUnauthorizedAccount");
    await launcher.connect(owner).setTreasury(other.address);
    expect(await launcher.treasury()).to.equal(other.address);
  });
});
