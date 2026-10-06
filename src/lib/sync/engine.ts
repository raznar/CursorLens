import "server-only";
import { and, desc, eq } from "drizzle-orm";
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
import { BusyError, toAppError } from "@/lib/errors";
import { getAdminApiKey } from "@/lib/keys";
import { logger, type Logger } from "@/lib/logger";
import { chunkWindows, createCursorClient, type CursorClient, type DateWindow } from "@/lib/cursor";
import { ensureLiveCacheBaseline, markLiveCacheReady, shouldSkipHourlyPoll } from "./cache-policy";
import { SYNC_JOBS } from "./jobs";
import type { JobContext, JobProgress, SyncJob, SyncMode } from "./jobs/types";
import { DEFAULT_INCREMENTAL_DAYS, getSyncConfig } from "./settings";

const DAY_MS = 24 * 60 * 60 * 1000;
const INTERRUPTED_MESSAGE = "Interrupted: the server stopped before this job finished";

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

/** Handle for a run that has been started and is executing in the background. */
export interface StartedSync {
  runId: number;
  mode: SyncMode;
  trigger: string;
  startedAt: number;
  /** Resolves with the run summary; never rejects (engine failures are folded in). */
  promise: Promise<SyncRunSummary>;
}

export interface ActiveSyncInfo {
  runId: number;
  mode: SyncMode;
  trigger: string;
  startedAt: number;
}

interface StateUpdate {
  status: ItemStatus;
  watermark?: string | null;
  etag?: string | null;
  error: string | null;
  runId: number;
  syncedAt: number;
}

/**
 * The single in-process run. Kept on `globalThis` so Next.js module duplication (dev HMR,
 * separate route bundles) and the cron scheduler all observe the same lock.
 */
const globalForSync = globalThis as typeof globalThis & { __cursorLensActiveSync?: StartedSync };

/** The run currently executing in this process, if any. */
export function getActiveSync(): ActiveSyncInfo | null {
  const active = globalForSync.__cursorLensActiveSync;
  if (!active) return null;
  const { runId, mode, trigger, startedAt } = active;
  return { runId, mode, trigger, startedAt };
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

function runStatusFor(items: Array<{ status: string }>): RunStatus {
  const errorCount = items.filter((i) => i.status === "error").length;
  const okCount = items.length - errorCount;
  return errorCount === 0 ? "ok" : okCount === 0 ? "error" : "partial";
}

/**
 * Close out `sync_runs` rows still marked `running` that no live process owns. Runs execute
 * in-process, so with no active lock every `running` row belongs to a process that stopped
 * (restart, crash, deploy). Their unfinished items/state become errors so the UI stops
 * showing a phantom in-progress run. Safe to call at boot and before each new run.
 */
export function reconcileInterruptedRuns(now = Date.now()): number {
  if (globalForSync.__cursorLensActiveSync) return 0;
  const stale = db.select().from(syncRuns).where(eq(syncRuns.status, "running")).all();
  for (const run of stale) {
    db.update(syncRunItems)
      .set({ status: "error", error: INTERRUPTED_MESSAGE })
      .where(and(eq(syncRunItems.run_id, run.id), eq(syncRunItems.status, "running")))
      .run();
    const items = db.select().from(syncRunItems).where(eq(syncRunItems.run_id, run.id)).all();
    const status: RunStatus = items.length === 0 ? "error" : runStatusFor(items);
    db.update(syncRuns)
      .set({
        status,
        finished_at: now,
        summary: JSON.stringify({ runId: run.id, status, interrupted: true }),
      })
      .where(eq(syncRuns.id, run.id))
      .run();
  }
  if (stale.length > 0) {
    db.update(syncState)
      .set({ status: "error", last_error: INTERRUPTED_MESSAGE })
      .where(eq(syncState.status, "running"))
      .run();
    logger.child({ module: "sync" }).warn({ runs: stale.length }, "closed interrupted sync runs");
  }
  return stale.length;
}

interface RunPlan {
  runId: number;
  mode: SyncMode;
  trigger: string;
  startedAt: number;
  range: { start: Date; end: Date };
  chunks: DateWindow[];
  client: CursorClient;
  useMock: boolean;
  jobs: SyncJob[];
}

/**
 * Start a sync in the background and return immediately with its run id. Exactly one run
 * executes per process: a second call while one is active throws `BusyError` (callers such
 * as the cron skip; the API route answers 409). The returned `promise` never rejects.
 */
export function startSync(options: RunSyncOptions = {}): StartedSync {
  const active = globalForSync.__cursorLensActiveSync;
  if (active) {
    throw new BusyError(`A ${active.mode} sync (run #${active.runId}) is already running`, {
      context: { runId: active.runId, mode: active.mode, trigger: active.trigger },
    });
  }
  reconcileInterruptedRuns();

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

  const plan: RunPlan = { runId, mode, trigger, startedAt, range, chunks, client, useMock, jobs };
  // Nothing before the first `await` inside executeRun reads the lock, so setting it right
  // after creating the promise is race-free within this tick.
  const promise = executeRun(plan).finally(() => {
    if (globalForSync.__cursorLensActiveSync?.runId === runId) {
      globalForSync.__cursorLensActiveSync = undefined;
    }
  });
  const started: StartedSync = { runId, mode, trigger, startedAt, promise };
  globalForSync.__cursorLensActiveSync = started;
  return started;
}

/**
 * Run a sync to completion. Resolves the admin key (mock mode when absent or
 * `CURSOR_MOCK=1`), then runs every job in isolation: one failure is recorded and never
 * aborts the others. Per-job results land in `sync_run_items` and the watermark/etag/status
 * update `sync_state`; the overall result is summarized into `sync_runs`.
 */
export function runSync(options: RunSyncOptions = {}): Promise<SyncRunSummary> {
  return startSync(options).promise;
}

async function executeRun(plan: RunPlan): Promise<SyncRunSummary> {
  const { runId, mode, trigger, startedAt, useMock, jobs } = plan;
  const log = logger.child({ module: "sync", mode, trigger, runId });
  log.info({ jobs: jobs.length, chunks: plan.chunks.length, mock: useMock }, "sync run started");

  const items: SyncItemSummary[] = [];
  try {
    for (const job of jobs) {
      items.push(await runJob(plan, job, log));
    }
  } catch (err) {
    // Jobs are individually isolated; reaching here means the engine itself failed.
    const appError = toAppError(err);
    log.error({ err: appError.message, kind: appError.kind }, "sync run aborted");
    items.push({
      dataType: "engine",
      label: "Sync engine",
      status: "error",
      rows: 0,
      durationMs: Date.now() - startedAt,
      error: appError.message,
    });
  }

  const finishedAt = Date.now();
  const status = runStatusFor(items);
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

  try {
    db.update(syncRuns)
      .set({ finished_at: finishedAt, status, summary: JSON.stringify(summary) })
      .where(eq(syncRuns.id, runId))
      .run();
    if (!useMock) markLiveCacheReady();
  } catch (err) {
    log.error({ err: String(err) }, "failed to finalize sync run");
  }

  log.info({ status, totalRows, durationMs: summary.durationMs }, "sync run complete");
  return summary;
}

/** Run one job in isolation, persisting progress, result, and `sync_state`. Never throws. */
async function runJob(plan: RunPlan, job: SyncJob, log: Logger): Promise<SyncItemSummary> {
  const { runId, mode, startedAt } = plan;
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
    recordRunItem(runId, item);
    writeState(job, {
      status: "skipped",
      watermark: prev?.watermark ?? null,
      etag: prev?.etag ?? null,
      error: null,
      runId,
      syncedAt: prev?.last_synced_at ?? startedAt,
    });
    return item;
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
      client: plan.client,
      mode,
      range: plan.range,
      chunks: plan.chunks,
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
    recordRunItem(runId, item);
    writeState(job, {
      status: "ok",
      watermark: result.watermark ?? prev?.watermark ?? null,
      etag: result.etag ?? prev?.etag ?? null,
      error: null,
      runId,
      syncedAt: startedAt,
    });
    return item;
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
    return item;
  }
}

export interface SyncStatus {
  state: SyncState[];
  latestRun?: SyncRun;
  latestItems: SyncRunItem[];
  recentRuns: SyncRun[];
  /** The run executing in this process right now, if any. */
  active: ActiveSyncInfo | null;
}

/** Snapshot of sync bookkeeping for the API route + Settings page. */
export function getSyncStatus(): SyncStatus {
  const state = db.select().from(syncState).all();
  const recentRuns = db.select().from(syncRuns).orderBy(desc(syncRuns.id)).limit(10).all();
  const latestRun = recentRuns[0];
  const latestItems = latestRun
    ? db.select().from(syncRunItems).where(eq(syncRunItems.run_id, latestRun.id)).all()
    : [];
  return { state, latestRun, latestItems, recentRuns, active: getActiveSync() };
}
