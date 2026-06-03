"use client";

import Link from "next/link";
import { Activity } from "lucide-react";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { useShell } from "@/components/layout/shell-context";
import { cn } from "@/lib/utils";

/** App brand lockup, reused by the sidebar and the mobile drawer header. */
export function Brand({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <Link
      href="/"
      className={cn("flex items-center", collapsed ? "justify-center" : "gap-2")}
      title={collapsed ? "Cursor Lens" : undefined}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Activity className="h-4 w-4" />
      </span>
      {!collapsed ? (
        <span className="flex flex-col leading-tight">
          <span className="text-sm font-semibold">Cursor Lens</span>
          <span className="text-[11px] text-muted-foreground">Cursor team insights</span>
        </span>
      ) : null}
    </Link>
  );
}

/** Fixed desktop sidebar (hidden on small screens; the mobile drawer takes over). */
export function Sidebar() {
  const { sidebarCollapsed } = useShell();

  return (
    <aside
      className={cn(
        "hidden h-full shrink-0 flex-col gap-4 overflow-y-auto border-r bg-card/40 p-3 transition-[width] duration-200 ease-in-out md:flex",
        sidebarCollapsed ? "w-16" : "w-60",
      )}
    >
      <Brand collapsed={sidebarCollapsed} />
      <SidebarNav collapsed={sidebarCollapsed} />
      {!sidebarCollapsed ? (
        <p className="px-3 text-[11px] leading-relaxed text-muted-foreground">
          Read-only. Data refreshes when a sync runs.
        </p>
      ) : null}
    </aside>
  );
}
