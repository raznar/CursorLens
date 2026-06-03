import "server-only";
import { eq, sql } from "drizzle-orm";
import {
  analyticsAskMode,
  analyticsBugbot,
  analyticsCommands,
  analyticsConversationInsights,
  analyticsMcp,
  analyticsPlans,
  analyticsSkills,
  db,
} from "@/db";
import { dayBetween, msBetween, type Range } from "./filters";
import { whenCacheReadable } from "./cache-guard";
import { type KeyValue, sumBy } from "./transforms";

const EMPTY_FEATURES: FeaturesData = {
  mcp: [],
  commands: [],
  plans: [],
  skills: [],
  askMode: [],
  totals: { mcp: 0, commands: 0, skills: 0, askMode: 0 },
  insights: [],
  bugbot: { reviews: 0, issuesTotal: 0, resolvedTotal: 0, bySeverity: [] },
};

export interface InsightSlice {
  slice: string;
  label: string;
  items: KeyValue[];
}

export interface BugbotSummary {
  reviews: number;
  issuesTotal: number;
  resolvedTotal: number;
  bySeverity: KeyValue[];
}

export interface FeaturesData {
  mcp: KeyValue[];
  commands: KeyValue[];
  plans: KeyValue[];
  skills: KeyValue[];
  askMode: KeyValue[];
  totals: { mcp: number; commands: number; skills: number; askMode: number };
  insights: InsightSlice[];
  bugbot: BugbotSummary;
}

const INSIGHT_SLICE_LABELS: Record<string, string> = {
  intents: "Intents",
  complexity: "Complexity",
  categories: "Categories",
  guidanceLevels: "Guidance levels",
  workTypes: "Work types",
};

/** Feature-adoption page: MCP/commands/plans/skills/ask-mode, conversation insights, BugBot. */
export function getFeatures(range: Range): FeaturesData {
  return whenCacheReadable(EMPTY_FEATURES, () => getFeaturesLoaded(range));
}

function getFeaturesLoaded(range: Range): FeaturesData {
  const mcp = db
    .select({
      key: sql<string>`coalesce(${analyticsMcp.mcp_server_name}, 'unknown')`,
      value: sql<number>`coalesce(sum(${analyticsMcp.usage}), 0)`,
    })
    .from(analyticsMcp)
    .where(dayBetween(analyticsMcp.event_date, range))
    .groupBy(analyticsMcp.mcp_server_name)
    .orderBy(sql`coalesce(sum(${analyticsMcp.usage}), 0) desc`)
    .limit(10)
    .all();

  const commands = db
    .select({
      key: sql<string>`coalesce(${analyticsCommands.command_name}, 'unknown')`,
      value: sql<number>`coalesce(sum(${analyticsCommands.usage}), 0)`,
    })
    .from(analyticsCommands)
    .where(dayBetween(analyticsCommands.event_date, range))
    .groupBy(analyticsCommands.command_name)
    .orderBy(sql`coalesce(sum(${analyticsCommands.usage}), 0) desc`)
    .limit(10)
    .all();

  const plans = db
    .select({
      key: sql<string>`coalesce(${analyticsPlans.model}, 'unknown')`,
      value: sql<number>`coalesce(sum(${analyticsPlans.usage}), 0)`,
    })
    .from(analyticsPlans)
    .where(dayBetween(analyticsPlans.event_date, range))
    .groupBy(analyticsPlans.model)
    .orderBy(sql`coalesce(sum(${analyticsPlans.usage}), 0) desc`)
    .limit(10)
    .all();

  const skills = db
    .select({
      key: sql<string>`coalesce(${analyticsSkills.skill_name}, 'unknown')`,
      value: sql<number>`coalesce(sum(${analyticsSkills.usage}), 0)`,
    })
    .from(analyticsSkills)
    .where(dayBetween(analyticsSkills.event_date, range))
    .groupBy(analyticsSkills.skill_name)
    .orderBy(sql`coalesce(sum(${analyticsSkills.usage}), 0) desc`)
    .limit(10)
    .all();

  const askMode = db
    .select({
      key: sql<string>`coalesce(${analyticsAskMode.model}, 'unknown')`,
      value: sql<number>`coalesce(sum(${analyticsAskMode.usage}), 0)`,
    })
    .from(analyticsAskMode)
    .where(dayBetween(analyticsAskMode.event_date, range))
    .groupBy(analyticsAskMode.model)
    .orderBy(sql`coalesce(sum(${analyticsAskMode.usage}), 0) desc`)
    .limit(10)
    .all();

  // Distribution totals are stored with an empty `date` (see schema). These are overall
  // snapshots, not range-scoped.
  const insightRows = db
    .select({
      slice: analyticsConversationInsights.slice,
      label: analyticsConversationInsights.label,
      count: sql<number>`coalesce(${analyticsConversationInsights.count}, 0)`,
    })
    .from(analyticsConversationInsights)
    .where(eq(analyticsConversationInsights.date, ""))
    .all();

  const bySlice = new Map<string, KeyValue[]>();
  for (const row of insightRows) {
    const items = bySlice.get(row.slice) ?? [];
    items.push({ key: row.label, value: row.count });
    bySlice.set(row.slice, items);
  }
  const insights: InsightSlice[] = [...bySlice.entries()].map(([slice, items]) => ({
    slice,
    label: INSIGHT_SLICE_LABELS[slice] ?? slice,
    items: items.sort((a, b) => b.value - a.value),
  }));

  const [bugbotRow] = db
    .select({
      reviews: sql<number>`coalesce(sum(${analyticsBugbot.reviews}), 0)`,
      issuesTotal: sql<number>`coalesce(sum(${analyticsBugbot.issues_total}), 0)`,
      resolvedTotal: sql<number>`coalesce(sum(${analyticsBugbot.resolved_total}), 0)`,
      high: sql<number>`coalesce(sum(${analyticsBugbot.issues_high}), 0)`,
      medium: sql<number>`coalesce(sum(${analyticsBugbot.issues_medium}), 0)`,
      low: sql<number>`coalesce(sum(${analyticsBugbot.issues_low}), 0)`,
    })
    .from(analyticsBugbot)
    .where(msBetween(analyticsBugbot.timestamp, range))
    .all();
  const bb = bugbotRow ?? {
    reviews: 0,
    issuesTotal: 0,
    resolvedTotal: 0,
    high: 0,
    medium: 0,
    low: 0,
  };

  return {
    mcp,
    commands,
    plans,
    skills,
    askMode,
    totals: {
      mcp: sumBy(mcp, (r) => r.value),
      commands: sumBy(commands, (r) => r.value),
      skills: sumBy(skills, (r) => r.value),
      askMode: sumBy(askMode, (r) => r.value),
    },
    insights,
    bugbot: {
      reviews: bb.reviews,
      issuesTotal: bb.issuesTotal,
      resolvedTotal: bb.resolvedTotal,
      bySeverity: [
        { key: "High", value: bb.high },
        { key: "Medium", value: bb.medium },
        { key: "Low", value: bb.low },
      ],
    },
  };
}
