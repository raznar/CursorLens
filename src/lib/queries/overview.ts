import "server-only";
import { sql } from "drizzle-orm";
import { analyticsDau, analyticsModels, db, spend } from "@/db";
import { dayBetween, previousRange, type Range } from "./filters";
import { computeDelta, type KeyValue, ratio, topN } from "./transforms";
import { whenCacheReadable } from "./cache-guard";
import { dailyUsageTotals, spendByDay } from "./usage";

const EMPTY_OVERVIEW: OverviewData = {
  kpis: {
    latestDau: 0,
    dauDelta: null,
    cycleSpendCents: 0,
    totalRequests: 0,
    requestsDelta: null,
    linesAccepted: 0,
    linesDelta: null,
    acceptanceRate: null,
    acceptanceDelta: null,
  },
  dauTrend: [],
  spendTrend: [],
  topModels: [],
};

export interface OverviewKpis {
  latestDau: number;
  dauDelta: number | null;
  cycleSpendCents: number;
  totalRequests: number;
  requestsDelta: number | null;
  linesAccepted: number;
  linesDelta: number | null;
  acceptanceRate: number | null;
  acceptanceDelta: number | null;
}

export interface OverviewData {
  kpis: OverviewKpis;
  dauTrend: Array<{ date: string; dau: number }>;
  spendTrend: Array<{ date: string; cents: number }>;
  topModels: KeyValue[];
}

function dauSeries(range: Range): Array<{ date: string; dau: number }> {
  return db
    .select({ date: analyticsDau.date, dau: sql<number>`coalesce(${analyticsDau.dau}, 0)` })
    .from(analyticsDau)
    .where(dayBetween(analyticsDau.date, range))
    .orderBy(analyticsDau.date)
    .all();
}

function latestDau(series: Array<{ dau: number }>): number {
  return series.length ? series[series.length - 1].dau : 0;
}

function cycleSpendCents(): number {
  const [row] = db
    .select({ cents: sql<number>`coalesce(sum(${spend.overall_spend_cents}), 0)` })
    .from(spend)
    .all();
  return row?.cents ?? 0;
}

function modelMessages(range: Range): KeyValue[] {
  return db
    .select({
      key: sql<string>`coalesce(${analyticsModels.model}, 'unknown')`,
      value: sql<number>`coalesce(sum(${analyticsModels.messages}), 0)`,
    })
    .from(analyticsModels)
    .where(dayBetween(analyticsModels.date, range))
    .groupBy(analyticsModels.model)
    .all();
}

/** Everything the Overview page renders: headline KPIs + three trend/top charts. */
export function getOverview(range: Range): OverviewData {
  return whenCacheReadable(EMPTY_OVERVIEW, () => getOverviewLoaded(range));
}

function getOverviewLoaded(range: Range): OverviewData {
  const prev = previousRange(range);
  const daily = dailyUsageTotals(range);
  const prevDaily = dailyUsageTotals(prev);
  const dauTrend = dauSeries(range);

  const acceptanceRate = ratio(daily.accepts, daily.accepts + daily.rejects);
  const prevAcceptance = ratio(prevDaily.accepts, prevDaily.accepts + prevDaily.rejects);

  return {
    kpis: {
      latestDau: latestDau(dauTrend),
      dauDelta: computeDelta(latestDau(dauTrend), latestDau(dauSeries(prev))),
      cycleSpendCents: cycleSpendCents(),
      totalRequests: daily.totalRequests,
      requestsDelta: computeDelta(daily.totalRequests, prevDaily.totalRequests),
      linesAccepted: daily.linesAccepted,
      linesDelta: computeDelta(daily.linesAccepted, prevDaily.linesAccepted),
      acceptanceRate,
      acceptanceDelta:
        acceptanceRate != null && prevAcceptance != null
          ? computeDelta(acceptanceRate, prevAcceptance)
          : null,
    },
    dauTrend,
    spendTrend: spendByDay(range),
    topModels: topN(modelMessages(range), 6),
  };
}
