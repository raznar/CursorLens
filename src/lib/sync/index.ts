/**
 * Public entrypoint for the sync engine.
 *
 *   import { runSync, getSyncStatus } from "@/lib/sync";
 *   await runSync({ mode: "backfill", days: 30, trigger: "cli" });
 *
 * `runSync` orchestrates every per-data-type job (isolated, idempotent, watermarked) and
 * records `sync_runs` / `sync_run_items` / `sync_state`. See the `sync-and-rate-limits` skill.
 */
export {
  runSync,
  getSyncStatus,
  type RunSyncOptions,
  type RunStatus,
  type ItemStatus,
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
