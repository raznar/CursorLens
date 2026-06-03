import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import {
  createReport,
  deleteReport,
  getReport,
  listReports,
  updateReport,
  type ReportsDb,
} from "./store";

/** Mirrors the checked-in migration DDL for `saved_reports`. */
const SAVED_REPORTS_DDL = `
  CREATE TABLE saved_reports (
    id text PRIMARY KEY NOT NULL,
    name text NOT NULL,
    prompt text NOT NULL,
    response text NOT NULL DEFAULT '',
    sql text,
    created_at integer NOT NULL,
    updated_at integer NOT NULL
  );
`;

function makeDb(): { db: ReportsDb; close: () => void } {
  const sqlite = new Database(":memory:");
  sqlite.exec(SAVED_REPORTS_DDL);
  return { db: drizzle(sqlite, { schema }), close: () => sqlite.close() };
}

describe("saved-reports store", () => {
  let db: ReportsDb;
  let close: () => void;

  beforeEach(() => {
    ({ db, close } = makeDb());
  });

  afterEach(() => {
    close();
    vi.useRealTimers();
  });

  it("creates a report with a generated id and matching timestamps", () => {
    const report = createReport(db, {
      name: "Opus users",
      prompt: "who used opus?",
      response: "Two users used Opus.",
    });
    expect(report.id).toBeTruthy();
    expect(report.name).toBe("Opus users");
    expect(report.prompt).toBe("who used opus?");
    expect(report.response).toBe("Two users used Opus.");
    expect(report.sql).toBeNull();
    expect(report.created_at).toBe(report.updated_at);

    const fetched = getReport(db, report.id);
    expect(fetched).toEqual(report);
  });

  it("persists optional SQL when provided", () => {
    const report = createReport(db, {
      name: "Top spenders",
      prompt: "top spenders",
      response: "Here are the top spenders.",
      sql: "SELECT email FROM spend",
    });
    expect(getReport(db, report.id)?.sql).toBe("SELECT email FROM spend");
  });

  it("lists reports most-recently-updated first", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const first = createReport(db, { name: "first", prompt: "a", response: "answer a" });
    vi.setSystemTime(2_000);
    const second = createReport(db, { name: "second", prompt: "b", response: "answer b" });

    const ids = listReports(db).map((r) => r.id);
    expect(ids).toEqual([second.id, first.id]);

    // Touching the first report bumps it to the top.
    vi.setSystemTime(3_000);
    updateReport(db, first.id, { name: "first (edited)" });
    expect(listReports(db).map((r) => r.id)).toEqual([first.id, second.id]);
  });

  it("updates only the provided fields and bumps updated_at", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const report = createReport(db, {
      name: "name",
      prompt: "prompt",
      response: "response",
      sql: "SELECT 1",
    });

    vi.setSystemTime(5_000);
    const updated = updateReport(db, report.id, {
      name: "renamed",
      response: "updated response",
    });
    expect(updated?.name).toBe("renamed");
    expect(updated?.prompt).toBe("prompt"); // unchanged
    expect(updated?.response).toBe("updated response");
    expect(updated?.sql).toBe("SELECT 1"); // unchanged (omitted)
    expect(updated?.created_at).toBe(1_000);
    expect(updated?.updated_at).toBe(5_000);
  });

  it("clears sql when explicitly set to null", () => {
    const report = createReport(db, {
      name: "n",
      prompt: "p",
      response: "r",
      sql: "SELECT 1",
    });
    const updated = updateReport(db, report.id, { sql: null });
    expect(updated?.sql).toBeNull();
    expect(getReport(db, report.id)?.sql).toBeNull();
  });

  it("returns undefined when updating a missing report", () => {
    expect(updateReport(db, "nope", { name: "x" })).toBeUndefined();
  });

  it("deletes a report and reports whether a row was removed", () => {
    const report = createReport(db, { name: "n", prompt: "p", response: "r" });
    expect(deleteReport(db, report.id)).toBe(true);
    expect(getReport(db, report.id)).toBeUndefined();
    expect(listReports(db)).toHaveLength(0);
    // Deleting again is a no-op.
    expect(deleteReport(db, report.id)).toBe(false);
  });
});
