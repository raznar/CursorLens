/**
 * Public entrypoint for the sync engine.
 *
 *   import { runSync, startSync, getSyncStatus } from "@/lib/sync";
 *   await runSync({ mode: "backfill", days: 30, trigger: "cli" });   // wait for completion
 *   const { runId } = startSync({ mode: "incremental", trigger: "cron" }); // fire and forget
 *
 * One run executes per process (`startSync` throws `BusyError` while another is active).
 * Each run orchestrates every per-data-type job (isolated, idempotent, watermarked) and
 * records `sync_runs` / `sync_run_items` / `sync_state`. See the `sync-and-rate-limits` skill.
 */
export {
  runSync,
  startSync,
  getActiveSync,
  getSyncStatus,
  reconcileInterruptedRuns,
  type RunSyncOptions,
  type RunStatus,
  type ItemStatus,
  type StartedSync,
  type ActiveSyncInfo,
  type SyncItemSummary,
  type SyncRunSummary,
  type SyncStatus,
} from "./engine";
export {
  getSyncConfig,
  setSyncConfig,
  type SyncConfig,
  SETTING_SYNC_INTERVAL_HOURS,
  SETTING_SYNC_BACKFILL_DAYS,
  DEFAULT_SYNC_INTERVAL_HOURS,
  DEFAULT_BACKFILL_DAYS,
  DEFAULT_INCREMENTAL_DAYS,
} from "./settings";
export {
  clearAllMockAndFixtureData,
  ingestedCacheReadable,
  isLiveIngestionEnabled,
  onAdminKeyConfigured,
  purgeIngestedCache,
} from "./cache-policy";
export { SYNC_JOBS, getSyncJob } from "./jobs";
export type { SyncJob, SyncMode, JobContext, JobResult } from "./jobs/types";
