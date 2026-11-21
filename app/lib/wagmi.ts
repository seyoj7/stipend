"use client";

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { aevum } from "@/app/lib/stipend";

type AppGlobal = typeof globalThis & {
  __stipendWagmiConfig?: ReturnType<typeof getDefaultConfig>;
};

const appGlobal = globalThis as AppGlobal;

export const wagmiConfig =
  appGlobal.__stipendWagmiConfig ??
  (appGlobal.__stipendWagmiConfig = getDefaultConfig({
    appName: "Stipend",
    projectId:
      process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ||
      "stipend-builder-challenge",
    chains: [aevum],
    ssr: true,
  }));
