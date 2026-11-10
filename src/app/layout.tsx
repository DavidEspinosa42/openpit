import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "../features/app-shell.tsx";
import { WorkspaceProvider } from "../features/workspace-provider.tsx";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenPit",
  description:
    "Plan a day of track operations for a racing school and catch scheduling conflicts before they reach the pit lane.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WorkspaceProvider>
          <AppShell>{children}</AppShell>
        </WorkspaceProvider>
      </body>
    </html>
  );
}
