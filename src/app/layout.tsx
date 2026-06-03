import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Sidebar } from "@/components/layout/sidebar";
import { ShellProvider } from "@/components/layout/shell-context";
import { Topbar } from "@/components/layout/topbar";
import { AskAgentRoot } from "@/components/ask/ask-agent-root";
import { CachePendingBanner } from "@/components/dashboard/cache-pending-banner";

export const metadata: Metadata = {
  title: "Cursor Lens",
  description: "Self-hosted dashboard and agent for your team's Cursor Admin & Analytics data.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <ShellProvider>
            <div className="flex h-screen overflow-hidden">
              <Sidebar />
              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <Topbar />
                <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
                  <main className="scrollbar-hide mx-auto min-h-0 min-w-0 flex-1 space-y-6 overflow-y-auto p-4 sm:p-6 lg:p-8 xl:max-w-7xl">
                    <CachePendingBanner />
                    {children}
                  </main>
                  <AskAgentRoot />
                </div>
              </div>
            </div>
          </ShellProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
