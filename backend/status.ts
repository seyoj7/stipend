import "server-only";
import { getAgentAccount, STIPEND_ADDRESS } from "./config";
import { publicClient, stipendAbi } from "./chain";
import { getLastAgentRun } from "./run-status";

export function getAgentStatus() {
  return { agent: getAgentAccount().address };
}

export async function getAgentHealth() {
  const lastRun = getLastAgentRun();
  let agent: ReturnType<typeof getAgentAccount>;
  try {
    agent = getAgentAccount();
  } catch {
    let vaultPaused: boolean | null = null;
    try {
      vaultPaused = await publicClient.readContract({
        address: STIPEND_ADDRESS,
        abi: stipendAbi,
        functionName: "paused",
      });
    } catch {
      // Return partial health data when the chain is unavailable.
    }

    return {
      agentAddress: null,
      contractAddress: STIPEND_ADDRESS,
      keyConfigured: false,
      vaultPaused,
      agentRevoked: null,
      openInvoices: null,
      lastRun,
      message: "Agent key is missing or invalid. Set AGENT_PRIVATE_KEY in the server environment.",
    };
  }

  const [vaultPaused, policy, invoiceList] = await Promise.all([
    publicClient.readContract({
      address: STIPEND_ADDRESS,
      abi: stipendAbi,
      functionName: "paused",
    }),
    publicClient.readContract({
      address: STIPEND_ADDRESS,
      abi: stipendAbi,
      functionName: "policies",
      args: [agent.address],
    }),
    publicClient.readContract({
      address: STIPEND_ADDRESS,
      abi: stipendAbi,
      functionName: "getOpenInvoices",
      args: [agent.address, 0n, 0n],
    }),
  ]);

  return {
    agentAddress: agent.address,
    contractAddress: STIPEND_ADDRESS,
    keyConfigured: true,
    vaultPaused,
    agentRevoked: policy[5],
    openInvoices: Number(invoiceList[1]),
    lastRun,
  };
}
