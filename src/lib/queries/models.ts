import "server-only";
import { desc, sql } from "drizzle-orm";
import { analyticsModels, byUserModels, db } from "@/db";
import { dayBetween, type Range } from "./filters";
import { pivotSeries, ratio, type SeriesRow, topN, withShare } from "./transforms";
import { whenCacheReadable } from "./cache-guard";
import { costByModel, tokensByModel, usageEventTotals } from "./usage";

const EMPTY_MODELS: ModelsData = {
  messagesOverTime: { data: [], keys: [] },
  modelMix: [],
  maxModeShare: null,
  events: 0,
  totalTokens: 0,
  costByModel: [],
  tokensByModel: [],
  byUser: [],
};

export interface ModelMixRow {
  model: string;
  messages: number;
  share: number;
}

export interface ByUserModelRow {
  email: string;
  model: string;
  messages: number;
}

export interface ModelsData {
  messagesOverTime: { data: SeriesRow[]; keys: string[] };
  modelMix: ModelMixRow[];
  maxModeShare: number | null;
  events: number;
  totalTokens: number;
  costByModel: Array<{ model: string; cents: number }>;
  tokensByModel: Array<{ model: string; tokens: number }>;
  byUser: ByUserModelRow[];
}

/** Model usage page: message mix over time, max-mode share, and per-model cost/tokens. */
export function getModels(range: Range): ModelsData {
  return whenCacheReadable(EMPTY_MODELS, () => getModelsLoaded(range));
}

function getModelsLoaded(range: Range): ModelsData {
  const modelRows = db
    .select({
      date: analyticsModels.date,
      model: sql<string>`coalesce(${analyticsModels.model}, 'unknown')`,
      messages: sql<number>`coalesce(${analyticsModels.messages}, 0)`,
    })
    .from(analyticsModels)
    .where(dayBetween(analyticsModels.date, range))
    .orderBy(analyticsModels.date)
    .all();

  const messagesOverTime = pivotSeries(modelRows, {
    date: (r) => r.date,
    series: (r) => r.model,
    value: (r) => r.messages,
    limit: 6,
  });

  const mixTotals = db
    .select({
      key: sql<string>`coalesce(${analyticsModels.model}, 'unknown')`,
      value: sql<number>`coalesce(sum(${analyticsModels.messages}), 0)`,
    })
    .from(analyticsModels)
    .where(dayBetween(analyticsModels.date, range))
    .groupBy(analyticsModels.model)
    .all();
  const modelMix: ModelMixRow[] = withShare(mixTotals)
    .map((item) => ({ model: item.key, messages: item.value, share: item.share }))
    .sort((a, b) => b.messages - a.messages);

  const totals = usageEventTotals(range);

  const byUser = db
    .select({
      email: byUserModels.email,
      model: byUserModels.model,
      messages: sql<number>`coalesce(sum(${byUserModels.messages}), 0)`,
    })
    .from(byUserModels)
    .where(dayBetween(byUserModels.date, range))
    .groupBy(byUserModels.email, byUserModels.model)
    .orderBy(desc(sql`coalesce(sum(${byUserModels.messages}), 0)`))
    .limit(1000)
    .all();

  return {
    messagesOverTime,
    modelMix,
    maxModeShare: ratio(totals.maxModeEvents, totals.events),
    events: totals.events,
    totalTokens:
      totals.inputTokens + totals.outputTokens + totals.cacheReadTokens + totals.cacheWriteTokens,
    costByModel: topN(costByModel(range), 8).map((kv) => ({ model: kv.key, cents: kv.value })),
    tokensByModel: topN(tokensByModel(range), 8).map((kv) => ({ model: kv.key, tokens: kv.value })),
    byUser,
  };
}
