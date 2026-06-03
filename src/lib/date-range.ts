/** Date-range presets shared by the picker (client) and dashboard pages (server). */

export const RANGE_PRESETS = [
  { value: "7d", label: "Last 7 days", days: 7 },
  { value: "14d", label: "Last 14 days", days: 14 },
  { value: "30d", label: "Last 30 days", days: 30 },
  { value: "90d", label: "Last 90 days", days: 90 },
] as const;

export type RangeValue = (typeof RANGE_PRESETS)[number]["value"];

export const DEFAULT_RANGE: RangeValue = "30d";

export interface ResolvedRange {
  value: RangeValue;
  days: number;
  label: string;
  start: Date;
  end: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Resolve a `?range=` value to concrete start/end dates (end = now). */
export function resolveRange(range?: string | null): ResolvedRange {
  const preset =
    RANGE_PRESETS.find((p) => p.value === range) ??
    RANGE_PRESETS.find((p) => p.value === DEFAULT_RANGE)!;
  const end = new Date();
  const start = new Date(end.getTime() - preset.days * DAY_MS);
  return { value: preset.value, days: preset.days, label: preset.label, start, end };
}

/** YYYY-MM-DD (UTC) — the format the Cursor Analytics API prefers for caching. */
export function toApiDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
