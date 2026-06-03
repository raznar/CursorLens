import { getPageDef } from "@/lib/dashboard-pages";
import { DEFAULT_RANGE, resolveRange } from "@/lib/date-range";
import { metricsForSection, type DashboardSection, type MetricDef } from "@/lib/registry";
import type { ChatPageInput } from "./types";

export type { ChatPageInput };

export interface PageContext {
  pathname: string;
  title: string;
  section: DashboardSection | null;
  dateRange: ReturnType<typeof resolveRange>;
  metrics: MetricDef[];
}

function normalizePathname(pathname: string): string {
  if (!pathname || pathname === "/") return "/";
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed.length > 0 ? trimmed : "/";
}

/** Resolve lightweight page context from pathname and optional `?range=`. */
export function derivePageContext(input: ChatPageInput): PageContext {
  const pathname = normalizePathname(input.pathname);
  const page = getPageDef(pathname);
  const section = page?.section ?? null;
  const title = page?.label ?? "Dashboard";
  const dateRange = resolveRange(input.range ?? DEFAULT_RANGE);

  return {
    pathname,
    title,
    section,
    dateRange,
    metrics: section ? metricsForSection(section) : [],
  };
}

/** Format page context for injection into the agent system prompt. */
export function formatPageContextForPrompt(ctx: PageContext): string {
  const rangeLine = `${ctx.dateRange.label} (${ctx.dateRange.start.toISOString().slice(0, 10)} through ${ctx.dateRange.end.toISOString().slice(0, 10)})`;

  if (!ctx.section) {
    return `The user is viewing **${ctx.title}** (\`${ctx.pathname}\`).
Selected date range (when applicable on analytics pages): ${rangeLine}.
This page is not a primary analytics dashboard section — answer from the database as usual.`;
  }

  const metricLines =
    ctx.metrics.length > 0
      ? ctx.metrics
          .map((m) => `- **${m.label}** (\`${m.id}\`): ${m.description} — API \`${m.endpoint}\``)
          .join("\n")
      : "_No section-specific metrics are registered for this page._";

  return `The user is currently on the **${ctx.title}** dashboard (\`${ctx.pathname}\`, section \`${ctx.section}\`).
Selected date range: ${rangeLine}. Prefer queries scoped to this window when the question is about "here", "this page", or "currently shown" data.

Relevant metrics for this section:
${metricLines}

The charts and KPIs on screen are built from these ingested endpoints — still verify with SQL via \`data/query.mjs\`; do not assume chart values without querying.`;
}
