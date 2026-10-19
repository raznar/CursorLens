import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type * as DbModule from "@/db";
import type * as ProductivityQueries from "./productivity";

/**
 * Cost-per-accepted-line is asserted against hand-inserted rows so the
 * user/model join and the date window are exact, not an artifact of mock sync.
 */
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-lens-productivity-"));
vi.stubEnv("DATA_DIR", dataDir);
vi.stubEnv("LOG_LEVEL", "silent");
vi.mock("./cache-guard", () => ({
  whenCacheReadable: <T>(_empty: T, load: () => T) => load(),
}));

let dbModule: typeof DbModule;
let productivity: typeof ProductivityQueries;

const range = {
  start: new Date("2024-03-01T00:00:00Z"),
  end: new Date("2024-03-31T00:00:00Z"),
};
const inRange = Date.parse("2024-03-02T12:00:00Z");
const outOfRange = Date.parse("2024-01-15T12:00:00Z");

beforeAll(async () => {
  dbModule = await import("@/db");
  migrate(drizzle(dbModule.sqlite), { migrationsFolder: path.resolve("./drizzle") });
  dbModule.db
    .insert(dbModule.aiCodeChanges)
    .values([
      {
        change_id: "opus-alice",
        user_email: "alice@acme.test",
        model: "claude-opus-4.5",
        total_lines_added: 100,
        created_day: "2024-03-02",
        created_at: inRange,
      },
      {
        change_id: "sonnet-alice",
        user_email: "alice@acme.test",
        model: "claude-sonnet-4.5",
        total_lines_added: 50,
        created_day: "2024-03-02",
        created_at: inRange,
      },
      {
        change_id: "opus-bob",
        user_email: "bob@acme.test",
        model: "claude-opus-4.5",
        total_lines_added: 10,
        created_day: "2024-03-03",
        created_at: inRange,
      },
      {
        change_id: "tab-alice",
        user_email: "alice@acme.test",
        model: null,
        total_lines_added: 40,
        created_day: "2024-03-02",
        created_at: inRange,
      },
      {
        change_id: "old-alice",
        user_email: "alice@acme.test",
        model: "claude-opus-4.5",
        total_lines_added: 1000,
        created_day: "2024-01-15",
        created_at: outOfRange,
      },
    ])
    .run();
  dbModule.db
    .insert(dbModule.usageEvents)
    .values([
      {
        event_key: "alice-opus",
        user_email: "alice@acme.test",
        model: "claude-opus-4.5",
        charged_cents: 200,
        timestamp: inRange,
      },
      {
        event_key: "alice-sonnet",
        user_email: "alice@acme.test",
        model: "claude-sonnet-4.5",
        charged_cents: 50,
        timestamp: inRange,
      },
      {
        event_key: "bob-opus",
        user_email: "bob@acme.test",
        model: "claude-opus-4.5",
        charged_cents: 100,
        timestamp: inRange,
      },
      {
        event_key: "carol-spend",
        user_email: "carol@acme.test",
        model: "gpt-5",
        charged_cents: 80,
        timestamp: inRange,
      },
      {
        event_key: "old-spend",
        user_email: "alice@acme.test",
        model: "claude-opus-4.5",
        charged_cents: 5000,
        timestamp: outOfRange,
      },
    ])
    .run();
  productivity = await import("./productivity");
});

afterAll(() => {
  dbModule.sqlite.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("getProductivity cost per accepted line", () => {
  it("divides team spend by all accepted lines and ranks models with a recorded model", () => {
    const cost = productivity.getProductivity(range).costPerAcceptedLine;

    // 100+50+10+40 in window. Carol's 80¢ and the January rows stay out of the line total;
    // Carol's spend still counts in the team numerator.
    expect(cost.acceptedLines).toBe(200);
    expect(cost.chargedCents).toBe(430);
    expect(cost.centsPerLine).toBeCloseTo(2.15);

    expect(cost.byModel.map((row) => row.key)).toEqual([
      "claude-sonnet-4.5",
      "claude-opus-4.5",
    ]);
    expect(cost.bestModel).toBe("claude-sonnet-4.5");
    expect(cost.byModel[0]).toMatchObject({
      acceptedLines: 50,
      chargedCents: 50,
      centsPerLine: 1,
    });
    expect(cost.byModel[1]).toMatchObject({
      acceptedLines: 110,
      chargedCents: 300,
    });
    expect(cost.byModel[1]!.centsPerLine).toBeCloseTo(300 / 110);

    const alice = cost.byUser.find((row) => row.key === "alice@acme.test")!;
    expect(alice.acceptedLines).toBe(190);
    expect(alice.chargedCents).toBe(250);
    expect(alice.centsPerLine).toBeCloseTo(250 / 190);
    const bob = cost.byUser.find((row) => row.key === "bob@acme.test")!;
    expect(bob).toMatchObject({ acceptedLines: 10, chargedCents: 100, centsPerLine: 10 });
    expect(cost.byUser.map((row) => row.key)).not.toContain("carol@acme.test");
    expect(cost.byUser[0]!.key).toBe("alice@acme.test");
  });
});
