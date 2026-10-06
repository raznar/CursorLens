/**
 * Window planning for windowed sync jobs. Pure functions over the run range and the data
 * type's recorded coverage (`sync_coverage`), so backfills fetch only what is missing and a
 * crashed backfill resumes where it stopped. No I/O — the engine supplies coverage rows.
 */
import { chunkWindows, endOfUtcDay, startOfUtcDay, type DateWindow } from "@/lib/cursor";

const DAY_MS = 24 * 60 * 60 * 1000;

/** A previously ingested window, as stored in `sync_coverage` (day strings, inclusive). */
export interface CoveredWindow {
  window_start: string;
  window_end: string;
  etag?: string | null;
}

export interface PlanInput {
  range: { start: Date; end: Date };
  /** Run start (epoch ms); days at or after `now - refreshDays` are always re-fetched. */
  now: number;
  /** Trailing days re-pulled regardless of coverage (late-arriving / hourly-aggregated data). */
  refreshDays: number;
  covered: CoveredWindow[];
  /** Ignore coverage and re-pull the whole range. */
  force?: boolean;
}

/** "YYYY-MM-DD" (UTC) for an epoch-ms instant. */
export function dayKey(ms: number): string {
  return new Date(startOfUtcDay(ms)).toISOString().slice(0, 10);
}

function dayMs(key: string): number {
  return Date.parse(`${key}T00:00:00.000Z`);
}

/** Every UTC day touched by any covered window. */
export function coveredDayKeys(covered: CoveredWindow[]): Set<string> {
  const keys = new Set<string>();
  for (const c of covered) {
    const start = dayMs(c.window_start);
    const end = dayMs(c.window_end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    for (let ms = start; ms <= end; ms += DAY_MS) keys.add(dayKey(ms));
  }
  return keys;
}

/**
 * Windows a job should fetch for this run: the full range when forcing or when nothing is
 * covered; otherwise only days that are uncovered or inside the trailing refresh window,
 * grouped into contiguous day runs and re-chunked to ≤30 days.
 */
export function planWindows(input: PlanInput): DateWindow[] {
  const { range, now, refreshDays, covered, force } = input;
  if (range.end.getTime() < range.start.getTime()) return [];
  if (force || covered.length === 0) return chunkWindows(range.start, range.end);

  const coveredDays = coveredDayKeys(covered);
  const refreshFrom = startOfUtcDay(now - refreshDays * DAY_MS);
  const firstDay = startOfUtcDay(range.start.getTime());
  const lastDay = startOfUtcDay(range.end.getTime());

  const windows: DateWindow[] = [];
  let runStart: number | null = null;
  let runLast: number | null = null;
  const flush = () => {
    if (runStart === null || runLast === null) return;
    const end = Math.min(endOfUtcDay(runLast), range.end.getTime());
    windows.push(...chunkWindows(new Date(runStart), new Date(end)));
    runStart = runLast = null;
  };

  for (let ms = firstDay; ms <= lastDay; ms += DAY_MS) {
    const needed = ms >= refreshFrom || !coveredDays.has(dayKey(ms));
    if (!needed) {
      flush();
      continue;
    }
    if (runStart === null) runStart = ms;
    runLast = ms;
  }
  flush();
  return windows;
}

/**
 * The day bounds to record as covered after `window` was fully ingested at `now`. The
 * current UTC day is never recorded (its data is still arriving); returns `null` when the
 * window holds no complete day.
 */
export function coverageBounds(
  window: DateWindow,
  now: number,
): { window_start: string; window_end: string } | null {
  const lastCompleteDay = startOfUtcDay(now) - 1;
  const end = Math.min(window.end.getTime(), lastCompleteDay);
  const start = startOfUtcDay(window.start.getTime());
  if (end < start) return null;
  return { window_start: dayKey(start), window_end: dayKey(end) };
}

/** ETag previously stored for a window with identical complete-day bounds, if any. */
export function etagForWindow(
  covered: CoveredWindow[],
  window: DateWindow,
  now: number,
): string | undefined {
  const bounds = coverageBounds(window, now);
  if (!bounds) return undefined;
  const match = covered.find(
    (c) => c.window_start === bounds.window_start && c.window_end === bounds.window_end,
  );
  return match?.etag ?? undefined;
}
