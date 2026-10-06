import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { syncCoverage, type SyncCoverage } from "@/db/schema";
import type { DateWindow } from "@/lib/cursor";
import { coverageBounds } from "./plan";

/** Coverage rows for one data type (what `planWindows` consumes). */
export function getCoverage(dataType: string): SyncCoverage[] {
  return db.select().from(syncCoverage).where(eq(syncCoverage.data_type, dataType)).all();
}

/**
 * Record that `window` was fully ingested for `dataType`. Only complete UTC days are
 * stored; a window entirely inside the current day records nothing. Returns the stored
 * bounds (or `null`).
 */
export function recordCoverage(
  dataType: string,
  window: DateWindow,
  info: { now: number; runId?: number; etag?: string; rows?: number },
): { window_start: string; window_end: string } | null {
  const bounds = coverageBounds(window, info.now);
  if (!bounds) return null;
  const values = {
    data_type: dataType,
    window_start: bounds.window_start,
    window_end: bounds.window_end,
    etag: info.etag ?? null,
    rows: info.rows ?? null,
    synced_at: info.now,
    run_id: info.runId ?? null,
  };
  db.insert(syncCoverage)
    .values(values)
    .onConflictDoUpdate({
      target: [syncCoverage.data_type, syncCoverage.window_start, syncCoverage.window_end],
      set: {
        etag: values.etag,
        rows: values.rows,
        synced_at: values.synced_at,
        run_id: values.run_id,
      },
    })
    .run();
  return bounds;
}

/** Forget coverage for one data type (or all when omitted); the next backfill re-pulls. */
export function clearCoverage(dataType?: string): void {
  if (dataType) db.delete(syncCoverage).where(eq(syncCoverage.data_type, dataType)).run();
  else db.delete(syncCoverage).run();
}
