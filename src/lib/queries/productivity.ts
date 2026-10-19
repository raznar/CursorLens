import "server-only";
import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import {
  aiCodeChanges,
  analyticsAgentEdits,
  analyticsLeaderboard,
  analyticsTabs,
  analyticsTopFileExtensions,
  db,
  usageEvents,
} from "@/db";
import { dayBetween, msBetween, type Range } from "./filters";
import { whenCacheReadable } from "./cache-guard";
import { joinCostPerLine, type CostPerLineRow, type KeyValue, ratio, sumBy } from "./transforms";

const EMPTY_COST: CostPerAcceptedLine = {
  centsPerLine: null,
  acceptedLines: 0,
  chargedCents: 0,
  bestModel: null,
  byUser: [],
  byModel: [],
};

const EMPTY_PRODUCTIVITY: ProductivityData = {
  agentEdits: [],
  tabs: [],
  agentAcceptance: null,
  tabAcceptance: null,
  diffsAccepted: 0,
  tabAccepts: 0,
  topExtensions: [],
  agentLeaderboard: [],
  tabLeaderboard: [],
  costPerAcceptedLine: EMPTY_COST,
};

export interface AgentEditPoint {
  date: string;
  accepted: number;
  rejected: number;
  suggested: number;
}

export interface TabPoint {
  date: string;
  accepts: number;
  rejects: number;
  suggestions: number;
}

export interface LeaderboardRow {
  rank: number | null;
  email: string;
  accepts: number;
  linesAccepted: number;
  acceptRatio: number | null;
  lineAcceptanceRatio: number | null;
}

export interface CostPerAcceptedLine {
  /** Team charged cents / all accepted lines in the window. Null when no lines were accepted. */
  centsPerLine: number | null;
  acceptedLines: number;
  chargedCents: number;
  /** Lowest cents-per-line model that accepted at least one line. */
  bestModel: string | null;
  byUser: CostPerLineRow[];
  byModel: CostPerLineRow[];
}

export interface ProductivityData {
  agentEdits: AgentEditPoint[];
  tabs: TabPoint[];
  agentAcceptance: number | null;
  tabAcceptance: number | null;
  diffsAccepted: number;
  tabAccepts: number;
  topExtensions: KeyValue[];
  agentLeaderboard: LeaderboardRow[];
  tabLeaderboard: LeaderboardRow[];
  costPerAcceptedLine: CostPerAcceptedLine;
}

/** Blank model/email become "unknown" so SQLite doesn't drop them from GROUP BY. */
function labelKey(col: AnySQLiteColumn): SQL<string> {
  return sql<string>`coalesce(nullif(${col}, ''), 'unknown')`;
}

function leaderboard(board: "tab" | "agent"): LeaderboardRow[] {
  return db
    .select({
      rank: analyticsLeaderboard.rank,
      email: sql<string>`coalesce(${analyticsLeaderboard.email}, ${analyticsLeaderboard.user_id})`,
      accepts: sql<number>`coalesce(${analyticsLeaderboard.total_accepts}, 0)`,
      linesAccepted: sql<number>`coalesce(${analyticsLeaderboard.total_lines_accepted}, 0)`,
      acceptRatio: analyticsLeaderboard.accept_ratio,
      lineAcceptanceRatio: analyticsLeaderboard.line_acceptance_ratio,
    })
    .from(analyticsLeaderboard)
    .where(eq(analyticsLeaderboard.board, board))
    .orderBy(asc(analyticsLeaderboard.rank))
    .all();
}

/** Productivity page: agent-edit/tab acceptance trends, ratios, extensions, and leaderboards. */
export function getProductivity(range: Range): ProductivityData {
  return whenCacheReadable(EMPTY_PRODUCTIVITY, () => getProductivityLoaded(range));
}

function getProductivityLoaded(range: Range): ProductivityData {
  const agentEdits = db
    .select({
      date: analyticsAgentEdits.event_date,
      accepted: sql<number>`coalesce(${analyticsAgentEdits.total_accepted_diffs}, 0)`,
      rejected: sql<number>`coalesce(${analyticsAgentEdits.total_rejected_diffs}, 0)`,
      suggested: sql<number>`coalesce(${analyticsAgentEdits.total_suggested_diffs}, 0)`,
    })
    .from(analyticsAgentEdits)
    .where(dayBetween(analyticsAgentEdits.event_date, range))
    .orderBy(analyticsAgentEdits.event_date)
    .all();

  const tabs = db
    .select({
      date: analyticsTabs.event_date,
      accepts: sql<number>`coalesce(${analyticsTabs.total_accepts}, 0)`,
      rejects: sql<number>`coalesce(${analyticsTabs.total_rejects}, 0)`,
      suggestions: sql<number>`coalesce(${analyticsTabs.total_suggestions}, 0)`,
    })
    .from(analyticsTabs)
    .where(dayBetween(analyticsTabs.event_date, range))
    .orderBy(analyticsTabs.event_date)
    .all();

  const diffsAccepted = sumBy(agentEdits, (r) => r.accepted);
  const diffsRejected = sumBy(agentEdits, (r) => r.rejected);
  const tabAccepts = sumBy(tabs, (r) => r.accepts);
  const tabSuggestions = sumBy(tabs, (r) => r.suggestions);

  const topExtensions = db
    .select({
      key: analyticsTopFileExtensions.file_extension,
      value: sql<number>`coalesce(sum(${analyticsTopFileExtensions.total_lines_accepted}), 0)`,
    })
    .from(analyticsTopFileExtensions)
    .where(dayBetween(analyticsTopFileExtensions.event_date, range))
    .groupBy(analyticsTopFileExtensions.file_extension)
    .orderBy(sql`coalesce(sum(${analyticsTopFileExtensions.total_lines_accepted}), 0) desc`)
    .limit(12)
    .all();

  return {
    agentEdits,
    tabs,
    agentAcceptance: ratio(diffsAccepted, diffsAccepted + diffsRejected),
    tabAcceptance: ratio(tabAccepts, tabSuggestions),
    diffsAccepted,
    tabAccepts,
    topExtensions,
    agentLeaderboard: leaderboard("agent"),
    tabLeaderboard: leaderboard("tab"),
    costPerAcceptedLine: costPerAcceptedLine(range),
  };
}

/**
 * Charged usage divided by accepted AI lines in the same window.
 * Changes don't carry conversation_id, so spend matches on user email + model
 * rather than per edit. Null-model rows are Tab accepts: they count for the
 * team and the user, and they are left out of the model ranking so an
 * unattributed bucket can't win as "free".
 */
function costPerAcceptedLine(range: Range): CostPerAcceptedLine {
  const [lineTotal] = db
    .select({
      lines: sql<number>`coalesce(sum(${aiCodeChanges.total_lines_added}), 0)`,
    })
    .from(aiCodeChanges)
    .where(dayBetween(aiCodeChanges.created_day, range))
    .all();
  const [costTotal] = db
    .select({
      cents: sql<number>`coalesce(sum(${usageEvents.charged_cents}), 0)`,
    })
    .from(usageEvents)
    .where(msBetween(usageEvents.timestamp, range))
    .all();

  const acceptedLines = lineTotal?.lines ?? 0;
  const chargedCents = costTotal?.cents ?? 0;

  const userLines = groupedLines(labelKey(aiCodeChanges.user_email), range);
  const userCosts = groupedCosts(labelKey(usageEvents.user_email), range);
  const modelLines = groupedLines(labelKey(aiCodeChanges.model), range, true);
  const modelCosts = groupedCosts(labelKey(usageEvents.model), range);

  const byUser = withLines(joinCostPerLine(userLines, userCosts));
  const byModel = withLines(joinCostPerLine(modelLines, modelCosts));

  return {
    centsPerLine: ratio(chargedCents, acceptedLines),
    acceptedLines,
    chargedCents,
    bestModel: byModel[0]?.key ?? null,
    byUser,
    byModel,
  };
}

function withLines(rows: CostPerLineRow[]): CostPerLineRow[] {
  return rows.filter((row) => row.acceptedLines > 0);
}

function groupedLines(key: SQL<string>, range: Range, requireModel = false): KeyValue[] {
  const window = dayBetween(aiCodeChanges.created_day, range);
  return db
    .select({
      key,
      value: sql<number>`coalesce(sum(${aiCodeChanges.total_lines_added}), 0)`,
    })
    .from(aiCodeChanges)
    .where(
      requireModel ? and(window, sql`nullif(${aiCodeChanges.model}, '') is not null`) : window,
    )
    .groupBy(key)
    .all();
}

function groupedCosts(key: SQL<string>, range: Range): KeyValue[] {
  return db
    .select({
      key,
      value: sql<number>`coalesce(sum(${usageEvents.charged_cents}), 0)`,
    })
    .from(usageEvents)
    .where(msBetween(usageEvents.timestamp, range))
    .groupBy(key)
    .all();
}
