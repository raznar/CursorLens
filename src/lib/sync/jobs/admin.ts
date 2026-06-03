import "server-only";
import { auditLogs, dailyUsage, spend, teamMembers, usageEvents } from "@/db/schema";
import { upsertRows } from "../upsert";
import { maxString, parseTimestamp, windowLabel } from "./helpers";
import type { SyncJob } from "./types";

/** GET /teams/members — full roster snapshot (not windowed). */
export const membersJob: SyncJob = {
  dataType: "team-members",
  metricId: "team-members",
  label: "Team members",
  run: async (ctx) => {
    const members = await ctx.client.admin.members();
    const rows = members.map((m) => ({
      id: String(m.id),
      email: m.email,
      name: m.name ?? null,
      role: m.role ?? null,
      is_removed: m.isRemoved ?? false,
      updated_at: ctx.now,
    }));
    return { rows: upsertRows(teamMembers, rows) };
  },
};

/** POST /teams/spend — per-user current-cycle spend + spend limits (not windowed). */
export const spendJob: SyncJob = {
  dataType: "spend",
  metricId: "spend",
  label: "Spend",
  run: async (ctx) => {
    const { rows: spendRows, subscriptionCycleStart } = await ctx.client.admin.spend();
    const rows = spendRows.map((s) => ({
      user_id: String(s.userId),
      name: s.name ?? null,
      email: s.email ?? null,
      role: s.role ?? null,
      spend_cents: s.spendCents ?? null,
      overall_spend_cents: s.overallSpendCents ?? null,
      fast_premium_requests: s.fastPremiumRequests ?? null,
      hard_limit_override_dollars: s.hardLimitOverrideDollars ?? null,
      monthly_limit_dollars: s.monthlyLimitDollars ?? null,
      subscription_cycle_start: subscriptionCycleStart ?? null,
      synced_at: ctx.now,
    }));
    return { rows: upsertRows(spend, rows) };
  },
};

/** POST /teams/daily-usage-data — per-user-per-day rollup (hourly-aggregated, 30-day chunked). */
export const dailyUsageJob: SyncJob = {
  dataType: "daily-usage",
  metricId: "daily-usage",
  label: "Daily usage",
  hourlyPoll: true,
  run: async (ctx) => {
    let total = 0;
    const days: Array<string | undefined> = [];
    const chunkTotal = ctx.chunks.length;
    ctx.reportProgress({
      current: 0,
      total: chunkTotal,
      rows: total,
      message: "Preparing daily usage windows",
    });
    for (const [index, chunk] of ctx.chunks.entries()) {
      const label = windowLabel(chunk.start, chunk.end);
      ctx.reportProgress({
        current: index,
        total: chunkTotal,
        rows: total,
        message: `Fetching daily usage window ${index + 1}/${chunkTotal}: ${label}`,
      });
      const data = await ctx.client.admin.dailyUsage({
        startDate: chunk.start.getTime(),
        endDate: chunk.end.getTime(),
      });
      const rows = data.map((r) => ({
        user_id: String(r.userId),
        day: r.day,
        date: r.date ?? null,
        email: r.email ?? null,
        is_active: r.isActive ?? null,
        total_lines_added: r.totalLinesAdded ?? null,
        total_lines_deleted: r.totalLinesDeleted ?? null,
        accepted_lines_added: r.acceptedLinesAdded ?? null,
        accepted_lines_deleted: r.acceptedLinesDeleted ?? null,
        total_applies: r.totalApplies ?? null,
        total_accepts: r.totalAccepts ?? null,
        total_rejects: r.totalRejects ?? null,
        total_tabs_shown: r.totalTabsShown ?? null,
        total_tabs_accepted: r.totalTabsAccepted ?? null,
        composer_requests: r.composerRequests ?? null,
        chat_requests: r.chatRequests ?? null,
        agent_requests: r.agentRequests ?? null,
        cmdk_usages: r.cmdkUsages ?? null,
        subscription_included_reqs: r.subscriptionIncludedReqs ?? null,
        api_key_reqs: r.apiKeyReqs ?? null,
        usage_based_reqs: r.usageBasedReqs ?? null,
        bugbot_usages: r.bugbotUsages ?? null,
        most_used_model: r.mostUsedModel ?? null,
        apply_most_used_extension: r.applyMostUsedExtension ?? null,
        tab_most_used_extension: r.tabMostUsedExtension ?? null,
        client_version: r.clientVersion ?? null,
      }));
      const written = upsertRows(dailyUsage, rows);
      total += written;
      days.push(...data.map((r) => r.day));
      ctx.reportProgress({
        current: index + 1,
        total: chunkTotal,
        rows: total,
        message: `Inserted ${written.toLocaleString()} daily usage rows from ${label}`,
      });
    }
    return { rows: total, watermark: maxString(days) };
  },
};

/** POST /teams/filtered-usage-events — granular events (hourly-aggregated, 30-day chunked). */
export const usageEventsJob: SyncJob = {
  dataType: "usage-events",
  metricId: "usage-events",
  label: "Usage events",
  hourlyPoll: true,
  run: async (ctx) => {
    let total = 0;
    let maxTs = 0;
    const chunkTotal = ctx.chunks.length;
    ctx.reportProgress({
      current: 0,
      total: chunkTotal,
      rows: total,
      message: "Preparing usage event windows",
    });
    for (const [index, chunk] of ctx.chunks.entries()) {
      const label = windowLabel(chunk.start, chunk.end);
      ctx.reportProgress({
        current: index,
        total: chunkTotal,
        rows: total,
        message: `Fetching usage events window ${index + 1}/${chunkTotal}: ${label}`,
      });
      const events = await ctx.client.admin.usageEvents({
        startDate: chunk.start.getTime(),
        endDate: chunk.end.getTime(),
      });
      const rows = events.map((e) => {
        const ts = parseTimestamp(e.timestamp);
        if (ts && ts > maxTs) maxTs = ts;
        const charged = e.chargedCents ?? "";
        const requestsCosts = e.requestsCosts ?? "";
        // Deterministic dedupe key (see the data-model skill / report).
        const event_key = `${e.timestamp}:${e.userEmail ?? ""}:${e.model ?? ""}:${e.kind ?? ""}:${charged}:${requestsCosts}`;
        return {
          event_key,
          timestamp: ts,
          user_email: e.userEmail ?? null,
          service_account_id: e.serviceAccountId ?? null,
          service_account_name: e.serviceAccountName ?? null,
          model: e.model ?? null,
          kind: e.kind ?? null,
          max_mode: e.maxMode ?? null,
          requests_costs: e.requestsCosts ?? null,
          is_token_based_call: e.isTokenBasedCall ?? null,
          is_chargeable: e.isChargeable ?? null,
          is_headless: e.isHeadless ?? null,
          input_tokens: e.tokenUsage?.inputTokens ?? null,
          output_tokens: e.tokenUsage?.outputTokens ?? null,
          cache_write_tokens: e.tokenUsage?.cacheWriteTokens ?? null,
          cache_read_tokens: e.tokenUsage?.cacheReadTokens ?? null,
          total_cents: e.tokenUsage?.totalCents ?? null,
          discount_percent_off: e.tokenUsage?.discountPercentOff ?? null,
          charged_cents: e.chargedCents ?? null,
          cursor_token_fee: e.cursorTokenFee ?? null,
        };
      });
      ctx.reportProgress({
        current: index,
        total: chunkTotal,
        rows: total,
        message: `Writing ${rows.length.toLocaleString()} usage event rows from ${label} to SQLite`,
      });
      const written = upsertRows(usageEvents, rows);
      total += written;
      ctx.reportProgress({
        current: index + 1,
        total: chunkTotal,
        rows: total,
        message: `Inserted ${written.toLocaleString()} usage event rows from ${label}`,
      });
    }
    return { rows: total, watermark: maxTs ? String(maxTs) : undefined };
  },
};

/** GET /teams/audit-logs — security/admin events (Enterprise-only, 30-day chunked). */
export const auditLogsJob: SyncJob = {
  dataType: "audit-logs",
  metricId: "audit-logs",
  label: "Audit logs",
  enterpriseOnly: true,
  run: async (ctx) => {
    let total = 0;
    let maxTs = 0;
    const chunkTotal = ctx.chunks.length;
    ctx.reportProgress({
      current: 0,
      total: chunkTotal,
      rows: total,
      message: "Preparing audit log windows",
    });
    for (const [index, chunk] of ctx.chunks.entries()) {
      const label = windowLabel(chunk.start, chunk.end);
      ctx.reportProgress({
        current: index,
        total: chunkTotal,
        rows: total,
        message: `Fetching audit log window ${index + 1}/${chunkTotal}: ${label}`,
      });
      const events = await ctx.client.admin.auditLogs({
        startTime: chunk.start.getTime(),
        endTime: chunk.end.getTime(),
      });
      const rows = events.map((e) => {
        const ts = parseTimestamp(e.timestamp);
        if (ts && ts > maxTs) maxTs = ts;
        return {
          event_id: e.event_id,
          timestamp: ts,
          ip_address: e.ip_address ?? null,
          user_email: e.user_email ?? null,
          event_type: e.event_type ?? null,
          event_data: e.event_data !== undefined ? JSON.stringify(e.event_data) : null,
          synced_at: ctx.now,
        };
      });
      const written = upsertRows(auditLogs, rows);
      total += written;
      ctx.reportProgress({
        current: index + 1,
        total: chunkTotal,
        rows: total,
        message: `Inserted ${written.toLocaleString()} audit log rows from ${label}`,
      });
    }
    return { rows: total, watermark: maxTs ? String(maxTs) : undefined };
  },
};

export const adminJobs: SyncJob[] = [
  membersJob,
  spendJob,
  dailyUsageJob,
  usageEventsJob,
  auditLogsJob,
];
