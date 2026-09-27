// Real Pons V2 on a Robinhood Chain fork. Skipped unless FORK=1:
//   FORK=1 npx hardhat test test/pons.fork.test.js
const { expect } = require("chai");
const { ethers, network } = require("hardhat");

const PONS = "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e";

(process.env.FORK ? describe : describe.skip)("Pons V2 fork: launch → buy → harvest → claim", () => {
  it("routes real Pons creator fees 80/20", async () => {
    const [owner, creator, trader, treasury] = await ethers.getSigners();
    const pons = await ethers.getContractAt("IPonsFactory", PONS);
    const impl = await (await ethers.getContractFactory("CreatorFeeSplitter")).deploy(await pons.feeEscrow());
    const launcher = await (await ethers.getContractFactory("PonsLauncher")).deploy(PONS, impl, owner.address, treasury.address);

    const fee = await pons.launchFee();
    await launcher.connect(creator).launch({
      name: "Fork Test", symbol: "FORK", logo: "", description: "",
      socials: { twitter: "", telegram: "", discord: "", website: "", farcaster: "" },
      creatorTaxBps: 100, launchConfigId: 0n, expectedEconomics: await pons.previewLaunchEconomics(0n, ethers.ZeroAddress),
      salt: ethers.id("rigs-fork-test"), minTokensOut: 0n,
    }, { value: fee });
    const l = await launcher.launches(0n);
    const splitter = await ethers.getContractAt("CreatorFeeSplitter", l.splitter);

    await network.provider.send("evm_increaseTime", [3600]); // past the snipe-tax window
    await network.provider.send("evm_mine");
    const curve = await ethers.getContractAt("IPonsCurve", l.curve);
    await curve.connect(trader).buy(ethers.parseEther("1"), 0n, trader.address, { value: ethers.parseEther("1") });

    const tBefore = await ethers.provider.getBalance(treasury.address);
    await splitter.harvest();
    const toTreasury = (await ethers.provider.getBalance(treasury.address)) - tBefore;
    const owed = await splitter.creatorOwed();
    console.log("      creator fees harvested (ETH):", ethers.formatEther(owed + toTreasury));
    expect(owed).to.be.gt(0n);
    expect(toTreasury).to.equal((owed + toTreasury) * 2000n / 10000n);
    await splitter.connect(creator).claim();
    expect(await splitter.creatorOwed()).to.equal(0n);
  });
});
