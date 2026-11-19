"use client";

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { aevum } from "@/app/lib/stipend";

export const wagmiConfig = getDefaultConfig({
  appName: "Stipend",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "stipend-builder-challenge",
  chains: [aevum],
  ssr: true,
});
