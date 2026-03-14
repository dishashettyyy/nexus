const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const VaultFactory = await hre.ethers.getContractFactory("VaultFactory");
  const factory = await VaultFactory.deploy(deployer.address);
  await factory.waitForDeployment();

  const factoryAddress = await factory.getAddress();
  console.log("VaultFactory deployed at:", factoryAddress);
  console.log("Add this to your frontend .env.local:");
  console.log("NEXT_PUBLIC_FACTORY_ADDRESS=" + factoryAddress);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});