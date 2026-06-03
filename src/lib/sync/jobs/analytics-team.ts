import "server-only";
import type { z } from "zod";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { getMetric } from "@/lib/registry";
import {
  AgentEditsResponseSchema,
  AskModeResponseSchema,
  ClientVersionsResponseSchema,
  CommandsResponseSchema,
  ConversationInsightsResponseSchema,
  DauResponseSchema,
  McpResponseSchema,
  ModelsResponseSchema,
  PlansResponseSchema,
  SkillsResponseSchema,
  TabsResponseSchema,
  TopFileExtensionsResponseSchema,
  type AgentEditsRow,
  type LeaderboardEntry,
  type ClientVersionRow,
  type CommandsRow,
  type ConversationSlice,
  type DauRow,
  type McpRow,
  type ModelsRow,
  type ModelUsageRow,
  type SkillsRow,
  type TabsRow,
  type TopFileExtensionRow,
} from "@/lib/cursor";
import {
  analyticsAgentEdits,
  analyticsAskMode,
  analyticsBugbot,
  analyticsClientVersions,
  analyticsCommands,
  analyticsConversationInsights,
  analyticsDau,
  analyticsLeaderboard,
  analyticsMcp,
  analyticsModels,
  analyticsPlans,
  analyticsSkills,
  analyticsTabs,
  analyticsTopFileExtensions,
} from "@/db/schema";
import { upsertRows } from "../upsert";
import { maxString, parseTimestamp, windowLabel } from "./helpers";
import type { JobContext, JobResult, SyncJob } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Shared 8 line-count columns from agent-edits / tabs rows. */
function lineColumns(r: AgentEditsRow | TabsRow) {
  return {
    total_green_lines_accepted: r.total_green_lines_accepted ?? null,
    total_red_lines_accepted: r.total_red_lines_accepted ?? null,
    total_green_lines_rejected: r.total_green_lines_rejected ?? null,
    total_red_lines_rejected: r.total_red_lines_rejected ?? null,
    total_green_lines_suggested: r.total_green_lines_suggested ?? null,
    total_red_lines_suggested: r.total_red_lines_suggested ?? null,
    total_lines_suggested: r.total_lines_suggested ?? null,
    total_lines_accepted: r.total_lines_accepted ?? null,
  };
}

/**
 * Factory for the common team analytics shape: a single GET returning `{ data: Row[] }` per
 * ≤30-day window, ETag-threaded when the run is a single window. `mapRows` transforms the
 * day rows (it may explode them, e.g. models) into upsertable rows for `table`.
 */
function teamDailyJob<Row, Tbl extends SQLiteTable>(config: {
  metricId: string;
  schema: z.ZodTypeAny;
  table: Tbl;
  mapRows: (rows: Row[]) => Array<Tbl["$inferInsert"]>;
  watermark?: (rows: Row[]) => string | undefined;
}): SyncJob {
  const metric = getMetric(config.metricId);
  return {
    dataType: config.metricId,
    metricId: config.metricId,
    label: metric?.label ?? config.metricId,
    enterpriseOnly: metric?.enterpriseOnly,
    run: async (ctx: JobContext): Promise<JobResult> => {
      const endpoint = getMetric(config.metricId)!.endpoint;
      const useEtag = ctx.chunks.length === 1;
      let rows = 0;
      let watermark: string | undefined;
      let etag: string | undefined;
      let modified = false;
      const chunkTotal = ctx.chunks.length;
      ctx.reportProgress({
        current: 0,
        total: chunkTotal,
        rows,
        message: `Preparing ${metric?.label ?? config.metricId} windows`,
      });
      for (const [index, chunk] of ctx.chunks.entries()) {
        const label = windowLabel(chunk.start, chunk.end);
        ctx.reportProgress({
          current: index,
          total: chunkTotal,
          rows,
          message: `Fetching ${metric?.label ?? config.metricId} window ${index + 1}/${chunkTotal}: ${label}`,
        });
        const res = await ctx.client.analytics.team(
          endpoint,
          config.schema,
          { start: chunk.start, end: chunk.end },
          useEtag ? (ctx.prev?.etag ?? undefined) : undefined,
        );
        if (res.notModified) {
          etag = ctx.prev?.etag ?? etag;
          ctx.reportProgress({
            current: index + 1,
            total: chunkTotal,
            rows,
            message: `${metric?.label ?? config.metricId} window ${index + 1}/${chunkTotal} was not modified: ${label}`,
          });
          continue;
        }
        modified = true;
        const data = res.data as { data: Row[] };
        const written = upsertRows(config.table, config.mapRows(data.data));
        rows += written;
        const wm = config.watermark?.(data.data);
        if (wm && (!watermark || wm > watermark)) watermark = wm;
        if (res.etag) etag = res.etag;
        ctx.reportProgress({
          current: index + 1,
          total: chunkTotal,
          rows,
          message: `Inserted ${written.toLocaleString()} ${metric?.label ?? config.metricId} rows from ${label}`,
        });
      }
      return { rows, watermark, etag, notModified: !modified };
    },
  };
}

const dauJob = teamDailyJob<DauRow, typeof analyticsDau>({
  metricId: "dau",
  schema: DauResponseSchema,
  table: analyticsDau,
  mapRows: (rows) =>
    rows.map((r) => ({
      date: r.date,
      dau: r.dau ?? null,
      cli_dau: r.cli_dau ?? null,
      cloud_agent_dau: r.cloud_agent_dau ?? null,
      bugbot_dau: r.bugbot_dau ?? null,
    })),
  watermark: (rows) => maxString(rows.map((r) => r.date)),
});

const agentEditsJob = teamDailyJob<AgentEditsRow, typeof analyticsAgentEdits>({
  metricId: "agent-edits",
  schema: AgentEditsResponseSchema,
  table: analyticsAgentEdits,
  mapRows: (rows) =>
    rows.map((r) => ({
      event_date: r.event_date,
      total_suggested_diffs: r.total_suggested_diffs ?? null,
      total_accepted_diffs: r.total_accepted_diffs ?? null,
      total_rejected_diffs: r.total_rejected_diffs ?? null,
      ...lineColumns(r),
    })),
  watermark: (rows) => maxString(rows.map((r) => r.event_date)),
});

const tabsJob = teamDailyJob<TabsRow, typeof analyticsTabs>({
  metricId: "tabs",
  schema: TabsResponseSchema,
  table: analyticsTabs,
  mapRows: (rows) =>
    rows.map((r) => ({
      event_date: r.event_date,
      total_suggestions: r.total_suggestions ?? null,
      total_accepts: r.total_accepts ?? null,
      total_rejects: r.total_rejects ?? null,
      ...lineColumns(r),
    })),
  watermark: (rows) => maxString(rows.map((r) => r.event_date)),
});

const clientVersionsJob = teamDailyJob<ClientVersionRow, typeof analyticsClientVersions>({
  metricId: "client-versions",
  schema: ClientVersionsResponseSchema,
  table: analyticsClientVersions,
  mapRows: (rows) =>
    rows.map((r) => ({
      event_date: r.event_date,
      client_version: r.client_version,
      user_count: r.user_count ?? null,
      percentage: r.percentage ?? null,
    })),
  watermark: (rows) => maxString(rows.map((r) => r.event_date)),
});

const modelsJob = teamDailyJob<ModelsRow, typeof analyticsModels>({
  metricId: "models",
  schema: ModelsResponseSchema,
  table: analyticsModels,
  mapRows: (rows) =>
    rows.flatMap((r) =>
      Object.entries(r.model_breakdown).map(([model, value]) => ({
        date: r.date,
        model,
        messages: value.messages ?? null,
        users: value.users ?? null,
      })),
    ),
  watermark: (rows) => maxString(rows.map((r) => r.date)),
});

const topFileExtensionsJob = teamDailyJob<TopFileExtensionRow, typeof analyticsTopFileExtensions>({
  metricId: "top-file-extensions",
  schema: TopFileExtensionsResponseSchema,
  table: analyticsTopFileExtensions,
  mapRows: (rows) =>
    rows.map((r) => ({
      event_date: r.event_date,
      file_extension: r.file_extension ?? "",
      total_files: r.total_files ?? null,
      total_accepts: r.total_accepts ?? null,
      total_rejects: r.total_rejects ?? null,
      total_lines_suggested: r.total_lines_suggested ?? null,
      total_lines_accepted: r.total_lines_accepted ?? null,
      total_lines_rejected: r.total_lines_rejected ?? null,
    })),
  watermark: (rows) => maxString(rows.map((r) => r.event_date)),
});

const mcpJob = teamDailyJob<McpRow, typeof analyticsMcp>({
  metricId: "mcp",
  schema: McpResponseSchema,
  table: analyticsMcp,
  mapRows: (rows) =>
    rows.map((r) => ({
      event_date: r.event_date,
      mcp_server_name: r.mcp_server_name,
      tool_name: r.tool_name,
      usage: r.usage ?? null,
    })),
  watermark: (rows) => maxString(rows.map((r) => r.event_date)),
});

const commandsJob = teamDailyJob<CommandsRow, typeof analyticsCommands>({
  metricId: "commands",
  schema: CommandsResponseSchema,
  table: analyticsCommands,
  mapRows: (rows) =>
    rows.map((r) => ({
      event_date: r.event_date,
      command_name: r.command_name,
      usage: r.usage ?? null,
    })),
  watermark: (rows) => maxString(rows.map((r) => r.event_date)),
});

const plansJob = teamDailyJob<ModelUsageRow, typeof analyticsPlans>({
  metricId: "plans",
  schema: PlansResponseSchema,
  table: analyticsPlans,
  mapRows: (rows) =>
    rows.map((r) => ({ event_date: r.event_date, model: r.model, usage: r.usage ?? null })),
  watermark: (rows) => maxString(rows.map((r) => r.event_date)),
});

const askModeJob = teamDailyJob<ModelUsageRow, typeof analyticsAskMode>({
  metricId: "ask-mode",
  schema: AskModeResponseSchema,
  table: analyticsAskMode,
  mapRows: (rows) =>
    rows.map((r) => ({ event_date: r.event_date, model: r.model, usage: r.usage ?? null })),
  watermark: (rows) => maxString(rows.map((r) => r.event_date)),
});

const skillsJob = teamDailyJob<SkillsRow, typeof analyticsSkills>({
  metricId: "skills",
  schema: SkillsResponseSchema,
  table: analyticsSkills,
  mapRows: (rows) =>
    rows.map((r) => ({
      event_date: r.event_date,
      skill_name: r.skill_name,
      usage: r.usage ?? null,
    })),
  watermark: (rows) => maxString(rows.map((r) => r.event_date)),
});

// --- Bespoke team jobs ---

/** Pull the non-`count`/`date` value out of a conversation-insights slice item. */
function labelCount(
  item: Record<string, string | number>,
  exclude: string[],
): { label: string; count: number } | null {
  let label: string | undefined;
  let count = 0;
  for (const [key, value] of Object.entries(item)) {
    if (key === "count") {
      count = Number(value) || 0;
      continue;
    }
    if (exclude.includes(key)) continue;
    if (label === undefined) label = String(value);
  }
  return label === undefined ? null : { label, count };
}

function insightRows(data: Partial<Record<string, ConversationSlice>> | undefined) {
  const out: Array<typeof analyticsConversationInsights.$inferInsert> = [];
  for (const [slice, sliceData] of Object.entries(data ?? {})) {
    if (!sliceData) continue;
    for (const item of sliceData.distribution ?? []) {
      const parsed = labelCount(item, ["count"]);
      if (parsed) out.push({ slice, label: parsed.label, date: "", count: parsed.count });
    }
    for (const item of sliceData.timeSeries ?? []) {
      const parsed = labelCount(item, ["count", "date"]);
      if (parsed)
        out.push({
          slice,
          label: parsed.label,
          date: String(item.date ?? ""),
          count: parsed.count,
        });
    }
  }
  return out;
}

const conversationInsightsJob: SyncJob = {
  dataType: "conversation-insights",
  metricId: "conversation-insights",
  label: getMetric("conversation-insights")?.label ?? "Conversation insights",
  enterpriseOnly: true,
  run: async (ctx) => {
    const useEtag = ctx.chunks.length === 1;
    let rows = 0;
    let etag: string | undefined;
    let modified = false;
    for (const chunk of ctx.chunks) {
      const res = await ctx.client.analytics.conversationInsights(
        ConversationInsightsResponseSchema,
        { start: chunk.start, end: chunk.end },
        useEtag ? (ctx.prev?.etag ?? undefined) : undefined,
      );
      if (res.notModified) {
        etag = ctx.prev?.etag ?? etag;
        continue;
      }
      modified = true;
      rows += upsertRows(analyticsConversationInsights, insightRows(res.data?.data));
      if (res.etag) etag = res.etag;
    }
    return { rows, etag, notModified: !modified };
  },
};

const leaderboardJob: SyncJob = {
  dataType: "leaderboard",
  metricId: "leaderboard",
  label: getMetric("leaderboard")?.label ?? "Leaderboard",
  enterpriseOnly: true,
  run: async (ctx) => {
    // Leaderboard rankings are period-aggregate (no date dimension), so query one window
    // covering the most recent ≤30 days of the run's range.
    const end = ctx.range.end;
    const start = new Date(Math.max(ctx.range.start.getTime(), end.getTime() - 29 * DAY_MS));
    const { tab, agent, periodStart, periodEnd } = await ctx.client.analytics.leaderboard({
      start,
      end,
    });
    const rows = [
      ...tab.map((e) => leaderboardRow("tab", e, periodStart, periodEnd)),
      ...agent.map((e) => leaderboardRow("agent", e, periodStart, periodEnd)),
    ];
    return { rows: upsertRows(analyticsLeaderboard, rows), watermark: periodEnd };
  },
};

function leaderboardRow(
  board: string,
  entry: LeaderboardEntry,
  periodStart: string,
  periodEnd: string,
): typeof analyticsLeaderboard.$inferInsert {
  return {
    board,
    user_id: entry.user_id,
    email: entry.email ?? null,
    total_accepts: entry.total_accepts ?? null,
    total_lines_accepted: entry.total_lines_accepted ?? null,
    total_lines_suggested: entry.total_lines_suggested ?? null,
    line_acceptance_ratio: entry.line_acceptance_ratio ?? null,
    accept_ratio: entry.accept_ratio ?? null,
    rank: entry.rank ?? null,
    period_start: periodStart,
    period_end: periodEnd,
  };
}

const bugbotJob: SyncJob = {
  dataType: "bugbot",
  metricId: "bugbot",
  label: getMetric("bugbot")?.label ?? "BugBot",
  enterpriseOnly: true,
  run: async (ctx) => {
    let total = 0;
    let maxTs = 0;
    const chunkTotal = ctx.chunks.length;
    ctx.reportProgress({
      current: 0,
      total: chunkTotal,
      rows: total,
      message: "Preparing BugBot windows",
    });
    for (const [index, chunk] of ctx.chunks.entries()) {
      const label = windowLabel(chunk.start, chunk.end);
      ctx.reportProgress({
        current: index,
        total: chunkTotal,
        rows: total,
        message: `Fetching BugBot window ${index + 1}/${chunkTotal}: ${label}`,
      });
      const prs = await ctx.client.analytics.bugbot({ start: chunk.start, end: chunk.end });
      const rows = prs.map((r) => {
        const ts = parseTimestamp(r.timestamp);
        if (ts && ts > maxTs) maxTs = ts;
        return {
          repo: r.repo,
          pr_number: r.pr_number,
          timestamp: ts,
          reviews: r.reviews ?? null,
          issues_total: r.issues?.total ?? null,
          issues_high: r.issues?.by_severity?.high ?? null,
          issues_medium: r.issues?.by_severity?.medium ?? null,
          issues_low: r.issues?.by_severity?.low ?? null,
          resolved_total: r.issues_resolved?.total ?? null,
          resolved_high: r.issues_resolved?.by_severity?.high ?? null,
          resolved_medium: r.issues_resolved?.by_severity?.medium ?? null,
          resolved_low: r.issues_resolved?.by_severity?.low ?? null,
        };
      });
      const written = upsertRows(analyticsBugbot, rows);
      total += written;
      ctx.reportProgress({
        current: index + 1,
        total: chunkTotal,
        rows: total,
        message: `Inserted ${written.toLocaleString()} BugBot rows from ${label}`,
      });
    }
    return { rows: total, watermark: maxTs ? String(maxTs) : undefined };
  },
};

export const analyticsTeamJobs: SyncJob[] = [
  dauJob,
  modelsJob,
  agentEditsJob,
  tabsJob,
  clientVersionsJob,
  topFileExtensionsJob,
  mcpJob,
  commandsJob,
  plansJob,
  askModeJob,
  skillsJob,
  conversationInsightsJob,
  leaderboardJob,
  bugbotJob,
];
