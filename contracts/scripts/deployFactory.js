const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with:", deployer.address);

  // Deploy VaultFactory
  const VaultFactory = await hre.ethers.getContractFactory("VaultFactory");
  const factory = await VaultFactory.deploy(deployer.address);
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();

  console.log("VaultFactory deployed at:", factoryAddress);

  // Deploy WillRegistry
  const WillRegistry = await hre.ethers.getContractFactory("WillRegistry");
  const willRegistry = await WillRegistry.deploy();
  await willRegistry.waitForDeployment();
  const willRegistryAddress = await willRegistry.getAddress();

  console.log("WillRegistry deployed at:", willRegistryAddress);

  console.log("\nSet these environment variables:");
  console.log("BACKEND FACTORY_ADDRESS=" + factoryAddress);
  console.log("BACKEND WILL_REGISTRY_ADDRESS=" + willRegistryAddress);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

