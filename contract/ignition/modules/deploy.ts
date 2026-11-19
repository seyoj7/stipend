import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const TUSD8_ADDRESS = "0x456569838f1d43009A91ebA4263147Afd7233483";

export default buildModule("StipendModule", (m) => {
  const stipend = m.contract("Stipend", [TUSD8_ADDRESS]);

  return { stipend };
});
