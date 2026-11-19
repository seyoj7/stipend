"use client";

import { useEffect, useState } from "react";
import type { Address } from "viem";

export function useAgentAddress() {
  const [agent, setAgent] = useState<Address>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    let active = true;
    fetch("/api?action=status", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load the agent wallet. Check server environment variables.");
        return response.json() as Promise<{ agent: Address }>;
      })
      .then((data) => { if (active) setAgent(data.agent); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load agent wallet"); });
    return () => { active = false; };
  }, []);
  return { agent, error };
}
