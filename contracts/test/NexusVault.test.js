const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("NexusVault via VaultFactory", function () {
  let factory, vault;
  let owner, beneficiary1, beneficiary2, stranger;

  const INACTIVITY_PERIOD = 30 * 24 * 60 * 60; // 30 days in seconds

  beforeEach(async function () {
    [owner, beneficiary1, beneficiary2, stranger] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("VaultFactory");
    factory = await Factory.deploy();

    const tx = await factory
      .connect(owner)
      .createVault(
        [beneficiary1.address, beneficiary2.address],
        INACTIVITY_PERIOD
      );
    const receipt = await tx.wait();

    const vaultAddress = await factory.getVault(owner.address);
    vault = await ethers.getContractAt("NexusVault", vaultAddress);

    // Fund the vault
    await owner.sendTransaction({
      to: vaultAddress,
      value: ethers.parseEther("1.0"),
    });
  });

  describe("ping()", function () {
    it("owner can ping and reset lastPing", async function () {
      const before = await vault.lastPing();
      await time.increase(60);
      await vault.connect(owner).ping();
      const after = await vault.lastPing();
      expect(after).to.be.gt(before);
    });

    it("non-owner cannot ping", async function () {
      await expect(vault.connect(stranger).ping()).to.be.revertedWith(
        "Not owner"
      );
    });
  });

  describe("executeInheritance()", function () {
    it("cannot execute before inactivity period elapses", async function () {
      await expect(vault.executeInheritance()).to.be.revertedWith(
        "Inactivity period not elapsed"
      );
    });

    it("executes after inactivity period and distributes ETH equally", async function () {
      await time.increase(INACTIVITY_PERIOD + 1);

      const b1Before = await ethers.provider.getBalance(beneficiary1.address);
      const b2Before = await ethers.provider.getBalance(beneficiary2.address);

      await vault.connect(stranger).executeInheritance();

      const b1After = await ethers.provider.getBalance(beneficiary1.address);
      const b2After = await ethers.provider.getBalance(beneficiary2.address);

      expect(b1After - b1Before).to.equal(ethers.parseEther("0.5"));
      expect(b2After - b2Before).to.equal(ethers.parseEther("0.5"));
    });

    it("sets executed = true after execution", async function () {
      await time.increase(INACTIVITY_PERIOD + 1);
      await vault.connect(stranger).executeInheritance();
      expect(await vault.executed()).to.equal(true);
    });

    it("prevents double execution", async function () {
      await time.increase(INACTIVITY_PERIOD + 1);
      await vault.connect(stranger).executeInheritance();
      await expect(vault.executeInheritance()).to.be.revertedWith(
        "Already executed"
      );
    });
  });

  describe("checkUpkeep / performUpkeep", function () {
    it("checkUpkeep returns false before inactivity period", async function () {
      const [needed] = await vault.checkUpkeep("0x");
      expect(needed).to.equal(false);
    });

    it("checkUpkeep returns true after inactivity period", async function () {
      await time.increase(INACTIVITY_PERIOD + 1);
      const [needed] = await vault.checkUpkeep("0x");
      expect(needed).to.equal(true);
    });

    it("performUpkeep triggers executeInheritance", async function () {
      await time.increase(INACTIVITY_PERIOD + 1);
      await vault.connect(stranger).performUpkeep("0x");
      expect(await vault.executed()).to.equal(true);
    });
  });

  describe("VaultFactory", function () {
    it("prevents a user from creating a second vault", async function () {
      await expect(
        factory
          .connect(owner)
          .createVault([beneficiary1.address], INACTIVITY_PERIOD)
      ).to.be.revertedWith("Vault already exists");
    });
  });
});

