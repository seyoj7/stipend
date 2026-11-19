import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import { configVariable, defineConfig } from "hardhat/config";

export default defineConfig({
  chainDescriptors: {
    44005: {
      name: "Aevum Testnet",
      chainType: "generic",
      blockExplorers: {
        blockscout: {
          name: "Aevum Explorer",
          url: "https://explorer-test.qday.info",
          apiUrl: "https://explorer-test.qday.info/api",
        },
      },
    },
  },
  plugins: [hardhatToolboxViemPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.34",
      },
      production: {
        version: "0.8.34",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  networks: {
    aevum: {
      type: "http",
      chainType: "generic",
      chainId: 44005,
      url: "https://rpc-test.qday.info",
      accounts: [configVariable("AEVUM_PRIVATE_KEY")],
    },
  },
});
