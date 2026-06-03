import "server-only";
import { sql } from "drizzle-orm";
import { dailyUsage, db, usageEvents } from "@/db";
import { dayBetween, dayFromMs, msBetween, type Range } from "./filters";
import type { KeyValue } from "./transforms";

/** Daily charged spend (from granular usage events), bucketed by UTC day. */
export function spendByDay(range: Range): Array<{ date: string; cents: number }> {
  const day = dayFromMs(usageEvents.timestamp);
  return db
    .select({ date: day, cents: sql<number>`coalesce(sum(${usageEvents.charged_cents}), 0)` })
    .from(usageEvents)
    .where(msBetween(usageEvents.timestamp, range))
    .groupBy(day)
    .orderBy(day)
    .all();
}

export interface UsageEventTotals {
  events: number;
  maxModeEvents: number;
  chargedCents: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/** Aggregate granular usage-event counters across the window. */
export function usageEventTotals(range: Range): UsageEventTotals {
  const [row] = db
    .select({
      events: sql<number>`count(*)`,
      maxModeEvents: sql<number>`coalesce(sum(case when ${usageEvents.max_mode} then 1 else 0 end), 0)`,
      chargedCents: sql<number>`coalesce(sum(${usageEvents.charged_cents}), 0)`,
      inputTokens: sql<number>`coalesce(sum(${usageEvents.input_tokens}), 0)`,
      outputTokens: sql<number>`coalesce(sum(${usageEvents.output_tokens}), 0)`,
      cacheReadTokens: sql<number>`coalesce(sum(${usageEvents.cache_read_tokens}), 0)`,
      cacheWriteTokens: sql<number>`coalesce(sum(${usageEvents.cache_write_tokens}), 0)`,
    })
    .from(usageEvents)
    .where(msBetween(usageEvents.timestamp, range))
    .all();
  return (
    row ?? {
      events: 0,
      maxModeEvents: 0,
      chargedCents: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    }
  );
}

/** Charged spend (cents) per model from usage events. */
export function costByModel(range: Range): KeyValue[] {
  const model = sql<string>`coalesce(${usageEvents.model}, 'unknown')`;
  return db
    .select({ key: model, value: sql<number>`coalesce(sum(${usageEvents.charged_cents}), 0)` })
    .from(usageEvents)
    .where(msBetween(usageEvents.timestamp, range))
    .groupBy(model)
    .all();
}

/** Total tokens (in + out + cache) per model from usage events. */
export function tokensByModel(range: Range): KeyValue[] {
  const model = sql<string>`coalesce(${usageEvents.model}, 'unknown')`;
  const tokens = sql<number>`coalesce(sum(
    coalesce(${usageEvents.input_tokens}, 0) +
    coalesce(${usageEvents.output_tokens}, 0) +
    coalesce(${usageEvents.cache_read_tokens}, 0) +
    coalesce(${usageEvents.cache_write_tokens}, 0)
  ), 0)`;
  return db
    .select({ key: model, value: tokens })
    .from(usageEvents)
    .where(msBetween(usageEvents.timestamp, range))
    .groupBy(model)
    .all();
}

export interface DailyUsageTotals {
  includedRequests: number;
  usageBasedRequests: number;
  apiKeyRequests: number;
  totalRequests: number;
  accepts: number;
  rejects: number;
  applies: number;
  linesAccepted: number;
  linesAdded: number;
  tabsShown: number;
  tabsAccepted: number;
}

/** Aggregate the per-user-per-day usage rollup across the window. */
export function dailyUsageTotals(range: Range): DailyUsageTotals {
  const [row] = db
    .select({
      includedRequests: sql<number>`coalesce(sum(${dailyUsage.subscription_included_reqs}), 0)`,
      usageBasedRequests: sql<number>`coalesce(sum(${dailyUsage.usage_based_reqs}), 0)`,
      apiKeyRequests: sql<number>`coalesce(sum(${dailyUsage.api_key_reqs}), 0)`,
      accepts: sql<number>`coalesce(sum(${dailyUsage.total_accepts}), 0)`,
      rejects: sql<number>`coalesce(sum(${dailyUsage.total_rejects}), 0)`,
      applies: sql<number>`coalesce(sum(${dailyUsage.total_applies}), 0)`,
      linesAccepted: sql<number>`coalesce(sum(coalesce(${dailyUsage.accepted_lines_added}, 0) + coalesce(${dailyUsage.accepted_lines_deleted}, 0)), 0)`,
      linesAdded: sql<number>`coalesce(sum(${dailyUsage.total_lines_added}), 0)`,
      tabsShown: sql<number>`coalesce(sum(${dailyUsage.total_tabs_shown}), 0)`,
      tabsAccepted: sql<number>`coalesce(sum(${dailyUsage.total_tabs_accepted}), 0)`,
    })
    .from(dailyUsage)
    .where(dayBetween(dailyUsage.day, range))
    .all();
  const base = row ?? {
    includedRequests: 0,
    usageBasedRequests: 0,
    apiKeyRequests: 0,
    accepts: 0,
    rejects: 0,
    applies: 0,
    linesAccepted: 0,
    linesAdded: 0,
    tabsShown: 0,
    tabsAccepted: 0,
  };
  return {
    ...base,
    totalRequests: base.includedRequests + base.usageBasedRequests + base.apiKeyRequests,
  };
}
