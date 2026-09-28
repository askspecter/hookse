const { expect } = require("chai");
const { ethers, network } = require("hardhat");

const socials = { twitter: "", telegram: "", discord: "", website: "", farcaster: "" };
const SOLANA = 792703809n;
const RAFFLE = 0, HOLD = 1, BURN = 2;
// A Collector Crypt gacha machine is listed like a Solana collection, keyed by its pack code.
const machineId = (code) => ethers.keccak256(ethers.toUtf8Bytes(`collectorcrypt:${code}`));

async function setup() {
  const [owner, keeper, treasury, creator, alice, bob, trader] = await ethers.getSigners();
  const arb = await (await ethers.getContractFactory("MockArbSys")).deploy();
  await network.provider.send("hardhat_setCode", ["0x0000000000000000000000000000000000000064", await ethers.provider.getCode(arb)]);

  const pons = await (await ethers.getContractFactory("MockPonsFactory")).deploy();
  const registry = await (await ethers.getContractFactory("Registry")).deploy(owner.address, keeper.address, treasury.address);
  const raffles = await (await ethers.getContractFactory("Raffles")).deploy(registry);
  const sweepImpl = await (await ethers.getContractFactory("SweepVault")).deploy(registry, raffles);
  const extImpl = await (await ethers.getContractFactory("ExternalVault")).deploy(registry, raffles);
  const routerImpl = await (await ethers.getContractFactory("FeeRouter")).deploy(registry, await pons.feeEscrow());
  const launcher = await (await ethers.getContractFactory("Launcher")).deploy(pons, registry, sweepImpl, routerImpl);
  const extLauncher = await (await ethers.getContractFactory("ExternalLauncher")).deploy(pons, registry, extImpl, routerImpl);
  const fee = await pons.launchFee();
  const base = { name: "Pack Rat", symbol: "PACK", logo: "", description: "", socials, creatorTaxBps: 100, launchConfigId: 0n, expectedEconomics: ethers.ZeroHash, salt: ethers.id("s") };
  return { owner, keeper, treasury, creator, alice, bob, trader, pons, registry, raffles, launcher, extLauncher, fee, base };
}

async function drawRaffle(raffles, vault, id) {
  await network.provider.send("evm_increaseTime", [15 * 60]);
  await raffles.commitDraw(vault, id);
  const r = await raffles.raffles(vault, id);
  await network.provider.send("hardhat_mine", [ethers.toQuantity(r.drawBlock - BigInt(await ethers.provider.getBlockNumber()) + 1n)]);
  await raffles.draw(vault, id);
  return (await raffles.raffles(vault, id)).winningTicket;
}

describe("Paired coins (fees buy NFTs or gacha packs for holders)", () => {
  it("routes creator fees 80% to the vault and 20% to the Rigs treasury", async () => {
    const { owner, registry, extLauncher, creator, trader, treasury, fee, base } = await setup();
    await registry.connect(owner).setCollection(await extLauncher.collectionKey(SOLANA, machineId("pokemon_50")), true);
    await extLauncher.connect(creator).launch({ ...base, chainId: SOLANA, collection: machineId("pokemon_50"), isEvm: false, policy: RAFFLE }, { value: fee });
    const l = await extLauncher.launches(0);
    const curve = await ethers.getContractAt("MockPonsCurve", l.curve);
    await curve.connect(trader).buy(ethers.parseEther("10"), 0n, trader.address, { value: ethers.parseEther("10") }); // 0.1 ETH fee
    const before = await ethers.provider.getBalance(treasury.address);
    await (await ethers.getContractAt("FeeRouter", l.router)).harvest();
    expect(await ethers.provider.getBalance(l.vault)).to.equal(ethers.parseEther("0.08"));
    expect((await ethers.provider.getBalance(treasury.address)) - before).to.equal(ethers.parseEther("0.02"));
  });

  it("only launches against listed collections and machines", async () => {
    const { extLauncher, launcher, creator, fee, base } = await setup();
    await expect(extLauncher.connect(creator).launch({ ...base, chainId: SOLANA, collection: machineId("pokemon_50"), isEvm: false, policy: RAFFLE }, { value: fee }))
      .to.be.revertedWith("collection not listed");
    await expect(launcher.connect(creator).launch({ ...base, collection: ethers.ZeroAddress, policy: RAFFLE }, { value: fee }))
      .to.be.revertedWith("collection not listed");
  });

  it("gacha: withdrawal waits an hour, the pull is raffled, the winner names a Solana wallet, delivery is recorded", async () => {
    const { owner, keeper, registry, raffles, extLauncher, creator, alice, bob, fee, base } = await setup();
    const id32 = machineId("pokemon_50");
    await registry.connect(owner).setCollection(await extLauncher.collectionKey(SOLANA, id32), true);
    await extLauncher.connect(creator).launch({ ...base, chainId: SOLANA, collection: id32, isEvm: false, policy: RAFFLE }, { value: fee });
    const vault = await ethers.getContractAt("ExternalVault", (await extLauncher.launches(0)).vault);
    await owner.sendTransaction({ to: vault, value: ethers.parseEther("1") });

    await vault.connect(keeper).announceWithdrawal(ethers.parseEther("0.02"));
    await expect(vault.connect(keeper).executeWithdrawal()).to.be.revertedWith("not ready");
    await network.provider.send("evm_increaseTime", [3600]);
    await expect(vault.connect(bob).executeWithdrawal()).to.be.revertedWith("not keeper");
    await vault.connect(keeper).executeWithdrawal();
    expect(await vault.totalWithdrawn()).to.equal(ethers.parseEther("0.02"));

    const mint = BigInt(ethers.id("pulled card mint")); // the pulled card's Solana mint as uint256
    await vault.connect(keeper).recordPurchase(mint, ethers.parseEther("0.02"), ethers.id("sol pack tx"));
    expect(await vault.held(mint)).to.equal(true);

    const leaf = (a, s, e) => ethers.keccak256(ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256", "uint256"], [a, s, e])));
    const la = leaf(alice.address, 0n, 60n), lb = leaf(bob.address, 60n, 100n);
    const root = ethers.keccak256(ethers.concat(la < lb ? [la, lb] : [lb, la]));
    await raffles.connect(keeper).openRaffle(vault, mint, root, 100n);
    const win = await drawRaffle(raffles, vault, 0n);
    const [winner, start, end, proof] = win < 60n ? [alice, 0n, 60n, [lb]] : [bob, 60n, 100n, [la]];
    await raffles.claim(vault, 0n, winner.address, start, end, proof);
    expect(await vault.prizeOwedTo(mint)).to.equal(winner.address);

    await expect(vault.connect(keeper).markDelivered(mint, ethers.id("send"))).to.be.revertedWith("no destination");
    const loser = winner === alice ? bob : alice;
    await expect(vault.connect(loser).setPrizeDestination(mint, ethers.id("x"))).to.be.revertedWith("not winner");
    await vault.connect(winner).setPrizeDestination(mint, ethers.id("winner solana wallet"));
    await vault.connect(keeper).markDelivered(mint, ethers.id("send"));
    expect(await vault.prizeOwedTo(mint)).to.equal(ethers.ZeroAddress);
  });

  it("owner can cancel an announced withdrawal", async () => {
    const { owner, keeper, registry, extLauncher, creator, fee, base, bob } = await setup();
    const id32 = machineId("pokemon_250");
    await registry.connect(owner).setCollection(await extLauncher.collectionKey(SOLANA, id32), true);
    await extLauncher.connect(creator).launch({ ...base, chainId: SOLANA, collection: id32, isEvm: false, policy: HOLD }, { value: fee });
    const vault = await ethers.getContractAt("ExternalVault", (await extLauncher.launches(0)).vault);
    await owner.sendTransaction({ to: vault, value: ethers.parseEther("1") });
    await vault.connect(keeper).announceWithdrawal(ethers.parseEther("1"));
    await expect(vault.connect(bob).cancelWithdrawal()).to.be.revertedWith("not owner");
    await vault.connect(owner).cancelWithdrawal();
    expect(await vault.pendingAmount()).to.equal(0n);
  });

  it("Robinhood collection: vault buys the floor under the keeper's ceiling and raffles it", async () => {
    const { owner, keeper, registry, raffles, launcher, creator, alice, fee, base, bob } = await setup();
    const nft = await (await ethers.getContractFactory("MockNFT")).deploy();
    const market = await (await ethers.getContractFactory("MockMarket")).deploy(nft);
    await registry.connect(owner).setCollection(nft, true);
    await registry.connect(owner).setMarketplace(market, true);
    await launcher.connect(creator).launch({ ...base, collection: nft, policy: RAFFLE }, { value: fee });
    const vault = await ethers.getContractAt("SweepVault", (await launcher.launches(0)).vault);
    await owner.sendTransaction({ to: vault, value: ethers.parseEther("1") });

    await nft.mint(bob.address, 7n);
    await nft.connect(bob).approve(market, 7n);
    await market.connect(bob).list(7n, ethers.parseEther("0.5"));
    const data = market.interface.encodeFunctionData("fill", [7n]);
    await vault.connect(keeper).postCeiling(ethers.parseEther("0.4"));
    await expect(vault.connect(keeper).buy(market, data, 7n, ethers.parseEther("0.5"))).to.be.revertedWith("above ceiling");
    await vault.connect(keeper).postCeiling(ethers.parseEther("0.5"));
    await vault.connect(keeper).buy(market, data, 7n, ethers.parseEther("0.5"));
    expect(await nft.ownerOf(7n)).to.equal(await vault.getAddress());

    const leaf = ethers.keccak256(ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256", "uint256"], [alice.address, 0n, 10n])));
    await raffles.connect(keeper).openRaffle(vault, 7n, leaf, 10n);
    await drawRaffle(raffles, vault, 0n);
    await raffles.claim(vault, 0n, alice.address, 0n, 10n, []);
    expect(await nft.ownerOf(7n)).to.equal(alice.address);
  });
});
