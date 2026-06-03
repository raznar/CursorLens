import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { savedReports, type SavedReport } from "@/db/schema";

/**
 * CRUD for saved Ask-Agent reports. The functions take the Drizzle handle as their
 * first argument so the logic stays pure and unit-testable against a throwaway
 * in-memory database; `@/lib/reports` binds them to the shared `@/db` connection.
 *
 * better-sqlite3 + Drizzle is synchronous, so these return values directly (no Promises).
 */
export type ReportsDb = BetterSQLite3Database<typeof schema>;

export interface CreateReportInput {
  name: string;
  prompt: string;
  response: string;
  sql?: string | null;
}

export interface UpdateReportPatch {
  name?: string;
  prompt?: string;
  response?: string;
  /** Pass `null` to clear; omit to leave unchanged. */
  sql?: string | null;
}

/** All reports, most recently updated first. */
export function listReports(db: ReportsDb): SavedReport[] {
  return db.select().from(savedReports).orderBy(desc(savedReports.updated_at)).all();
}

/** A single report by id, or `undefined` if it doesn't exist. */
export function getReport(db: ReportsDb, id: string): SavedReport | undefined {
  return db.select().from(savedReports).where(eq(savedReports.id, id)).get();
}

/** Insert a new report with a generated id and matching timestamps. */
export function createReport(db: ReportsDb, input: CreateReportInput): SavedReport {
  const now = Date.now();
  const report: SavedReport = {
    id: randomUUID(),
    name: input.name,
    prompt: input.prompt,
    response: input.response,
    sql: input.sql ?? null,
    created_at: now,
    updated_at: now,
  };
  db.insert(savedReports).values(report).run();
  return report;
}

/** Patch an existing report; returns the updated row, or `undefined` if not found. */
export function updateReport(
  db: ReportsDb,
  id: string,
  patch: UpdateReportPatch,
): SavedReport | undefined {
  const existing = getReport(db, id);
  if (!existing) return undefined;
  const updated: SavedReport = {
    ...existing,
    name: patch.name ?? existing.name,
    prompt: patch.prompt ?? existing.prompt,
    response: patch.response ?? existing.response,
    sql: patch.sql === undefined ? existing.sql : patch.sql,
    updated_at: Date.now(),
  };
  db.update(savedReports)
    .set({
      name: updated.name,
      prompt: updated.prompt,
      response: updated.response,
      sql: updated.sql,
      updated_at: updated.updated_at,
    })
    .where(eq(savedReports.id, id))
    .run();
  return updated;
}

/** Delete a report; returns `true` when a row was removed. */
export function deleteReport(db: ReportsDb, id: string): boolean {
  return db.delete(savedReports).where(eq(savedReports.id, id)).run().changes > 0;
}
