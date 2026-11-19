"use client";

import { useState } from "react";
import { waitForTransactionReceipt } from "wagmi/actions";
import { useConfig } from "wagmi";

export type TransactionState = {
  status: "idle" | "pending" | "success" | "error";
  message?: string;
  hash?: `0x${string}`;
};

export function useTransaction() {
  const config = useConfig();
  const [state, setState] = useState<TransactionState>({ status: "idle" });

  async function execute(action: () => Promise<`0x${string}`>, successMessage: string) {
    setState({ status: "pending", message: "Confirm the transaction in your wallet…" });
    try {
      const hash = await action();
      setState({ status: "pending", message: "Transaction submitted. Waiting for confirmation…", hash });
      const receipt = await waitForTransactionReceipt(config, { hash });
      if (receipt.status !== "success") throw new Error("The transaction reverted.");
      setState({ status: "success", message: successMessage, hash });
      return hash;
    } catch (error) {
      const message = error instanceof Error ? error.message.split("\n")[0] : "Transaction failed";
      setState({ status: "error", message });
      throw error;
    }
  }

  return { ...state, execute, reset: () => setState({ status: "idle" }) };
}
