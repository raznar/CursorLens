import { describe, expect, it } from "vitest";
import { is } from "drizzle-orm";
import { getTableConfig, SQLiteTable } from "drizzle-orm/sqlite-core";
import * as schema from "./schema";
import {
  analyticsConversationInsights,
  analyticsModels,
  auditLogs,
  dailyUsage,
  spend,
  syncCoverage,
  syncRunItems,
  teamMembers,
  usageEvents,
} from "./schema";

/** Sorted names of every primary-key column (handles single + composite PKs). */
function pkColumnNames(table: SQLiteTable): string[] {
  const cfg = getTableConfig(table);
  const composite = cfg.primaryKeys.flatMap((pk) => pk.columns.map((c) => c.name));
  const single = cfg.columns.filter((c) => c.primary).map((c) => c.name);
  return [...composite, ...single].sort();
}

describe("db schema", () => {
  it("exports all 35 tables", () => {
    const tables = Object.values(schema).filter((value) => is(value, SQLiteTable));
    expect(tables).toHaveLength(35);
  });

  it("uses composite + single primary keys that match the spec", () => {
    expect(pkColumnNames(dailyUsage)).toEqual(["day", "user_id"]);
    expect(pkColumnNames(usageEvents)).toEqual(["event_key"]);
    expect(pkColumnNames(analyticsModels)).toEqual(["date", "model"]);
    expect(pkColumnNames(analyticsConversationInsights)).toEqual(["date", "label", "slice"]);
    expect(pkColumnNames(syncRunItems)).toEqual(["data_type", "run_id"]);
    expect(pkColumnNames(syncCoverage)).toEqual(["data_type", "window_end", "window_start"]);
  });

  it("configures team_members with a notNull email and an email index", () => {
    const cfg = getTableConfig(teamMembers);
    expect(cfg.name).toBe("team_members");
    expect(cfg.columns.find((c) => c.name === "email")?.notNull).toBe(true);
    expect(cfg.indexes.some((idx) => idx.config.name === "team_members_email_idx")).toBe(true);
  });

  it("stores daily usage user ids as text", () => {
    const cfg = getTableConfig(dailyUsage);
    expect(cfg.columns.find((c) => c.name === "user_id")?.getSQLType()).toBe("text");
  });

  it("tracks per-run sync progress details", () => {
    const cfg = getTableConfig(syncRunItems);
    expect(cfg.columns.find((c) => c.name === "progress_current")?.getSQLType()).toBe("integer");
    expect(cfg.columns.find((c) => c.name === "progress_total")?.getSQLType()).toBe("integer");
    expect(cfg.columns.find((c) => c.name === "progress_message")?.getSQLType()).toBe("text");
  });

  it("stores money as the right SQLite types", () => {
    const cfg = getTableConfig(usageEvents);
    // Fractional-cent fields are REAL; token counts are INTEGER.
    expect(cfg.columns.find((c) => c.name === "charged_cents")?.getSQLType()).toBe("real");
    expect(cfg.columns.find((c) => c.name === "input_tokens")?.getSQLType()).toBe("integer");
    // Cycle spend became fractional cents in June 2026.
    const spendCfg = getTableConfig(spend);
    expect(spendCfg.columns.find((c) => c.name === "spend_cents")?.getSQLType()).toBe("real");
    expect(spendCfg.columns.find((c) => c.name === "overall_spend_cents")?.getSQLType()).toBe(
      "real",
    );
  });

  it("carries the attribution ids on usage events and the surface on audit logs", () => {
    const ue = getTableConfig(usageEvents);
    for (const name of ["conversation_id", "cloud_agent_id", "automation_id"]) {
      expect(ue.columns.find((c) => c.name === name)?.getSQLType()).toBe("text");
    }
    expect(ue.indexes.some((i) => i.config.name === "usage_events_conversation_id_idx")).toBe(true);
    const al = getTableConfig(auditLogs);
    expect(al.columns.find((c) => c.name === "application_type")?.getSQLType()).toBe("text");
  });
});
