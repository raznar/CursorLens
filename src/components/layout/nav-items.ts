import {
  Boxes,
  DollarSign,
  Gauge,
  LayoutDashboard,
  type LucideIcon,
  ScrollText,
  Settings,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Built by a sibling agent; linked but may 404 until then. */
  external?: boolean;
}

/** Primary analytics destinations (the dashboard this agent owns). */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/adoption", label: "Adoption", icon: TrendingUp },
  { href: "/models", label: "Models", icon: Boxes },
  { href: "/spend", label: "Spend", icon: DollarSign },
  { href: "/productivity", label: "Productivity", icon: Gauge },
  { href: "/features", label: "Features", icon: Sparkles },
  { href: "/members", label: "Members", icon: Users },
  { href: "/audit", label: "Audit", icon: ScrollText },
];

/** Secondary destinations (settings). Ask Agent lives in the global side panel. */
export const SECONDARY_NAV_ITEMS: NavItem[] = [
  { href: "/settings", label: "Settings", icon: Settings },
];
