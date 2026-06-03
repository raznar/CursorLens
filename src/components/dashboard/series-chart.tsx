"use client";

import { MetricChart, type ChartSeries } from "@/components/charts/metric-chart";
import { formatDate, type ValueFormat } from "@/lib/format";
import type { ChartKind } from "@/lib/registry";

type ChartDatum = Record<string, string | number | null | undefined>;

export interface SeriesChartProps {
  /**
   * Row data. Accepts any array of plain objects (e.g. `{ date, value }` rows or
   * `KeyValue[]`); the keys referenced by `xKey`/`series` must exist on each row.
   */
  data: readonly object[];
  series: ChartSeries[];
  xKey: string;
  kind?: ChartKind;
  valueFormat?: ValueFormat;
  height?: number;
  /** How to format the x-axis ticks. "date" renders ISO day strings as "Jan 5". */
  xFormat?: "date" | "none";
  showLegend?: boolean;
}

/**
 * Thin client wrapper around {@link MetricChart}. Server pages can only pass serializable
 * props, so the (non-serializable) x-axis tick formatter is reconstructed here from the
 * `xFormat` string. Everything else passes straight through.
 */
export function SeriesChart({ data, xFormat = "none", ...props }: SeriesChartProps) {
  const xTickFormatter =
    xFormat === "date" ? (value: string) => formatDate(value, "MMM d") : undefined;
  return <MetricChart data={data as ChartDatum[]} {...props} xTickFormatter={xTickFormatter} />;
}
