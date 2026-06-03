/**
 * Pure aggregation/shaping helpers shared by the dashboard query modules.
 *
 * This module is intentionally PURE: no `server-only`, no `@/db`, no UI. Everything here
 * operates on plain arrays/objects so the meaningful reshaping logic (pivoting, top-N,
 * shares, deltas) is trivially unit-testable without a database. See `transforms.test.ts`.
 */

export interface KeyValue {
  key: string;
  value: number;
}

/** Numeric row used by chart wrappers: an x label plus arbitrary numeric series columns. */
export type SeriesRow = Record<string, string | number>;

function num(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Sum a numeric projection over rows, ignoring null/NaN. */
export function sumBy<T>(rows: readonly T[], get: (row: T) => number | null | undefined): number {
  let total = 0;
  for (const row of rows) total += num(get(row));
  return total;
}

/** Group rows by a string key and sum a numeric projection per group. */
export function groupSum<T>(
  rows: readonly T[],
  getKey: (row: T) => string | null | undefined,
  getValue: (row: T) => number | null | undefined,
): KeyValue[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = getKey(row);
    if (key == null) continue;
    map.set(key, (map.get(key) ?? 0) + num(getValue(row)));
  }
  return [...map.entries()].map(([key, value]) => ({ key, value }));
}

/** Top-N items by value, descending (does not mutate the input). */
export function topN(items: readonly KeyValue[], n: number): KeyValue[] {
  return [...items].sort((a, b) => b.value - a.value).slice(0, Math.max(0, n));
}

/** Annotate each item with its share (0..1) of the total. Empty/zero totals yield share 0. */
export function withShare(items: readonly KeyValue[]): Array<KeyValue & { share: number }> {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  return items.map((item) => ({ ...item, share: total > 0 ? item.value / total : 0 }));
}

/** Fractional change vs a previous value. Returns null when the baseline is 0/invalid. */
export function computeDelta(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous === 0) return null;
  return (current - previous) / previous;
}

/** Safe ratio in [0,∞). Returns null when the denominator is 0/invalid. */
export function ratio(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(denominator) || denominator === 0) return null;
  return numerator / denominator;
}

export interface PivotOptions<T> {
  date: (row: T) => string;
  series: (row: T) => string;
  value: (row: T) => number | null | undefined;
  /** Keep only the top-N series by total; fold the rest into a single bucket. */
  limit?: number;
  otherLabel?: string;
}

/**
 * Pivot long rows `(date, series, value)` into wide, date-keyed rows with one numeric column
 * per series — the shape stacked area/bar charts expect. Returns the ordered series `keys`
 * (top-N by total, with an "Other" bucket when `limit` is exceeded) alongside the `data`.
 * Every row is zero-filled for all kept keys so stacks render without gaps.
 */
export function pivotSeries<T>(
  rows: readonly T[],
  opts: PivotOptions<T>,
): { data: SeriesRow[]; keys: string[] } {
  const { date, series, value, limit, otherLabel = "Other" } = opts;

  const totals = new Map<string, number>();
  for (const row of rows) {
    const s = series(row);
    totals.set(s, (totals.get(s) ?? 0) + num(value(row)));
  }
  let keys = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([key]) => key);
  let folded = new Set<string>();
  if (limit != null && keys.length > limit) {
    folded = new Set(keys.slice(limit));
    keys = [...keys.slice(0, limit), otherLabel];
  }

  const byDate = new Map<string, SeriesRow>();
  for (const row of rows) {
    const d = date(row);
    const rawKey = series(row);
    const key = folded.has(rawKey) ? otherLabel : rawKey;
    let target = byDate.get(d);
    if (!target) {
      target = { date: d };
      byDate.set(d, target);
    }
    target[key] = ((target[key] as number | undefined) ?? 0) + num(value(row));
  }

  const data = [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  for (const row of data) {
    for (const key of keys) {
      if (row[key] == null) row[key] = 0;
    }
  }
  return { data, keys };
}

/**
 * Merge several per-date partial-row arrays into one array keyed by date. Useful for
 * overlaying independent time series (e.g. agent edits + tabs) onto a single chart.
 */
export function mergeByDate(
  parts: ReadonlyArray<ReadonlyArray<Record<string, string | number | null | undefined>>>,
  dateKey = "date",
): SeriesRow[] {
  const byDate = new Map<string, SeriesRow>();
  for (const part of parts) {
    for (const row of part) {
      const rawDate = row[dateKey];
      if (rawDate == null) continue;
      const date = String(rawDate);
      let target = byDate.get(date);
      if (!target) {
        target = { [dateKey]: date };
        byDate.set(date, target);
      }
      for (const [key, val] of Object.entries(row)) {
        if (key === dateKey || val == null) continue;
        target[key] = val as string | number;
      }
    }
  }
  return [...byDate.values()].sort((a, b) => String(a[dateKey]).localeCompare(String(b[dateKey])));
}
