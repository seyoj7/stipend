import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "@/app/components/Providers";
import { AppShell } from "@/app/components/AppShell";

export const metadata: Metadata = {
  applicationName: "Stipend",
  title: {
    default: "Stipend | Agent Spending Wallet",
    template: "%s | Stipend",
  },
  description: "A programmable spending wallet for AI agents.",
  icons: {
    icon: [
      { url: "/favicon.ico", type: "image/x-icon" },
      { url: "/Stipend Logo.png", type: "image/png" },
    ],
    apple: "/Stipend Logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
