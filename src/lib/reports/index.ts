import "server-only";
import { db } from "@/db";
import type { SavedReport } from "@/db/schema";
import * as store from "./store";
import type { CreateReportInput, UpdateReportPatch } from "./store";

/**
 * Server-only entrypoint for saved conversations. Binds the pure CRUD in `./store` to the
 * shared `@/db` connection. Routes / server components import from `@/lib/reports`.
 */
export type { CreateReportInput, UpdateReportPatch } from "./store";

export function listReports(): SavedReport[] {
  return store.listReports(db);
}

export function getReport(id: string): SavedReport | undefined {
  return store.getReport(db, id);
}

export function createReport(input: CreateReportInput): SavedReport {
  return store.createReport(db, input);
}

export function updateReport(id: string, patch: UpdateReportPatch): SavedReport | undefined {
  return store.updateReport(db, id, patch);
}

export function deleteReport(id: string): boolean {
  return store.deleteReport(db, id);
}
