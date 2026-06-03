import { format as formatDateFns, formatDistanceToNow, parseISO } from "date-fns";

/**
 * Shared value formatters. Use these everywhere so units stay consistent across the
 * dashboard. See the `design-system` skill.
 */

export type DateInput = Date | number | string;

/**
 * Re-express a UTC instant as a local-time Date carrying the same wall-clock fields.
 * The Cursor API returns day markers as UTC midnight; this keeps day-level formatting
 * stable across timezones (and identical locally vs. in CI).
 */
function utcWallClock(d: Date): Date {
  return new Date(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds(),
    d.getUTCMilliseconds(),
  );
}

function toDate(input: DateInput): Date {
  if (input instanceof Date) return input;
  if (typeof input === "number") return utcWallClock(new Date(input));
  // Numeric strings are epoch millis (the Cursor API returns these as strings).
  if (/^\d+$/.test(input)) return utcWallClock(new Date(Number(input)));
  return parseISO(input);
}

/** Whole-number / decimal formatting with optional compact notation (1.2K, 3.4M). */
export function formatNumber(
  value: number,
  opts: { compact?: boolean; digits?: number } = {},
): string {
  return new Intl.NumberFormat("en-US", {
    notation: opts.compact ? "compact" : "standard",
    maximumFractionDigits: opts.digits ?? (opts.compact ? 1 : 0),
  }).format(value);
}

/** Compact number (1234 -> "1.2K"). */
export function formatCompact(value: number): string {
  return formatNumber(value, { compact: true });
}

/** Cents (integer) -> localized USD. */
export function formatCents(cents: number, opts: { compact?: boolean } = {}): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: opts.compact ? "compact" : "standard",
    maximumFractionDigits: opts.compact ? 1 : 2,
  }).format(cents / 100);
}

/** Dollars (number) -> localized USD. */
export function formatDollars(dollars: number, opts: { compact?: boolean } = {}): string {
  return formatCents(Math.round(dollars * 100), opts);
}

/** Ratio in [0,1] -> percent string. `formatPercent(0.2257)` -> "22.6%". */
export function formatPercent(ratio: number, digits = 1): string {
  if (!Number.isFinite(ratio)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(ratio);
}

/** Format a date with a date-fns pattern (default: "MMM d, yyyy"). */
export function formatDate(input: DateInput, pattern = "MMM d, yyyy"): string {
  try {
    return formatDateFns(toDate(input), pattern);
  } catch {
    return "—";
  }
}

/** Human relative time ("3 hours ago"). */
export function formatRelative(input: DateInput): string {
  try {
    return formatDistanceToNow(toDate(input), { addSuffix: true });
  } catch {
    return "—";
  }
}

/** Token counts -> compact with a "tok" suffix. */
export function formatTokens(value: number): string {
  return `${formatCompact(value)} tok`;
}

/** Categorical chart color by series index (wraps the 8-color palette). */
export function chartColor(index: number): string {
  return `hsl(var(--chart-${(index % 8) + 1}))`;
}

/** Declarative value formats used by the metric registry and chart wrapper. */
export type ValueFormat = "number" | "compact" | "cents" | "percent" | "tokens";

/** Dispatch a numeric value through the named format. */
export function formatValue(format: ValueFormat, value: number): string {
  switch (format) {
    case "number":
      return formatNumber(value);
    case "compact":
      return formatCompact(value);
    case "cents":
      return formatCents(value);
    case "percent":
      return formatPercent(value);
    case "tokens":
      return formatTokens(value);
  }
}
