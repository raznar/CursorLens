"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "@/components/layout/nav-items";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface NavLinkProps {
  item: NavItem;
  collapsed?: boolean;
  /** Called after navigation (used to close the mobile drawer). */
  onNavigate?: () => void;
}

/** A single sidebar link that highlights itself when its route is active. */
export function NavLink({ item, collapsed = false, onNavigate }: NavLinkProps) {
  const pathname = usePathname();
  const Icon = item.icon;
  const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

  const link = (
    <Link
      href={item.href}
      prefetch
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? item.label : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        "flex items-center rounded-md text-sm font-medium transition-colors",
        collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed ? <span className="truncate">{item.label}</span> : null}
    </Link>
  );

  if (!collapsed) return link;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}
