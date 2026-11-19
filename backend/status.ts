import "server-only";
import { getAgentAccount } from "./config";

export function getAgentStatus() {
  return { agent: getAgentAccount().address };
}
