import "server-only";
import { timingSafeEqual } from "node:crypto";
import { getAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const AEVUM_CHAIN_ID = 44_005;
export const TUSD8_ADDRESS = getAddress("0x456569838f1d43009A91ebA4263147Afd7233483");
export const STIPEND_ADDRESS = getAddress(
  process.env.STIPEND_CONTRACT_ADDRESS ?? "0x812c046D4D93489fbD955c584CEC8d2b4b0aa97C",
);

export function getAgentAccount() {
  const privateKey = process.env.AGENT_PRIVATE_KEY;
  if (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error("AGENT_PRIVATE_KEY must be a 32-byte 0x-prefixed key in .env.local");
  }

  return privateKeyToAccount(privateKey as Hex);
}

export function isAuthorizedAgentRun(authorization: string | null): boolean {
  const token = process.env.AGENT_RUN_TOKEN;
  if (!token || !authorization?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(authorization.slice("Bearer ".length));
  const expected = Buffer.from(token);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
