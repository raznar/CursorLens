import type { Logger } from "@/lib/logger";
import type { CursorClient, DateRange, DateWindow } from "@/lib/cursor";
import type { RateLimitGroup } from "@/lib/registry";
import type { SyncState } from "@/db/schema";

/** Whether a run extends the recent window (incremental) or re-pulls `days` of history. */
export type SyncMode = "incremental" | "backfill";

/** Everything a job needs to fetch + persist one data type for one run. */
export interface JobContext {
  client: CursorClient;
  mode: SyncMode;
  /** The resolved [start, end] window for this run. */
  range: DateRange;
  /**
   * Windows to fetch (≤ 30 days each). For windowed jobs on a non-forced backfill these are
   * only the windows not yet covered plus the trailing refresh days; see `plan.ts`.
   */
  chunks: DateWindow[];
  /** Previous `sync_state` row for this data type (watermark / etag / last run). */
  prev?: SyncState;
  /** Run start time (epoch ms), shared by all jobs in the run. */
  now: number;
  log: Logger;
  /** Persist user-visible progress for long-running jobs. */
  reportProgress(progress: JobProgress): void;
  /** Record that `window` was fully ingested (only complete UTC days are stored). */
  markCovered(window: DateWindow, info?: { etag?: string; rows?: number }): void;
  /** ETag stored for a previously covered window with identical bounds, if any. */
  etagFor(window: DateWindow): string | undefined;
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
  /**
   * True when the job iterates `ctx.chunks`. The engine plans those windows from coverage
   * and skips the job when nothing needs fetching. Snapshot jobs (members, spend) leave it off.
   */
  windowed?: boolean;
  /**
   * Bucket the job's requests draw from. Jobs sharing a bucket run sequentially in one lane;
   * different lanes run concurrently. Defaults to the registry metric's group.
   */
  rateLimitGroup?: RateLimitGroup;
  run(ctx: JobContext): Promise<JobResult>;
}
