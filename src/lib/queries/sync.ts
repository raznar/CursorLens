import "server-only";
import { desc, eq } from "drizzle-orm";
import { db, syncRuns } from "@/db";
import { isLiveIngestionEnabled } from "@/lib/sync/cache-policy";

/**
 * Subset of the badge's status union this helper can emit. Declared locally so the
 * data-access layer doesn't depend on a UI component (keeps the dependency graph one-way).
 */
export type SyncSummaryStatus = "ok" | "running" | "error" | "stale" | "never";

export interface SyncSummary {
  status: SyncSummaryStatus;
  at: number | null;
}

const RUN_STATUS_TO_BADGE: Record<string, SyncSummaryStatus> = {
  ok: "ok",
  running: "running",
  error: "error",
  partial: "stale",
};

/**
 * Latest sync run mapped to a badge status for the top bar. Defensive: if the table is
 * missing (pre-migration) or empty, reports "never" instead of throwing so the shell
 * always renders.
 */
export function getLatestSyncStatus(): SyncSummary {
  try {
    const selectRun = () =>
      db
        .select({
          status: syncRuns.status,
          started_at: syncRuns.started_at,
          finished_at: syncRuns.finished_at,
        })
        .from(syncRuns)
        .orderBy(desc(syncRuns.started_at))
        .limit(1)
        .all();

    const [run] = isLiveIngestionEnabled()
      ? db
          .select({
            status: syncRuns.status,
            started_at: syncRuns.started_at,
            finished_at: syncRuns.finished_at,
          })
          .from(syncRuns)
          .where(eq(syncRuns.mock, 0))
          .orderBy(desc(syncRuns.started_at))
          .limit(1)
          .all()
      : selectRun();
    if (!run) return { status: "never", at: null };
    return {
      status: RUN_STATUS_TO_BADGE[run.status] ?? "never",
      at: run.finished_at ?? run.started_at ?? null,
    };
  } catch {
    return { status: "never", at: null };
  }
}
