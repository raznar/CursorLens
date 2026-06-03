import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  syncRunItems,
  syncRuns,
  syncState,
  type SyncRun,
  type SyncRunItem,
  type SyncState,
} from "@/db/schema";
import { config } from "@/lib/config";
import { toAppError } from "@/lib/errors";
import { getAdminApiKey } from "@/lib/keys";
import { logger } from "@/lib/logger";
import { chunkWindows, createCursorClient } from "@/lib/cursor";
import { ensureLiveCacheBaseline, markLiveCacheReady, shouldSkipHourlyPoll } from "./cache-policy";
import { SYNC_JOBS } from "./jobs";
import type { JobContext, JobProgress, SyncJob, SyncMode } from "./jobs/types";
import { DEFAULT_INCREMENTAL_DAYS, getSyncConfig } from "./settings";

const DAY_MS = 24 * 60 * 60 * 1000;

export type RunStatus = "ok" | "error" | "partial";
export type ItemStatus = "running" | "ok" | "error" | "skipped";

export interface RunSyncOptions {
  /** "incremental" (default) re-pulls a trailing window; "backfill" re-pulls `days`. */
  mode?: SyncMode;
  /** Backfill window in days (defaults to the configured backfill window). */
  days?: number;
  /** Audit label for the run ("cron" | "manual" | "cli" | "backfill"). */
  trigger?: string;
  /** Restrict to a subset of data types (defaults to all jobs). */
  only?: string[];
}

export interface SyncItemSummary {
  dataType: string;
  label: string;
  status: ItemStatus;
  rows: number;
  durationMs: number;
  error?: string;
  notModified?: boolean;
  progressCurrent?: number;
  progressTotal?: number;
  progressMessage?: string;
}

export interface SyncRunSummary {
  runId: number;
  trigger: string;
  mode: SyncMode;
  status: RunStatus;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  totalRows: number;
  mock: boolean;
  items: SyncItemSummary[];
}

interface StateUpdate {
  status: ItemStatus;
  watermark?: string | null;
  etag?: string | null;
  error: string | null;
  runId: number;
  syncedAt: number;
}

function recordRunItem(runId: number, item: SyncItemSummary): void {
  db.insert(syncRunItems)
    .values({
      run_id: runId,
      data_type: item.dataType,
      status: item.status,
      rows: item.rows,
      duration_ms: item.durationMs,
      error: item.error ?? null,
      progress_current: item.progressCurrent ?? null,
      progress_total: item.progressTotal ?? null,
      progress_message: item.progressMessage ?? null,
    })
    .onConflictDoUpdate({
      target: [syncRunItems.run_id, syncRunItems.data_type],
      set: {
        status: item.status,
        rows: item.rows,
        duration_ms: item.durationMs,
        error: item.error ?? null,
        progress_current: item.progressCurrent ?? null,
        progress_total: item.progressTotal ?? null,
        progress_message: item.progressMessage ?? null,
      },
    })
    .run();
}

function writeState(job: SyncJob, update: StateUpdate): void {
  const values = {
    data_type: job.dataType,
    last_synced_at: update.syncedAt,
    watermark: update.watermark ?? null,
    etag: update.etag ?? null,
    status: update.status,
    last_error: update.error,
    last_run_id: update.runId,
  };
  db.insert(syncState)
    .values(values)
    .onConflictDoUpdate({
      target: syncState.data_type,
      set: {
        last_synced_at: values.last_synced_at,
        watermark: values.watermark,
        etag: values.etag,
        status: values.status,
        last_error: values.last_error,
        last_run_id: values.last_run_id,
      },
    })
    .run();
}

/**
 * Run a sync. Resolves the admin key (mock mode when absent or `CURSOR_MOCK=1`), then runs
 * every job in isolation: one failure is recorded and never aborts the others. Per-job
 * results land in `sync_run_items` and the watermark/etag/status update `sync_state`; the
 * overall result is summarized into `sync_runs`.
 */
export async function runSync(options: RunSyncOptions = {}): Promise<SyncRunSummary> {
  const mode: SyncMode = options.mode ?? "incremental";
  const trigger = options.trigger ?? (mode === "backfill" ? "backfill" : "manual");
  const startedAt = Date.now();
  const cfg = getSyncConfig();
  const lookbackDays =
    mode === "backfill" ? (options.days ?? cfg.backfillDays) : DEFAULT_INCREMENTAL_DAYS;
  const range = { start: new Date(startedAt - lookbackDays * DAY_MS), end: new Date(startedAt) };
  const chunks = chunkWindows(range.start, range.end);

  const adminKey = getAdminApiKey();
  // Fixtures only when explicitly offline (CURSOR_MOCK=1) and no admin key — never when a key exists.
  const useMock = !adminKey && config.mock;
  if (!useMock) ensureLiveCacheBaseline();
  const client = createCursorClient({ apiKey: adminKey, mock: useMock });
  const log = logger.child({ module: "sync", mode, trigger });

  const runId = db
    .insert(syncRuns)
    .values({
      started_at: startedAt,
      trigger,
      status: "running",
      mock: useMock ? 1 : 0,
      summary: null,
    })
    .returning({ id: syncRuns.id })
    .get().id;

  const jobs = options.only?.length
    ? SYNC_JOBS.filter((job) => options.only!.includes(job.dataType))
    : SYNC_JOBS;

  log.info(
    { runId, jobs: jobs.length, lookbackDays, chunks: chunks.length, mock: useMock },
    "sync run started",
  );

  const items: SyncItemSummary[] = [];

  for (const job of jobs) {
    const prev: SyncState | undefined = db
      .select()
      .from(syncState)
      .where(eq(syncState.data_type, job.dataType))
      .get();

    // Hourly poll guard: skip hourly-aggregated endpoints if synced within the last hour
    // from the live API (mock runs do not count). Backfills bypass the guard.
    if (job.hourlyPoll && mode === "incremental" && shouldSkipHourlyPoll(job.dataType, startedAt)) {
      const item: SyncItemSummary = {
        dataType: job.dataType,
        label: job.label,
        status: "skipped",
        rows: 0,
        durationMs: 0,
      };
      items.push(item);
      recordRunItem(runId, item);
      writeState(job, {
        status: "skipped",
        watermark: prev?.watermark ?? null,
        etag: prev?.etag ?? null,
        error: null,
        runId,
        syncedAt: prev?.last_synced_at ?? startedAt,
      });
      continue;
    }

    const jobStarted = Date.now();
    let progressRows = 0;
    let progressCurrent: number | undefined;
    let progressTotal: number | undefined;
    let progressMessage: string | undefined;
    const recordProgress = (progress: JobProgress) => {
      progressRows = progress.rows ?? progressRows;
      progressCurrent = progress.current ?? progressCurrent;
      progressTotal = progress.total ?? progressTotal;
      progressMessage = progress.message ?? progressMessage;
      recordRunItem(runId, {
        dataType: job.dataType,
        label: job.label,
        status: "running",
        rows: progressRows,
        durationMs: Date.now() - jobStarted,
        progressCurrent,
        progressTotal,
        progressMessage,
      });
    };
    try {
      recordProgress({ rows: 0, current: 0, total: 1, message: `Starting ${job.label}` });
      writeState(job, {
        status: "running",
        watermark: prev?.watermark ?? null,
        etag: prev?.etag ?? null,
        error: null,
        runId,
        syncedAt: startedAt,
      });
      const ctx: JobContext = {
        client,
        mode,
        range,
        chunks,
        prev,
        now: startedAt,
        log: log.child({ dataType: job.dataType }),
        reportProgress: recordProgress,
      };
      const result = await job.run(ctx);
      const item: SyncItemSummary = {
        dataType: job.dataType,
        label: job.label,
        status: "ok",
        rows: result.rows,
        durationMs: Date.now() - jobStarted,
        notModified: result.notModified,
        progressCurrent: progressTotal ?? progressCurrent,
        progressTotal,
        progressMessage: result.notModified
          ? `${job.label} was not modified upstream`
          : `${result.rows.toLocaleString()} rows written`,
      };
      items.push(item);
      recordRunItem(runId, item);
      writeState(job, {
        status: "ok",
        watermark: result.watermark ?? prev?.watermark ?? null,
        etag: result.etag ?? prev?.etag ?? null,
        error: null,
        runId,
        syncedAt: startedAt,
      });
    } catch (err) {
      const appError = toAppError(err);
      const item: SyncItemSummary = {
        dataType: job.dataType,
        label: job.label,
        status: "error",
        rows: progressRows,
        durationMs: Date.now() - jobStarted,
        error: appError.message,
        progressCurrent,
        progressTotal,
        progressMessage,
      };
      items.push(item);
      recordRunItem(runId, item);
      writeState(job, {
        status: "error",
        watermark: prev?.watermark ?? null,
        etag: prev?.etag ?? null,
        error: appError.message,
        runId,
        syncedAt: startedAt,
      });
      log.warn(
        {
          dataType: job.dataType,
          kind: appError.kind,
          status: appError.status,
          err: appError.message,
        },
        "sync job failed (isolated)",
      );
    }
  }

  const finishedAt = Date.now();
  const errorCount = items.filter((i) => i.status === "error").length;
  const okCount = items.length - errorCount;
  const status: RunStatus = errorCount === 0 ? "ok" : okCount === 0 ? "error" : "partial";
  const totalRows = items.reduce((sum, i) => sum + i.rows, 0);

  const summary: SyncRunSummary = {
    runId,
    trigger,
    mode,
    status,
    startedAt,
    finishedAt,
    durationMs: finishedAt - startedAt,
    totalRows,
    mock: useMock,
    items,
  };

  db.update(syncRuns)
    .set({ finished_at: finishedAt, status, summary: JSON.stringify(summary) })
    .where(eq(syncRuns.id, runId))
    .run();

  if (!useMock) markLiveCacheReady();

  log.info({ runId, status, totalRows, durationMs: summary.durationMs }, "sync run complete");
  return summary;
}

export interface SyncStatus {
  state: SyncState[];
  latestRun?: SyncRun;
  latestItems: SyncRunItem[];
  recentRuns: SyncRun[];
}

/** Snapshot of sync bookkeeping for the API route + Settings page. */
export function getSyncStatus(): SyncStatus {
  const state = db.select().from(syncState).all();
  const recentRuns = db.select().from(syncRuns).orderBy(desc(syncRuns.id)).limit(10).all();
  const latestRun = recentRuns[0];
  const latestItems = latestRun
    ? db.select().from(syncRunItems).where(eq(syncRunItems.run_id, latestRun.id)).all()
    : [];
  return { state, latestRun, latestItems, recentRuns };
}
