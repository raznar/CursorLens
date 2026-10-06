import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type * as DbModule from "@/db";
import type * as EngineModule from "./engine";

/**
 * Engine integration test against a throwaway SQLite file in mock mode (bundled fixtures,
 * no network). Env must be stubbed before the engine (and its config) is imported.
 */
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-lens-engine-"));
vi.stubEnv("DATA_DIR", dataDir);
vi.stubEnv("CURSOR_MOCK", "1");
vi.stubEnv("LOG_LEVEL", "silent");

let engine: typeof EngineModule;
let dbModule: typeof DbModule;

beforeAll(async () => {
  dbModule = await import("@/db");
  migrate(drizzle(dbModule.sqlite), { migrationsFolder: path.resolve("./drizzle") });
  engine = await import("./engine");
});

afterAll(() => {
  dbModule.sqlite.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("startSync single-flight lock", () => {
  it("rejects a second start while a run is active, then releases the lock", async () => {
    const first = engine.startSync({ mode: "incremental", only: ["team-members"] });
    expect(engine.getActiveSync()?.runId).toBe(first.runId);

    expect(() => engine.startSync({ mode: "incremental", only: ["team-members"] })).toThrowError(
      /already running/,
    );

    const summary = await first.promise;
    expect(summary.runId).toBe(first.runId);
    expect(summary.status).toBe("ok");
    expect(summary.mock).toBe(true);
    expect(engine.getActiveSync()).toBeNull();

    const second = engine.startSync({ mode: "incremental", only: ["team-members"] });
    expect(second.runId).toBeGreaterThan(first.runId);
    await second.promise;
  });

  it("runSync awaits the same run that startSync would create", async () => {
    const summary = await engine.runSync({ mode: "incremental", only: ["spend"] });
    expect(summary.items.map((i) => i.dataType)).toEqual(["spend"]);
    expect(summary.items[0]!.status).toBe("ok");
    expect(engine.getActiveSync()).toBeNull();
  });
});

describe("reconcileInterruptedRuns", () => {
  it("closes running runs left behind by a previous process", () => {
    const { db, syncRuns, syncRunItems, syncState } = dbModule;
    const runId = db
      .insert(syncRuns)
      .values({ started_at: Date.now() - 60_000, trigger: "backfill", status: "running", mock: 1 })
      .returning({ id: syncRuns.id })
      .get().id;
    db.insert(syncRunItems)
      .values([
        { run_id: runId, data_type: "team-members", status: "ok", rows: 3, duration_ms: 10 },
        { run_id: runId, data_type: "usage-events", status: "running", rows: 100, duration_ms: 99 },
      ])
      .run();
    db.insert(syncState)
      .values({ data_type: "usage-events", last_synced_at: Date.now(), status: "running" })
      .onConflictDoUpdate({ target: syncState.data_type, set: { status: "running" } })
      .run();

    expect(engine.reconcileInterruptedRuns()).toBe(1);

    const run = db
      .select()
      .from(syncRuns)
      .all()
      .find((r) => r.id === runId)!;
    expect(run.status).toBe("partial");
    expect(run.finished_at).not.toBeNull();
    const items = db
      .select()
      .from(syncRunItems)
      .all()
      .filter((i) => i.run_id === runId);
    expect(items.find((i) => i.data_type === "usage-events")).toMatchObject({
      status: "error",
      error: expect.stringContaining("Interrupted"),
    });
    expect(items.find((i) => i.data_type === "team-members")?.status).toBe("ok");
    const state = db
      .select()
      .from(syncState)
      .all()
      .find((s) => s.data_type === "usage-events");
    expect(state?.status).toBe("error");
  });

  it("is a no-op while a run is active in this process", async () => {
    const run = engine.startSync({ mode: "incremental", only: ["team-members"] });
    expect(engine.reconcileInterruptedRuns()).toBe(0);
    await run.promise;
  });
});
