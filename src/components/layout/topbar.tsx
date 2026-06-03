"use client";

import { Suspense } from "react";
import { PanelLeft, PanelLeftClose } from "lucide-react";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Brand } from "@/components/layout/sidebar";
import { useShell } from "@/components/layout/shell-context";
import { DateRangePicker } from "@/components/dashboard/date-range-picker";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";

/**
 * Sticky top bar: mobile nav trigger + brand (small screens), a contextual title, and the
 * global controls (date range + theme). The date picker reads `useSearchParams`, so it is
 * wrapped in Suspense per the App Router requirement.
 */
export function Topbar() {
  const { sidebarCollapsed, toggleSidebar } = useShell();

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur">
      <MobileNav />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="hidden shrink-0 md:inline-flex"
        onClick={toggleSidebar}
        aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar to icons"}
        title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {sidebarCollapsed ? (
          <PanelLeft className="h-4 w-4" />
        ) : (
          <PanelLeftClose className="h-4 w-4" />
        )}
      </Button>
      <div className="md:hidden">
        <Brand />
      </div>
      <span className="hidden text-sm font-medium text-muted-foreground md:inline">
        Analytics dashboard
      </span>
      <div className="ml-auto flex items-center gap-2">
        <Suspense fallback={<div className="h-9 w-[150px] rounded-md border bg-muted/40" />}>
          <DateRangePicker />
        </Suspense>
        <ModeToggle />
      </div>
    </header>
  );
}
