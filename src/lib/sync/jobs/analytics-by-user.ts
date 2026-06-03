import "server-only";
import type { z } from "zod";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { getMetric } from "@/lib/registry";
import {
  ByUserAgentEditsResponseSchema,
  ByUserAskModeResponseSchema,
  ByUserClientVersionsResponseSchema,
  ByUserCommandsResponseSchema,
  ByUserMcpResponseSchema,
  ByUserModelsResponseSchema,
  ByUserPlansResponseSchema,
  ByUserSkillsResponseSchema,
  ByUserTabsResponseSchema,
  ByUserTopFileExtensionsResponseSchema,
  type AgentEditsRow,
  type ClientVersionRow,
  type CommandsRow,
  type McpRow,
  type ModelsRow,
  type ModelUsageRow,
  type SkillsRow,
  type TabsRow,
  type ByUserTopFileExtensionRow,
} from "@/lib/cursor";
import { toApiDate } from "@/lib/date-range";
import {
  byUserAgentEdits,
  byUserAskMode,
  byUserClientVersions,
  byUserCommands,
  byUserMcp,
  byUserModels,
  byUserPlans,
  byUserSkills,
  byUserTabs,
  byUserTopFileExtensions,
} from "@/db/schema";
import { upsertRows } from "../upsert";
import { maxString, windowLabel } from "./helpers";
import type { JobContext, JobResult, SyncJob } from "./types";

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
 * Factory for the by-user analytics endpoints. The response `data` is keyed by email; the
 * client merges pages, then `mapUserRows` produces per-user rows (with the email prepended
 * to the primary key). `dateOf` feeds the watermark.
 */
function byUserJob<Row, Tbl extends SQLiteTable>(config: {
  metricId: string;
  schema: z.ZodTypeAny;
  table: Tbl;
  mapUserRows: (
    email: string,
    rows: Row[],
    chunk: { start: Date; end: Date },
  ) => Array<Tbl["$inferInsert"]>;
  dateOf: (row: Row) => string | undefined;
}): SyncJob {
  const metric = getMetric(config.metricId);
  return {
    dataType: `by-user/${config.metricId}`,
    metricId: config.metricId,
    label: `${metric?.label ?? config.metricId} (by user)`,
    enterpriseOnly: true,
    run: async (ctx: JobContext): Promise<JobResult> => {
      const endpoint = `/analytics/by-user/${config.metricId}`;
      let total = 0;
      let watermark: string | undefined;
      const chunkTotal = ctx.chunks.length;
      ctx.reportProgress({
        current: 0,
        total: chunkTotal,
        rows: total,
        message: `Preparing ${metric?.label ?? config.metricId} by-user windows`,
      });
      for (const [index, chunk] of ctx.chunks.entries()) {
        const label = windowLabel(chunk.start, chunk.end);
        ctx.reportProgress({
          current: index,
          total: chunkTotal,
          rows: total,
          message: `Fetching ${metric?.label ?? config.metricId} by-user window ${index + 1}/${chunkTotal}: ${label}`,
        });
        const byEmail = await ctx.client.analytics.byUser<Row>(endpoint, config.schema, {
          start: chunk.start,
          end: chunk.end,
        });
        const rows: Array<Tbl["$inferInsert"]> = [];
        const dates: Array<string | undefined> = [];
        for (const [email, userRows] of Object.entries(byEmail)) {
          rows.push(...config.mapUserRows(email, userRows, chunk));
          for (const row of userRows) dates.push(config.dateOf(row));
        }
        const written = upsertRows(config.table, rows);
        total += written;
        const wm = maxString(dates);
        if (wm && (!watermark || wm > watermark)) watermark = wm;
        ctx.reportProgress({
          current: index + 1,
          total: chunkTotal,
          rows: total,
          message: `Inserted ${written.toLocaleString()} ${metric?.label ?? config.metricId} by-user rows from ${label}`,
        });
      }
      return { rows: total, watermark };
    },
  };
}

const byUserModelsJob = byUserJob<ModelsRow, typeof byUserModels>({
  metricId: "models",
  schema: ByUserModelsResponseSchema,
  table: byUserModels,
  mapUserRows: (email, rows, _chunk) =>
    rows.flatMap((r) =>
      Object.entries(r.model_breakdown).map(([model, value]) => ({
        email,
        date: r.date,
        model,
        messages: value.messages ?? null,
      })),
    ),
  dateOf: (r) => r.date,
});

const byUserAgentEditsJob = byUserJob<AgentEditsRow, typeof byUserAgentEdits>({
  metricId: "agent-edits",
  schema: ByUserAgentEditsResponseSchema,
  table: byUserAgentEdits,
  mapUserRows: (email, rows, _chunk) =>
    rows.map((r) => ({
      email,
      event_date: r.event_date,
      total_suggested_diffs: r.total_suggested_diffs ?? null,
      total_accepted_diffs: r.total_accepted_diffs ?? null,
      total_rejected_diffs: r.total_rejected_diffs ?? null,
      ...lineColumns(r),
    })),
  dateOf: (r) => r.event_date,
});

const byUserTabsJob = byUserJob<TabsRow, typeof byUserTabs>({
  metricId: "tabs",
  schema: ByUserTabsResponseSchema,
  table: byUserTabs,
  mapUserRows: (email, rows, _chunk) =>
    rows.map((r) => ({
      email,
      event_date: r.event_date,
      total_suggestions: r.total_suggestions ?? null,
      total_accepts: r.total_accepts ?? null,
      total_rejects: r.total_rejects ?? null,
      ...lineColumns(r),
    })),
  dateOf: (r) => r.event_date,
});

const byUserTopFileExtensionsJob = byUserJob<
  ByUserTopFileExtensionRow,
  typeof byUserTopFileExtensions
>({
  metricId: "top-file-extensions",
  schema: ByUserTopFileExtensionsResponseSchema,
  table: byUserTopFileExtensions,
  mapUserRows: (email, rows, chunk) =>
    rows.map((r) => ({
      email,
      event_date: r.event_date ?? r.date ?? toApiDate(chunk.end),
      file_extension: r.file_extension ?? "",
      total_files: r.total_files ?? null,
      total_accepts: r.total_accepts ?? null,
      total_rejects: r.total_rejects ?? null,
      total_lines_suggested: r.total_lines_suggested ?? null,
      total_lines_accepted: r.total_lines_accepted ?? null,
      total_lines_rejected: r.total_lines_rejected ?? null,
    })),
  dateOf: (r) => r.event_date ?? r.date,
});

const byUserClientVersionsJob = byUserJob<ClientVersionRow, typeof byUserClientVersions>({
  metricId: "client-versions",
  schema: ByUserClientVersionsResponseSchema,
  table: byUserClientVersions,
  mapUserRows: (email, rows, _chunk) =>
    rows.map((r) => ({
      email,
      event_date: r.event_date,
      client_version: r.client_version,
      user_count: r.user_count ?? null,
      percentage: r.percentage ?? null,
    })),
  dateOf: (r) => r.event_date,
});

const byUserMcpJob = byUserJob<McpRow, typeof byUserMcp>({
  metricId: "mcp",
  schema: ByUserMcpResponseSchema,
  table: byUserMcp,
  mapUserRows: (email, rows, _chunk) =>
    rows.map((r) => ({
      email,
      event_date: r.event_date,
      mcp_server_name: r.mcp_server_name,
      tool_name: r.tool_name,
      usage: r.usage ?? null,
    })),
  dateOf: (r) => r.event_date,
});

const byUserCommandsJob = byUserJob<CommandsRow, typeof byUserCommands>({
  metricId: "commands",
  schema: ByUserCommandsResponseSchema,
  table: byUserCommands,
  mapUserRows: (email, rows, _chunk) =>
    rows.map((r) => ({
      email,
      event_date: r.event_date,
      command_name: r.command_name,
      usage: r.usage ?? null,
    })),
  dateOf: (r) => r.event_date,
});

const byUserPlansJob = byUserJob<ModelUsageRow, typeof byUserPlans>({
  metricId: "plans",
  schema: ByUserPlansResponseSchema,
  table: byUserPlans,
  mapUserRows: (email, rows, _chunk) =>
    rows.map((r) => ({ email, event_date: r.event_date, model: r.model, usage: r.usage ?? null })),
  dateOf: (r) => r.event_date,
});

const byUserSkillsJob = byUserJob<SkillsRow, typeof byUserSkills>({
  metricId: "skills",
  schema: ByUserSkillsResponseSchema,
  table: byUserSkills,
  mapUserRows: (email, rows, _chunk) =>
    rows.map((r) => ({
      email,
      event_date: r.event_date,
      skill_name: r.skill_name,
      usage: r.usage ?? null,
    })),
  dateOf: (r) => r.event_date,
});

const byUserAskModeJob = byUserJob<ModelUsageRow, typeof byUserAskMode>({
  metricId: "ask-mode",
  schema: ByUserAskModeResponseSchema,
  table: byUserAskMode,
  mapUserRows: (email, rows, _chunk) =>
    rows.map((r) => ({ email, event_date: r.event_date, model: r.model, usage: r.usage ?? null })),
  dateOf: (r) => r.event_date,
});

export const analyticsByUserJobs: SyncJob[] = [
  byUserModelsJob,
  byUserAgentEditsJob,
  byUserTabsJob,
  byUserTopFileExtensionsJob,
  byUserClientVersionsJob,
  byUserMcpJob,
  byUserCommandsJob,
  byUserPlansJob,
  byUserSkillsJob,
  byUserAskModeJob,
];
