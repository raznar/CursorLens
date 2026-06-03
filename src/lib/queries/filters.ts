import { and, gte, lte, type SQL, sql } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { toApiDate } from "@/lib/date-range";

/** A concrete date window. Mirrors the relevant fields of `ResolvedRange`. */
export interface Range {
  start: Date;
  end: Date;
}

/**
 * WHERE clause for tables whose date column is a `YYYY-MM-DD` text day (analytics tables).
 * ISO day strings compare correctly lexicographically.
 */
export function dayBetween(col: AnySQLiteColumn, range: Range): SQL | undefined {
  return and(gte(col, toApiDate(range.start)), lte(col, toApiDate(range.end)));
}

/** WHERE clause for tables whose time column is epoch milliseconds (usage events, audit logs). */
export function msBetween(col: AnySQLiteColumn, range: Range): SQL | undefined {
  return and(gte(col, range.start.getTime()), lte(col, range.end.getTime()));
}

/** SQL expression that buckets an epoch-millis column into a `YYYY-MM-DD` UTC day string. */
export function dayFromMs(col: AnySQLiteColumn): SQL<string> {
  return sql<string>`strftime('%Y-%m-%d', ${col} / 1000, 'unixepoch')`;
}

/** The immediately-preceding window of equal length, for period-over-period deltas. */
export function previousRange(range: Range): Range {
  const span = range.end.getTime() - range.start.getTime();
  return { start: new Date(range.start.getTime() - span), end: range.start };
}
