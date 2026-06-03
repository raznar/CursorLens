import type { DashboardSection } from "./registry";

export interface DashboardPageDef {
  href: string;
  label: string;
  section: DashboardSection | null;
}

/** Primary analytics routes (labels only; icons live in nav-items). */
export const DASHBOARD_PAGES: readonly DashboardPageDef[] = [
  { href: "/", label: "Overview", section: "overview" },
  { href: "/adoption", label: "Adoption", section: "adoption" },
  { href: "/models", label: "Models", section: "models" },
  { href: "/spend", label: "Spend", section: "spend" },
  { href: "/productivity", label: "Productivity", section: "productivity" },
  { href: "/features", label: "Features", section: "features" },
  { href: "/members", label: "Members", section: "members" },
  { href: "/audit", label: "Audit", section: "audit" },
] as const;

/** Non-analytics app routes the agent may still see. */
export const APP_PAGES: readonly DashboardPageDef[] = [
  { href: "/settings", label: "Settings", section: null },
] as const;

const PAGE_BY_HREF = new Map<string, DashboardPageDef>(
  [...DASHBOARD_PAGES, ...APP_PAGES].map((p) => [p.href, p]),
);

export function getPageDef(pathname: string): DashboardPageDef | undefined {
  const normalized = !pathname || pathname === "/" ? "/" : pathname.replace(/\/+$/, "") || "/";
  return PAGE_BY_HREF.get(normalized);
}

export function sectionForPathname(pathname: string): DashboardSection | null {
  return getPageDef(pathname)?.section ?? null;
}
