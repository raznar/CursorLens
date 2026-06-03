import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import {
  analyticsAgentEdits,
  analyticsLeaderboard,
  analyticsTabs,
  analyticsTopFileExtensions,
  db,
} from "@/db";
import { dayBetween, type Range } from "./filters";
import { whenCacheReadable } from "./cache-guard";
import { type KeyValue, ratio, sumBy } from "./transforms";

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
  };
}
