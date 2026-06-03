// @vitest-environment node
import Database from "better-sqlite3";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { describe, expect, it } from "vitest";
import { usageEvents } from "@/db/schema";
import { dayFromMs, msBetween } from "./filters";
import {
  computeDelta,
  groupSum,
  mergeByDate,
  pivotSeries,
  ratio,
  sumBy,
  topN,
  withShare,
} from "./transforms";

interface ModelRow {
  date: string;
  model: string;
  messages: number;
}

const modelRows: ModelRow[] = [
  { date: "2024-03-01", model: "opus", messages: 10 },
  { date: "2024-03-01", model: "sonnet", messages: 30 },
  { date: "2024-03-02", model: "opus", messages: 20 },
  { date: "2024-03-02", model: "gpt", messages: 5 },
];

describe("transforms", () => {
  it("sumBy ignores null/NaN values", () => {
    expect(sumBy(modelRows, (r) => r.messages)).toBe(65);
    expect(sumBy([{ v: 1 }, { v: null }, { v: NaN }], (r) => r.v)).toBe(1);
    expect(sumBy([], () => 1)).toBe(0);
  });

  it("groupSum aggregates by key", () => {
    const byModel = groupSum(
      modelRows,
      (r) => r.model,
      (r) => r.messages,
    );
    const map = Object.fromEntries(byModel.map((kv) => [kv.key, kv.value]));
    expect(map).toEqual({ opus: 30, sonnet: 30, gpt: 5 });
  });

  it("topN returns the largest items, descending, without mutating input", () => {
    const items = [
      { key: "a", value: 1 },
      { key: "b", value: 9 },
      { key: "c", value: 5 },
    ];
    const top2 = topN(items, 2);
    expect(top2.map((i) => i.key)).toEqual(["b", "c"]);
    expect(items[0].key).toBe("a"); // original order preserved
  });

  it("withShare computes fractional shares and is empty-safe", () => {
    const shares = withShare([
      { key: "a", value: 25 },
      { key: "b", value: 75 },
    ]);
    expect(shares.find((s) => s.key === "a")?.share).toBeCloseTo(0.25);
    expect(withShare([{ key: "z", value: 0 }])[0].share).toBe(0);
    expect(withShare([])).toEqual([]);
  });

  it("computeDelta and ratio guard divide-by-zero", () => {
    expect(computeDelta(120, 100)).toBeCloseTo(0.2);
    expect(computeDelta(10, 0)).toBeNull();
    expect(ratio(1, 4)).toBe(0.25);
    expect(ratio(1, 0)).toBeNull();
  });

  it("pivotSeries widens long rows into zero-filled, date-sorted rows", () => {
    const { data, keys } = pivotSeries(modelRows, {
      date: (r) => r.date,
      series: (r) => r.model,
      value: (r) => r.messages,
    });
    expect(keys.sort()).toEqual(["gpt", "opus", "sonnet"]);
    expect(data.map((d) => d.date)).toEqual(["2024-03-01", "2024-03-02"]);
    expect(data[0]).toMatchObject({ date: "2024-03-01", opus: 10, sonnet: 30, gpt: 0 });
    expect(data[1]).toMatchObject({ date: "2024-03-02", opus: 20, gpt: 5, sonnet: 0 });
  });

  it("pivotSeries folds beyond `limit` into an Other bucket", () => {
    const { keys, data } = pivotSeries(modelRows, {
      date: (r) => r.date,
      series: (r) => r.model,
      value: (r) => r.messages,
      limit: 1,
    });
    expect(keys).toEqual(["opus", "Other"]); // opus has the highest total (30)
    // 2024-03-01: sonnet(30) folded into Other; opus 10
    expect(data[0]).toMatchObject({ opus: 10, Other: 30 });
  });

  it("mergeByDate overlays independent series onto one date axis", () => {
    const merged = mergeByDate([
      [
        { date: "2024-03-01", accepts: 4 },
        { date: "2024-03-02", accepts: 6 },
      ],
      [{ date: "2024-03-01", suggestions: 10 }],
    ]);
    expect(merged).toEqual([
      { date: "2024-03-01", accepts: 4, suggestions: 10 },
      { date: "2024-03-02", accepts: 6 },
    ]);
  });
});

describe("query filters against an in-memory SQLite database", () => {
  function seedDb() {
    const sqlite = new Database(":memory:");
    // Full column set so drizzle's insert (which references every schema column) succeeds.
    sqlite.exec(
      `CREATE TABLE usage_events (
        event_key TEXT PRIMARY KEY,
        timestamp INTEGER,
        user_email TEXT,
        service_account_id TEXT,
        service_account_name TEXT,
        model TEXT,
        kind TEXT,
        max_mode INTEGER,
        requests_costs REAL,
        is_token_based_call INTEGER,
        is_chargeable INTEGER,
        is_headless INTEGER,
        input_tokens INTEGER,
        output_tokens INTEGER,
        cache_write_tokens INTEGER,
        cache_read_tokens INTEGER,
        total_cents REAL,
        discount_percent_off REAL,
        charged_cents REAL,
        cursor_token_fee REAL
      );`,
    );
    const db = drizzle(sqlite, { schema: { usageEvents } });
    const day = (iso: string) => Date.parse(`${iso}T12:00:00Z`);
    db.insert(usageEvents)
      .values([
        {
          event_key: "a",
          timestamp: day("2024-03-01"),
          model: "opus",
          max_mode: true,
          charged_cents: 150.5,
        },
        {
          event_key: "b",
          timestamp: day("2024-03-01"),
          model: "sonnet",
          max_mode: false,
          charged_cents: 49.5,
        },
        {
          event_key: "c",
          timestamp: day("2024-03-02"),
          model: "opus",
          max_mode: false,
          charged_cents: 200,
        },
        // Outside the queried window — must be excluded.
        {
          event_key: "d",
          timestamp: day("2024-01-01"),
          model: "opus",
          max_mode: true,
          charged_cents: 999,
        },
      ])
      .run();
    return db;
  }

  it("buckets epoch-ms rows into days and sums charged cents within the range", () => {
    const db = seedDb();
    const range = { start: new Date("2024-02-15"), end: new Date("2024-03-10") };
    const day = dayFromMs(usageEvents.timestamp);
    const rows = db
      .select({ day, cents: sql<number>`coalesce(sum(${usageEvents.charged_cents}), 0)` })
      .from(usageEvents)
      .where(msBetween(usageEvents.timestamp, range))
      .groupBy(day)
      .orderBy(day)
      .all();

    expect(rows).toEqual([
      { day: "2024-03-01", cents: 200 },
      { day: "2024-03-02", cents: 200 },
    ]);
    // The excluded January row is gone; total matches the in-range transform.
    expect(sumBy(rows, (r) => r.cents)).toBe(400);
  });
});
