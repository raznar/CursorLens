import "server-only";
import { desc, sql } from "drizzle-orm";
import { aiCodeChangeFiles, aiCodeChanges, aiCodeCommits, db } from "@/db";
import { whenCacheReadable } from "./cache-guard";
import { dayBetween, type Range } from "./filters";
import { type KeyValue, type SeriesRow, pivotSeries, ratio, topN } from "./transforms";

export interface AiCodeTotals {
  commits: number;
  changes: number;
  totalLinesAdded: number;
  tabLinesAdded: number;
  composerLinesAdded: number;
  nonAiLinesAdded: number;
  /** (tab + composer) / total added lines, or null when nothing was committed. */
  aiShare: number | null;
}

export interface AiCodeCommitRow {
  commitHash: string;
  shortHash: string;
  commitDay: string | null;
  user: string;
  repo: string;
  branch: string;
  source: string;
  totalLinesAdded: number;
  aiLinesAdded: number;
  aiShare: number | null;
  message: string;
}

export interface AiCodeData {
  totals: AiCodeTotals;
  /** Added lines per day split by attribution. */
  linesByDay: Array<{ date: string; tab: number; composer: number; nonAi: number }>;
  /** Accepted AI changes per day by source (TAB / COMPOSER). */
  changesByDay: { data: SeriesRow[]; keys: string[] };
  /** AI-added lines by repository. */
  byRepo: KeyValue[];
  /** AI-added lines by contributor. */
  byUser: KeyValue[];
  /** Commits by origin (ide / cli / cloud). */
  bySource: KeyValue[];
  /** Accepted AI lines by file extension. */
  byExtension: KeyValue[];
  /** Accepted Composer changes by model. */
  byModel: KeyValue[];
  commits: AiCodeCommitRow[];
}

const EMPTY: AiCodeData = {
  totals: {
    commits: 0,
    changes: 0,
    totalLinesAdded: 0,
    tabLinesAdded: 0,
    composerLinesAdded: 0,
    nonAiLinesAdded: 0,
    aiShare: null,
  },
  linesByDay: [],
  changesByDay: { data: [], keys: [] },
  byRepo: [],
  byUser: [],
  bySource: [],
  byExtension: [],
  byModel: [],
  commits: [],
};

/** AI Code Tracking page: committed AI share, attribution trends, and accepted-change mix. */
export function getAiCode(range: Range): AiCodeData {
  return whenCacheReadable(EMPTY, () => getAiCodeLoaded(range));
}

const aiAdded = sql<number>`coalesce(${aiCodeCommits.tab_lines_added}, 0) + coalesce(${aiCodeCommits.composer_lines_added}, 0)`;

function getAiCodeLoaded(range: Range): AiCodeData {
  const inRange = dayBetween(aiCodeCommits.commit_day, range);

  const [totalsRow] = db
    .select({
      commits: sql<number>`count(*)`,
      totalLinesAdded: sql<number>`coalesce(sum(${aiCodeCommits.total_lines_added}), 0)`,
      tabLinesAdded: sql<number>`coalesce(sum(${aiCodeCommits.tab_lines_added}), 0)`,
      composerLinesAdded: sql<number>`coalesce(sum(${aiCodeCommits.composer_lines_added}), 0)`,
      nonAiLinesAdded: sql<number>`coalesce(sum(${aiCodeCommits.non_ai_lines_added}), 0)`,
    })
    .from(aiCodeCommits)
    .where(inRange)
    .all();
  const t = totalsRow ?? {
    commits: 0,
    totalLinesAdded: 0,
    tabLinesAdded: 0,
    composerLinesAdded: 0,
    nonAiLinesAdded: 0,
  };

  const linesByDay = db
    .select({
      date: sql<string>`${aiCodeCommits.commit_day}`,
      tab: sql<number>`coalesce(sum(${aiCodeCommits.tab_lines_added}), 0)`,
      composer: sql<number>`coalesce(sum(${aiCodeCommits.composer_lines_added}), 0)`,
      nonAi: sql<number>`coalesce(sum(${aiCodeCommits.non_ai_lines_added}), 0)`,
    })
    .from(aiCodeCommits)
    .where(inRange)
    .groupBy(aiCodeCommits.commit_day)
    .orderBy(aiCodeCommits.commit_day)
    .all();

  const byRepo = topN(
    db
      .select({
        key: sql<string>`coalesce(${aiCodeCommits.repo_name}, 'unknown')`,
        value: sql<number>`coalesce(sum(${aiAdded}), 0)`,
      })
      .from(aiCodeCommits)
      .where(inRange)
      .groupBy(aiCodeCommits.repo_name)
      .all(),
    10,
  );

  const byUser = topN(
    db
      .select({
        key: sql<string>`coalesce(${aiCodeCommits.user_email}, 'unknown')`,
        value: sql<number>`coalesce(sum(${aiAdded}), 0)`,
      })
      .from(aiCodeCommits)
      .where(inRange)
      .groupBy(aiCodeCommits.user_email)
      .all(),
    10,
  );

  const bySource = db
    .select({
      key: sql<string>`coalesce(${aiCodeCommits.commit_source}, 'unknown')`,
      value: sql<number>`count(*)`,
    })
    .from(aiCodeCommits)
    .where(inRange)
    .groupBy(aiCodeCommits.commit_source)
    .all();

  const changeRows = db
    .select({
      date: sql<string>`${aiCodeChanges.created_day}`,
      source: sql<string>`coalesce(${aiCodeChanges.source}, 'unknown')`,
      value: sql<number>`count(*)`,
    })
    .from(aiCodeChanges)
    .where(dayBetween(aiCodeChanges.created_day, range))
    .groupBy(aiCodeChanges.created_day, aiCodeChanges.source)
    .all();
  const changesByDay = pivotSeries(changeRows, {
    date: (r) => r.date,
    series: (r) => r.source,
    value: (r) => r.value,
  });
  const changes = changeRows.reduce((sum, r) => sum + r.value, 0);

  const byExtension = topN(
    db
      .select({
        key: sql<string>`coalesce(${aiCodeChangeFiles.file_extension}, 'unknown')`,
        value: sql<number>`coalesce(sum(${aiCodeChangeFiles.lines_added}), 0)`,
      })
      .from(aiCodeChangeFiles)
      .innerJoin(aiCodeChanges, sql`${aiCodeChanges.change_id} = ${aiCodeChangeFiles.change_id}`)
      .where(dayBetween(aiCodeChanges.created_day, range))
      .groupBy(aiCodeChangeFiles.file_extension)
      .all(),
    10,
  );

  const byModel = topN(
    db
      .select({
        key: sql<string>`coalesce(${aiCodeChanges.model}, 'unknown')`,
        value: sql<number>`count(*)`,
      })
      .from(aiCodeChanges)
      .where(
        sql`${dayBetween(aiCodeChanges.created_day, range)} and ${aiCodeChanges.source} = 'COMPOSER'`,
      )
      .groupBy(aiCodeChanges.model)
      .all(),
    10,
  );

  const commits: AiCodeCommitRow[] = db
    .select()
    .from(aiCodeCommits)
    .where(inRange)
    .orderBy(desc(aiCodeCommits.commit_ts))
    .limit(500)
    .all()
    .map((c) => {
      const total = c.total_lines_added ?? 0;
      const ai = (c.tab_lines_added ?? 0) + (c.composer_lines_added ?? 0);
      return {
        commitHash: c.commit_hash,
        shortHash: c.commit_hash.slice(0, 8),
        commitDay: c.commit_day,
        user: c.user_email ?? c.user_id ?? "unknown",
        repo: c.repo_name ?? "—",
        branch: c.branch_name ?? "—",
        source: c.commit_source ?? "—",
        totalLinesAdded: total,
        aiLinesAdded: ai,
        aiShare: ratio(ai, total),
        message: c.message ?? "",
      };
    });

  return {
    totals: {
      commits: t.commits,
      changes,
      totalLinesAdded: t.totalLinesAdded,
      tabLinesAdded: t.tabLinesAdded,
      composerLinesAdded: t.composerLinesAdded,
      nonAiLinesAdded: t.nonAiLinesAdded,
      aiShare: ratio(t.tabLinesAdded + t.composerLinesAdded, t.totalLinesAdded),
    },
    linesByDay,
    changesByDay,
    byRepo,
    byUser,
    bySource,
    byExtension,
    byModel,
    commits,
  };
}
