import type { Logger } from "@/lib/logger";
import type { CursorClient, DateRange, DateWindow } from "@/lib/cursor";
import type { SyncState } from "@/db/schema";

/** Whether a run extends the recent window (incremental) or re-pulls `days` of history. */
export type SyncMode = "incremental" | "backfill";

/** Everything a job needs to fetch + persist one data type for one run. */
export interface JobContext {
  client: CursorClient;
  mode: SyncMode;
  /** The resolved [start, end] window for this run. */
  range: DateRange;
  /** `range` split into ≤ 30-day chunks (date-windowed endpoints iterate these). */
  chunks: DateWindow[];
  /** Previous `sync_state` row for this data type (watermark / etag / last run). */
  prev?: SyncState;
  /** Run start time (epoch ms), shared by all jobs in the run. */
  now: number;
  log: Logger;
  /** Persist user-visible progress for long-running jobs. */
  reportProgress(progress: JobProgress): void;
}

export interface JobProgress {
  /** Cumulative rows written so far. */
  rows?: number;
  /** Completed progress units, usually completed API windows/chunks. */
  current?: number;
  /** Total progress units, usually total API windows/chunks. */
  total?: number;
  /** Short user-visible detail about the current fetch/insert step. */
  message?: string;
}

export interface JobResult {
  /** Number of rows upserted. */
  rows: number;
  /** New watermark (max date/timestamp ingested), persisted to `sync_state`. */
  watermark?: string;
  /** ETag to persist for the next `If-None-Match`. */
  etag?: string;
  /** All requests returned 304 Not Modified — nothing changed upstream. */
  notModified?: boolean;
}

/** A single isolated, idempotent ingestion unit for one Cursor data type. */
export interface SyncJob {
  /** Stable id, e.g. "daily-usage", "models", "by-user/models". Matches `sync_state.data_type`. */
  dataType: string;
  /** Registry metric id this job ingests. */
  metricId: string;
  label: string;
  /** Enterprise-only endpoints surface 401/403 gracefully (recorded, never abort the run). */
  enterpriseOnly?: boolean;
  /** Hourly-aggregated endpoints (`daily-usage`, `usage-events`): polled ≤ once/hour. */
  hourlyPoll?: boolean;
  run(ctx: JobContext): Promise<JobResult>;
}
