"use client";

import { NAV_ITEMS, SECONDARY_NAV_ITEMS } from "@/components/layout/nav-items";
import { NavLink } from "@/components/layout/nav-link";
import { TooltipProvider } from "@/components/ui/tooltip";

export interface SidebarNavProps {
  collapsed?: boolean;
  /** Called after a link is clicked (used to close the mobile drawer). */
  onNavigate?: () => void;
}

/** The shared nav list, rendered in both the desktop sidebar and the mobile drawer. */
export function SidebarNav({ collapsed = false, onNavigate }: SidebarNavProps) {
  const nav = (
    <nav className="flex flex-1 flex-col gap-1">
      {NAV_ITEMS.map((item) => (
        <NavLink key={item.href} item={item} collapsed={collapsed} onNavigate={onNavigate} />
      ))}
      <div className="my-2 border-t" />
      {!collapsed ? (
        <span className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Tools
        </span>
      ) : null}
      {SECONDARY_NAV_ITEMS.map((item) => (
        <NavLink key={item.href} item={item} collapsed={collapsed} onNavigate={onNavigate} />
      ))}
    </nav>
  );

  if (!collapsed) return nav;

  return <TooltipProvider delayDuration={0}>{nav}</TooltipProvider>;
}
