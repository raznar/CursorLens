/**
 * 30-day window chunking. Several endpoints (`audit-logs`, `daily-usage-data`,
 * `filtered-usage-events`, and all analytics endpoints) reject ranges longer than 30 days,
 * so longer backfills are split into contiguous, non-overlapping, day-aligned chunks.
 *
 * Both bounds are inclusive. `start` is 00:00:00.000 UTC of the window's first day and `end`
 * is 23:59:59.999 UTC of its last day (capped at the requested range end), so endpoints that
 * compare timestamps at millisecond precision (`filtered-usage-events`, `audit-logs`) see no
 * gap between consecutive windows. Day-granular endpoints only read the calendar date.
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

/** 00:00:00.000 UTC of the day containing `ms`. */
export function startOfUtcDay(ms: number): number {
  return Math.floor(ms / DAY_MS) * DAY_MS;
}

/** 23:59:59.999 UTC of the day containing `ms`. */
export function endOfUtcDay(ms: number): number {
  return startOfUtcDay(ms) + DAY_MS - 1;
}

/**
 * Split `[start, end]` into day-aligned windows that each span at most `maxDays` calendar
 * days. Windows are contiguous at millisecond precision (next.start = prev.end + 1 ms) so
 * no instant is skipped or fetched twice; the last window ends at `end` itself.
 */
export function chunkWindows(start: Date, end: Date, maxDays = MAX_WINDOW_DAYS): DateWindow[] {
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  if (end.getTime() < start.getTime()) return [];

  const span = Math.max(1, maxDays) * DAY_MS;
  const windows: DateWindow[] = [];
  let cursor = startOfUtcDay(start.getTime());
  const endMs = end.getTime();

  while (cursor <= endMs) {
    const chunkEnd = Math.min(cursor + span - 1, endMs);
    windows.push({ start: new Date(cursor), end: new Date(chunkEnd) });
    cursor = chunkEnd + 1;
  }

  return windows;
}
