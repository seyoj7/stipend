import "server-only";

export type AgentRunSummary = {
  at: string;
  result: "completed" | "failed";
  paid: number;
  blocked: number;
  errors: number;
};

// Best-effort status for the current server process. Serverless cold starts may
// not retain it, so callers must handle a missing lastRun value.
let lastRun: AgentRunSummary | null = null;

export function getLastAgentRun() {
  return lastRun;
}

export function setLastAgentRun(summary: AgentRunSummary) {
  lastRun = summary;
}
