/**
 * 30-day window chunking. Several endpoints (`audit-logs`, `daily-usage-data`,
 * `filtered-usage-events`, and all analytics endpoints) reject ranges longer than 30 days,
 * so longer backfills are split into contiguous, non-overlapping, day-aligned chunks.
 *
 * Pure module — no I/O.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DateWindow {
  start: Date;
  end: Date;
}

/** The API's hard cap; exported so callers/tests can reference it. */
export const MAX_WINDOW_DAYS = 30;

/**
 * Split `[start, end]` into windows that each span at most `maxDays` distinct days.
 * Windows are contiguous (next.start = prev.end + 1 day) so no day is skipped, and a 30-day
 * window covers `start .. start + (maxDays - 1) days` to stay safely within the API's limit.
 */
export function chunkWindows(start: Date, end: Date, maxDays = MAX_WINDOW_DAYS): DateWindow[] {
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  if (end.getTime() < start.getTime()) return [];

  const span = Math.max(1, maxDays) * DAY_MS;
  const windows: DateWindow[] = [];
  let cursor = start.getTime();
  const endMs = end.getTime();

  while (cursor <= endMs) {
    // Each chunk spans at most `maxDays` days (minus 1ms so contiguous chunks never overlap
    // a day boundary). For maxDays=30 this yields ≤ 30 distinct calendar days per chunk.
    const chunkEnd = Math.min(cursor + span - DAY_MS, endMs);
    windows.push({ start: new Date(cursor), end: new Date(chunkEnd) });
    cursor = chunkEnd + DAY_MS;
  }

  return windows;
}
