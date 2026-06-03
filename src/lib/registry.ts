import type { ValueFormat } from "./format";

/**
 * The metric/endpoint registry: a single declarative catalog of every Cursor data source
 * the app ingests. Sync jobs, dashboard pages, and the agent's schema doc all read from
 * here. Adding a metric = add an entry below + a Drizzle table/migration + (for analytics)
 * a transform in the sync engine. This module is intentionally pure data — it must not
 * import `db`, `cursor`, or UI (see `.dependency-cruiser.cjs`). See `adding-a-cursor-endpoint`.
 */

export type ChartKind = "line" | "area" | "bar" | "stackedBar" | "stackedArea" | "pie" | "donut";

/** Per-team-per-minute rate-limit buckets enforced by the API client. */
export type RateLimitGroup =
  | "adminGeneral" // 20/min: members, audit-logs, daily-usage, spend, usage-events
  | "adminSpendLimit" // 250/min: user-spend-limit
  | "analyticsTeam" // 100/min: most /analytics/team/*
  | "analyticsByUser" // 50/min: /analytics/by-user/*
  | "analyticsConversationInsights"; // 20/min

export const RATE_LIMITS: Record<RateLimitGroup, number> = {
  adminGeneral: 20,
  adminSpendLimit: 250,
  analyticsTeam: 100,
  analyticsByUser: 50,
  analyticsConversationInsights: 20,
};

/** Dashboard sections (each is a page in the app). */
export type DashboardSection =
  | "overview"
  | "adoption"
  | "models"
  | "spend"
  | "productivity"
  | "features"
  | "members"
  | "audit";

export type MetricSource = "admin" | "analytics-team" | "analytics-by-user";

export interface MetricDef {
  /** Stable id; also the canonical name used by sync jobs and tables. */
  id: string;
  label: string;
  description: string;
  source: MetricSource;
  /** Cursor API path, e.g. `/analytics/team/models`. */
  endpoint: string;
  rateLimitGroup: RateLimitGroup;
  /** Dashboard section this metric primarily belongs to. */
  section: DashboardSection;
  /** Preferred chart for time-series rendering. */
  defaultChart: ChartKind;
  /** How the metric's primary value should be formatted. */
  valueFormat: ValueFormat;
  /** True if a `/analytics/by-user/{id}` variant also exists. */
  hasByUser?: boolean;
  /** True if the endpoint is Enterprise-only (handled gracefully on 401/403). */
  enterpriseOnly?: boolean;
}

export const METRICS: readonly MetricDef[] = [
  // --- Admin API ---
  {
    id: "team-members",
    label: "Team members",
    description: "Roster of team members with role and removal status.",
    source: "admin",
    endpoint: "/teams/members",
    rateLimitGroup: "adminGeneral",
    section: "members",
    defaultChart: "bar",
    valueFormat: "number",
  },
  {
    id: "audit-logs",
    label: "Audit logs",
    description: "Security/administrative events (logins, membership, settings).",
    source: "admin",
    endpoint: "/teams/audit-logs",
    rateLimitGroup: "adminGeneral",
    section: "audit",
    defaultChart: "bar",
    valueFormat: "number",
    enterpriseOnly: true,
  },
  {
    id: "daily-usage",
    label: "Daily usage",
    description: "Per-user-per-day usage: lines, applies, accepts, tabs, requests by mode.",
    source: "admin",
    endpoint: "/teams/daily-usage-data",
    rateLimitGroup: "adminGeneral",
    section: "productivity",
    defaultChart: "area",
    valueFormat: "compact",
  },
  {
    id: "spend",
    label: "Spend",
    description: "Per-user spend for the current billing cycle, incl. spend limits.",
    source: "admin",
    endpoint: "/teams/spend",
    rateLimitGroup: "adminGeneral",
    section: "spend",
    defaultChart: "bar",
    valueFormat: "cents",
  },
  {
    id: "usage-events",
    label: "Usage events",
    description: "Granular per-request events: model, tokens, max mode, charged cents.",
    source: "admin",
    endpoint: "/teams/filtered-usage-events",
    rateLimitGroup: "adminGeneral",
    section: "models",
    defaultChart: "stackedBar",
    valueFormat: "cents",
  },
  // --- Analytics API (team-level; most also have by-user variants) ---
  {
    id: "dau",
    label: "Daily active users",
    description: "Unique active users per day, incl. CLI, Cloud Agent, and BugBot DAU.",
    source: "analytics-team",
    endpoint: "/analytics/team/dau",
    rateLimitGroup: "analyticsTeam",
    section: "adoption",
    defaultChart: "area",
    valueFormat: "number",
    enterpriseOnly: true,
  },
  {
    id: "models",
    label: "Model usage",
    description: "Messages and unique users per AI model per day.",
    source: "analytics-team",
    endpoint: "/analytics/team/models",
    rateLimitGroup: "analyticsTeam",
    section: "models",
    defaultChart: "stackedArea",
    valueFormat: "compact",
    hasByUser: true,
    enterpriseOnly: true,
  },
  {
    id: "agent-edits",
    label: "Agent edits",
    description: "AI-suggested diffs: suggested/accepted/rejected and lines.",
    source: "analytics-team",
    endpoint: "/analytics/team/agent-edits",
    rateLimitGroup: "analyticsTeam",
    section: "productivity",
    defaultChart: "area",
    valueFormat: "compact",
    hasByUser: true,
    enterpriseOnly: true,
  },
  {
    id: "tabs",
    label: "Tab usage",
    description: "Tab autocomplete suggestions, accepts, and lines.",
    source: "analytics-team",
    endpoint: "/analytics/team/tabs",
    rateLimitGroup: "analyticsTeam",
    section: "productivity",
    defaultChart: "area",
    valueFormat: "compact",
    hasByUser: true,
    enterpriseOnly: true,
  },
  {
    id: "client-versions",
    label: "Client versions",
    description: "Distribution of Cursor client versions in use per day.",
    source: "analytics-team",
    endpoint: "/analytics/team/client-versions",
    rateLimitGroup: "analyticsTeam",
    section: "adoption",
    defaultChart: "stackedBar",
    valueFormat: "number",
    hasByUser: true,
    enterpriseOnly: true,
  },
  {
    id: "top-file-extensions",
    label: "Top file extensions",
    description: "Most frequently edited file extensions by suggestion volume.",
    source: "analytics-team",
    endpoint: "/analytics/team/top-file-extensions",
    rateLimitGroup: "analyticsTeam",
    section: "productivity",
    defaultChart: "bar",
    valueFormat: "compact",
    hasByUser: true,
    enterpriseOnly: true,
  },
  {
    id: "mcp",
    label: "MCP adoption",
    description: "MCP tool usage per day by tool and server.",
    source: "analytics-team",
    endpoint: "/analytics/team/mcp",
    rateLimitGroup: "analyticsTeam",
    section: "features",
    defaultChart: "bar",
    valueFormat: "number",
    hasByUser: true,
    enterpriseOnly: true,
  },
  {
    id: "commands",
    label: "Commands adoption",
    description: "Cursor command usage per day by command name.",
    source: "analytics-team",
    endpoint: "/analytics/team/commands",
    rateLimitGroup: "analyticsTeam",
    section: "features",
    defaultChart: "bar",
    valueFormat: "number",
    hasByUser: true,
    enterpriseOnly: true,
  },
  {
    id: "plans",
    label: "Plan mode adoption",
    description: "Plan mode usage per day by model.",
    source: "analytics-team",
    endpoint: "/analytics/team/plans",
    rateLimitGroup: "analyticsTeam",
    section: "features",
    defaultChart: "bar",
    valueFormat: "number",
    hasByUser: true,
    enterpriseOnly: true,
  },
  {
    id: "skills",
    label: "Skills adoption",
    description: "Skills usage per day by skill name.",
    source: "analytics-team",
    endpoint: "/analytics/team/skills",
    rateLimitGroup: "analyticsTeam",
    section: "features",
    defaultChart: "bar",
    valueFormat: "number",
    hasByUser: true,
    enterpriseOnly: true,
  },
  {
    id: "ask-mode",
    label: "Ask mode adoption",
    description: "Ask mode usage per day by model.",
    source: "analytics-team",
    endpoint: "/analytics/team/ask-mode",
    rateLimitGroup: "analyticsTeam",
    section: "features",
    defaultChart: "bar",
    valueFormat: "number",
    hasByUser: true,
    enterpriseOnly: true,
  },
  {
    id: "conversation-insights",
    label: "Conversation insights",
    description: "Aggregate intents, complexity, categories, guidance, and work types.",
    source: "analytics-team",
    endpoint: "/analytics/team/conversation-insights",
    rateLimitGroup: "analyticsConversationInsights",
    section: "features",
    defaultChart: "donut",
    valueFormat: "number",
    enterpriseOnly: true,
  },
  {
    id: "leaderboard",
    label: "Leaderboard",
    description: "Team members ranked by Tab and Agent acceptance metrics.",
    source: "analytics-team",
    endpoint: "/analytics/team/leaderboard",
    rateLimitGroup: "analyticsTeam",
    section: "productivity",
    defaultChart: "bar",
    valueFormat: "compact",
    enterpriseOnly: true,
  },
  {
    id: "bugbot",
    label: "BugBot",
    description: "Per-PR BugBot review analytics: issues by severity and resolution.",
    source: "analytics-team",
    endpoint: "/analytics/team/bugbot",
    rateLimitGroup: "analyticsTeam",
    section: "features",
    defaultChart: "bar",
    valueFormat: "number",
    enterpriseOnly: true,
  },
] as const;

export type MetricId = (typeof METRICS)[number]["id"];

const METRIC_BY_ID = new Map<string, MetricDef>(METRICS.map((m) => [m.id, m]));

export function getMetric(id: string): MetricDef | undefined {
  return METRIC_BY_ID.get(id);
}

export function metricsForSection(section: DashboardSection): MetricDef[] {
  return METRICS.filter((m) => m.section === section);
}

export function metricsBySource(source: MetricSource): MetricDef[] {
  return METRICS.filter((m) => m.source === source);
}

/** Analytics metrics that also expose a `/analytics/by-user/{id}` endpoint. */
export function byUserMetrics(): MetricDef[] {
  return METRICS.filter((m) => m.hasByUser);
}
