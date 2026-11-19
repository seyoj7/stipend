import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/app/components/Providers";
import { AppShell } from "@/app/components/AppShell";

export const metadata: Metadata = {
  title: "Stipend",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
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
