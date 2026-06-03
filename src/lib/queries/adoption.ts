import "server-only";
import { sql } from "drizzle-orm";
import { analyticsClientVersions, analyticsDau, db, teamMembers } from "@/db";
import { dayBetween, type Range } from "./filters";
import { whenCacheReadable } from "./cache-guard";
import { pivotSeries, type SeriesRow } from "./transforms";

const EMPTY_ADOPTION: AdoptionData = {
  dau: [],
  peakDau: 0,
  avgDau: 0,
  clientVersions: { data: [], keys: [] },
  members: { active: 0, removed: 0, total: 0 },
};

export interface DauPoint {
  date: string;
  dau: number;
  cliDau: number;
  cloudAgentDau: number;
  bugbotDau: number;
}

export interface AdoptionData {
  dau: DauPoint[];
  peakDau: number;
  avgDau: number;
  clientVersions: { data: SeriesRow[]; keys: string[] };
  members: { active: number; removed: number; total: number };
}

function dauSeries(range: Range): DauPoint[] {
  return db
    .select({
      date: analyticsDau.date,
      dau: sql<number>`coalesce(${analyticsDau.dau}, 0)`,
      cliDau: sql<number>`coalesce(${analyticsDau.cli_dau}, 0)`,
      cloudAgentDau: sql<number>`coalesce(${analyticsDau.cloud_agent_dau}, 0)`,
      bugbotDau: sql<number>`coalesce(${analyticsDau.bugbot_dau}, 0)`,
    })
    .from(analyticsDau)
    .where(dayBetween(analyticsDau.date, range))
    .orderBy(analyticsDau.date)
    .all();
}

function memberCounts(): { active: number; removed: number; total: number } {
  const [row] = db
    .select({
      total: sql<number>`count(*)`,
      removed: sql<number>`coalesce(sum(case when ${teamMembers.is_removed} then 1 else 0 end), 0)`,
    })
    .from(teamMembers)
    .all();
  const total = row?.total ?? 0;
  const removed = row?.removed ?? 0;
  return { total, removed, active: total - removed };
}

/** Adoption page data: DAU surfaces, client-version distribution, and membership counts. */
export function getAdoption(range: Range): AdoptionData {
  return whenCacheReadable(EMPTY_ADOPTION, () => getAdoptionLoaded(range));
}

function getAdoptionLoaded(range: Range): AdoptionData {
  const dau = dauSeries(range);
  const peakDau = dau.reduce((max, point) => Math.max(max, point.dau), 0);
  const avgDau = dau.length
    ? Math.round(dau.reduce((sum, point) => sum + point.dau, 0) / dau.length)
    : 0;

  const versionRows = db
    .select({
      date: analyticsClientVersions.event_date,
      version: analyticsClientVersions.client_version,
      users: sql<number>`coalesce(${analyticsClientVersions.user_count}, 0)`,
    })
    .from(analyticsClientVersions)
    .where(dayBetween(analyticsClientVersions.event_date, range))
    .orderBy(analyticsClientVersions.event_date)
    .all();

  const clientVersions = pivotSeries(versionRows, {
    date: (r) => r.date,
    series: (r) => r.version,
    value: (r) => r.users,
    limit: 6,
  });

  return { dau, peakDau, avgDau, clientVersions, members: memberCounts() };
}
