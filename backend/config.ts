import "server-only";
import { timingSafeEqual } from "node:crypto";
import { getAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const STIPEND_ADDRESS = getAddress(
  process.env.STIPEND_CONTRACT_ADDRESS ?? "0xD30686E7240F79b93ba89Fb81c0f52631D6E51fc",
);

export function getAgentAccount() {
  const privateKey = process.env.AGENT_PRIVATE_KEY;
  if (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error("AGENT_PRIVATE_KEY must be a 32-byte 0x-prefixed private key set in the server environment.");
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
