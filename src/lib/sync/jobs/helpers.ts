/**
 * Small transform helpers shared by the sync jobs: timestamp coercion and watermark
 * computation. Pure functions, no I/O.
 */

/** Coerce an API timestamp (epoch-ms number, numeric string, or ISO string) to epoch ms. */
export function parseTimestamp(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (/^\d+$/.test(value)) return Number(value);
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Largest string (lexicographic, which is chronological for `YYYY-MM-DD`) or undefined. */
export function maxString(values: Array<string | null | undefined>): string | undefined {
  let max: string | undefined;
  for (const value of values) {
    if (value && (max === undefined || value > max)) max = value;
  }
  return max;
}

/** Compact UTC date range label for sync progress messages. */
export function windowLabel(start: Date, end: Date): string {
  return `${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`;
}
