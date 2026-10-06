import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type * as DbModule from "@/db";
import type * as AiCodeQueries from "./ai-code";
import type * as FeatureQueries from "./features";
import type * as MemberQueries from "./members";
import type * as SpendQueries from "./spend";

/**
 * Query helpers for the newer endpoint families, run against a temp SQLite DB filled by a
 * mock backfill. The live-cache guard is bypassed so fixture rows are visible.
 */
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-lens-queries-"));
vi.stubEnv("DATA_DIR", dataDir);
vi.stubEnv("CURSOR_MOCK", "1");
vi.stubEnv("LOG_LEVEL", "silent");
vi.mock("./cache-guard", () => ({
  whenCacheReadable: <T>(_empty: T, load: () => T) => load(),
}));

let dbModule: typeof DbModule;
let aiCode: typeof AiCodeQueries;
let features: typeof FeatureQueries;
let members: typeof MemberQueries;
let spend: typeof SpendQueries;
const range = { start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), end: new Date() };

beforeAll(async () => {
  dbModule = await import("@/db");
  migrate(drizzle(dbModule.sqlite), { migrationsFolder: path.resolve("./drizzle") });
  const engine = await import("@/lib/sync/engine");
  const summary = await engine.runSync({
    mode: "backfill",
    days: 45,
    only: [
      "team-members",
      "spend",
      "daily-usage",
      "billing-groups",
      "directory-groups",
      "bugbot-reviews",
      "ai-code-commits",
      "ai-code-changes",
    ],
  });
  expect(summary.status).toBe("ok");
  [aiCode, features, members, spend] = await Promise.all([
    import("./ai-code"),
    import("./features"),
    import("./members"),
    import("./spend"),
  ]);
});

afterAll(() => {
  dbModule.sqlite.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("getAiCode", () => {
  it("computes the AI share and attribution breakdowns", () => {
    const data = aiCode.getAiCode(range);
    expect(data.totals.commits).toBeGreaterThan(0);
    expect(data.totals.aiShare).not.toBeNull();
    expect(data.totals.aiShare!).toBeGreaterThan(0);
    expect(data.totals.aiShare!).toBeLessThanOrEqual(1);
    expect(
      data.totals.tabLinesAdded + data.totals.composerLinesAdded + data.totals.nonAiLinesAdded,
    ).toBe(data.totals.totalLinesAdded);
    expect(data.linesByDay.length).toBeGreaterThan(0);
    expect(data.changesByDay.keys.sort()).toEqual(["COMPOSER", "TAB"]);
    expect(data.bySource.map((s) => s.key).sort()).toEqual(["cli", "cloud", "ide"]);
    expect(data.byRepo.length).toBeGreaterThan(0);
    expect(data.byExtension.length).toBeGreaterThan(0);
    expect(data.byModel.every((m) => m.key !== "unknown")).toBe(true);
    const commit = data.commits[0]!;
    expect(commit.shortHash).toHaveLength(8);
    expect(commit.aiLinesAdded).toBeLessThanOrEqual(commit.totalLinesAdded);
  });
});

describe("getSpend billing groups", () => {
  it("reports the latest cycle's groups and a per-group daily series", () => {
    const data = spend.getSpend(range);
    expect(data.billingCycleStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const names = data.billingGroups.map((g) => g.group);
    expect(names).toEqual(expect.arrayContaining(["Engineering", "Design", "Unassigned"]));
    expect(data.billingGroups[0]!.spendCents).toBeGreaterThanOrEqual(
      data.billingGroups.at(-1)!.spendCents,
    );
    expect(data.groupSpendByDay.keys.length).toBeGreaterThan(0);
    expect(data.perUser[0]).toHaveProperty("effectiveLimitDollars");
  });
});

describe("getFeatures bugbot reviews", () => {
  it("sums billed cost and splits findings by resolution", () => {
    const data = features.getFeatures(range);
    const r = data.bugbotReviews;
    expect(r.reviews).toBeGreaterThan(0);
    expect(r.dryRuns).toBeGreaterThan(0);
    expect(r.dryRuns).toBeLessThan(r.reviews);
    expect(r.costCents).toBeGreaterThan(0);
    const keys = r.byResolution.map((k) => k.key).sort();
    expect(keys).toEqual(["dry run", "resolved", "unresolved"]);
    expect(r.costByDay.length).toBeGreaterThan(0);
    expect(r.byRepo.length).toBe(2);
  });
});

describe("getMembers directory groups", () => {
  it("joins each member to their directory groups and summarises groups", () => {
    const data = members.getMembers(range);
    const alice = data.members.find((m) => m.email === "alice@acme.test")!;
    expect(alice.groups).toBe("Engineering");
    expect(data.groups.map((g) => g.group).sort()).toEqual(["Design", "Engineering"]);
    const eng = data.groups.find((g) => g.group === "Engineering")!;
    expect(eng.members).toBe(3);
    expect(eng.monthlyLimitDollars).toBe(500);
    expect(eng.spendCents).toBeGreaterThan(0);
  });
});
