import "server-only";
import { desc, sql } from "drizzle-orm";
import { dailyUsage, db, spend } from "@/db";
import { dayBetween, type Range } from "./filters";
import { type KeyValue, topN } from "./transforms";
import { whenCacheReadable } from "./cache-guard";
import { spendByDay } from "./usage";

const EMPTY_SPEND: SpendData = {
  perUser: [],
  totalSpendCents: 0,
  payingMembers: 0,
  topSpenders: [],
  spendTrend: [],
  requestSplitOverTime: [],
  includedRequests: 0,
  usageBasedRequests: 0,
  apiKeyRequests: 0,
};

export interface SpendUserRow {
  user: string;
  role: string | null;
  spendCents: number;
  overallSpendCents: number;
  monthlyLimitDollars: number | null;
  hardLimitDollars: number | null;
}

export interface RequestSplitPoint {
  date: string;
  included: number;
  usageBased: number;
  apiKey: number;
}

export interface SpendData {
  perUser: SpendUserRow[];
  totalSpendCents: number;
  payingMembers: number;
  topSpenders: KeyValue[];
  spendTrend: Array<{ date: string; cents: number }>;
  requestSplitOverTime: RequestSplitPoint[];
  includedRequests: number;
  usageBasedRequests: number;
  apiKeyRequests: number;
}

/** Spend page: per-user cycle spend, top spenders, spend trend, and request-source split. */
export function getSpend(range: Range): SpendData {
  return whenCacheReadable(EMPTY_SPEND, () => getSpendLoaded(range));
}

function getSpendLoaded(range: Range): SpendData {
  const rows = db
    .select({
      userId: spend.user_id,
      name: spend.name,
      email: spend.email,
      role: spend.role,
      spendCents: sql<number>`coalesce(${spend.spend_cents}, 0)`,
      overallSpendCents: sql<number>`coalesce(${spend.overall_spend_cents}, 0)`,
      monthlyLimitDollars: spend.monthly_limit_dollars,
      hardLimitDollars: spend.hard_limit_override_dollars,
    })
    .from(spend)
    .orderBy(desc(sql`coalesce(${spend.overall_spend_cents}, 0)`))
    .all();

  const perUser: SpendUserRow[] = rows.map((r) => ({
    user: r.email ?? r.name ?? `User ${r.userId}`,
    role: r.role,
    spendCents: r.spendCents,
    overallSpendCents: r.overallSpendCents,
    monthlyLimitDollars: r.monthlyLimitDollars,
    hardLimitDollars: r.hardLimitDollars,
  }));

  const totalSpendCents = perUser.reduce((sum, r) => sum + r.overallSpendCents, 0);
  const payingMembers = perUser.filter((r) => r.overallSpendCents > 0).length;
  const topSpenders = topN(
    perUser.map((r) => ({ key: r.user, value: r.overallSpendCents })),
    10,
  );

  const requestSplitOverTime = db
    .select({
      date: dailyUsage.day,
      included: sql<number>`coalesce(sum(${dailyUsage.subscription_included_reqs}), 0)`,
      usageBased: sql<number>`coalesce(sum(${dailyUsage.usage_based_reqs}), 0)`,
      apiKey: sql<number>`coalesce(sum(${dailyUsage.api_key_reqs}), 0)`,
    })
    .from(dailyUsage)
    .where(dayBetween(dailyUsage.day, range))
    .groupBy(dailyUsage.day)
    .orderBy(dailyUsage.day)
    .all();

  const includedRequests = requestSplitOverTime.reduce((sum, r) => sum + r.included, 0);
  const usageBasedRequests = requestSplitOverTime.reduce((sum, r) => sum + r.usageBased, 0);
  const apiKeyRequests = requestSplitOverTime.reduce((sum, r) => sum + r.apiKey, 0);

  return {
    perUser,
    totalSpendCents,
    payingMembers,
    topSpenders,
    spendTrend: spendByDay(range),
    requestSplitOverTime,
    includedRequests,
    usageBasedRequests,
    apiKeyRequests,
  };
}
