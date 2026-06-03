"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { chartColor, formatPercent, formatValue, type ValueFormat } from "@/lib/format";
import type { ChartKind } from "@/lib/registry";
import { cn } from "@/lib/utils";

export interface ChartSeries {
  /** Key in each data row. */
  key: string;
  /** Legend/tooltip label (defaults to `key`). */
  label?: string;
  /** Override color; defaults to the palette by series index. */
  color?: string;
}

export interface MetricChartProps {
  data: Array<Record<string, string | number | null | undefined>>;
  series: ChartSeries[];
  xKey: string;
  kind?: ChartKind;
  height?: number;
  valueFormat?: ValueFormat;
  xTickFormatter?: (value: string) => string;
  showLegend?: boolean;
  className?: string;
}

interface TooltipItem {
  dataKey?: string | number;
  name?: string | number;
  value?: number | string;
  color?: string;
}

function ChartTooltip(props: {
  active?: boolean;
  payload?: TooltipItem[];
  label?: string | number;
  valueFormat: ValueFormat;
  xTickFormatter?: (value: string) => string;
}) {
  const { active, payload, label, valueFormat, xTickFormatter } = props;
  if (!active || !payload || payload.length === 0) return null;
  const heading = xTickFormatter ? xTickFormatter(String(label)) : String(label);
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-medium text-popover-foreground">{heading}</div>
      <div className="flex flex-col gap-1">
        {payload.map((item, i) => (
          <div key={item.dataKey ?? i} className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: item.color }} />
            <span className="text-muted-foreground">{item.name}</span>
            <span className="ml-auto font-medium text-popover-foreground">
              {formatValue(valueFormat, Number(item.value ?? 0))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Hide labels on very thin slices so they do not overlap. */
const RADIAL_LABEL_MIN_SHARE = 0.05;

const RADIAL_LABEL_OFFSET = 14;

interface RadialSegmentLabelProps {
  cx?: number;
  cy?: number;
  midAngle?: number;
  outerRadius?: number;
  name?: string;
  value?: number;
  percent?: number;
  valueFormat: ValueFormat;
}

/** Positions callout text inside the chart margin so top/side labels are not clipped. */
function RadialSegmentLabel({
  cx = 0,
  cy = 0,
  midAngle = 0,
  outerRadius = 0,
  name = "",
  value = 0,
  percent = 0,
  valueFormat,
}: RadialSegmentLabelProps) {
  if (percent < RADIAL_LABEL_MIN_SHARE) return null;

  const radian = (-midAngle * Math.PI) / 180;
  const radius = Number(outerRadius) + RADIAL_LABEL_OFFSET;
  const x = Number(cx) + radius * Math.cos(radian);
  const y = Number(cy) + radius * Math.sin(radian);
  const sin = Math.sin(radian);
  const cos = Math.cos(radian);

  let textAnchor: "start" | "middle" | "end" = "middle";
  if (cos > 0.2) textAnchor = "start";
  else if (cos < -0.2) textAnchor = "end";

  // Default "central" baseline draws half the glyphs above y — clips at the top edge.
  let dominantBaseline: "auto" | "hanging" | "central" = "central";
  if (sin < -0.2) dominantBaseline = "hanging";
  else if (sin > 0.2) dominantBaseline = "auto";

  return (
    <text
      x={x}
      y={y}
      fill="hsl(var(--foreground))"
      textAnchor={textAnchor}
      dominantBaseline={dominantBaseline}
      fontSize={11}
    >
      {`${name}: ${formatValue(valueFormat, Number(value))}`}
    </text>
  );
}

function PieChartTooltip(props: {
  active?: boolean;
  payload?: TooltipItem[];
  valueFormat: ValueFormat;
  total: number;
}) {
  const { active, payload, valueFormat, total } = props;
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0];
  const value = Number(item.value ?? 0);
  const share = total > 0 ? value / total : 0;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="mb-1 flex items-center gap-2 font-medium text-popover-foreground">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: item.color }} />
        {item.name}
      </div>
      <div className="flex flex-col gap-0.5 text-muted-foreground">
        <span>
          Count:{" "}
          <span className="font-medium text-popover-foreground">
            {formatValue(valueFormat, value)}
          </span>
        </span>
        <span>
          Share: <span className="font-medium text-popover-foreground">{formatPercent(share)}</span>
        </span>
      </div>
    </div>
  );
}

/**
 * The single chart primitive for the app. Every time-series visualization should go
 * through this so axes, tooltips, colors, and number formatting stay consistent.
 * See the `design-system` skill.
 */
export function MetricChart({
  data,
  series,
  xKey,
  kind = "line",
  height = 280,
  valueFormat = "number",
  xTickFormatter,
  showLegend,
  className,
}: MetricChartProps) {
  const isRadial = kind === "pie" || kind === "donut";
  const stacked = kind === "stackedBar" || kind === "stackedArea";
  const colorOf = (s: ChartSeries, i: number) => s.color ?? chartColor(i);
  const yTick = (v: number) => formatValue(valueFormat, v);
  const valueKey = series[0]?.key ?? "value";
  const pieTotal = data.reduce((sum, row) => sum + Number(row[valueKey] ?? 0), 0);
  const legendVisible = showLegend ?? (isRadial || series.length > 1);
  const chartHeight = isRadial ? Math.max(height, 320) : height;
  const radialLegendFormatter = (name: string) => {
    const row = data.find((d) => String(d[xKey]) === name);
    const value = Number(row?.[valueKey] ?? 0);
    const share = pieTotal > 0 ? value / pieTotal : 0;
    return `${name} · ${formatValue(valueFormat, value)} (${formatPercent(share)})`;
  };
  const tooltip = (
    <Tooltip
      content={<ChartTooltip valueFormat={valueFormat} xTickFormatter={xTickFormatter} />}
      cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }}
    />
  );
  const axes = (
    <>
      <CartesianGrid strokeDasharray="3 3" vertical={false} />
      <XAxis
        dataKey={xKey}
        tickFormatter={xTickFormatter}
        tickLine={false}
        axisLine={false}
        minTickGap={24}
      />
      <YAxis tickFormatter={yTick} tickLine={false} axisLine={false} width={48} />
      {tooltip}
      {(showLegend ?? series.length > 1) ? <Legend iconType="circle" /> : null}
    </>
  );

  const radialMargin = {
    top: 28,
    right: 28,
    bottom: legendVisible ? 64 : 28,
    left: 28,
  };

  return (
    <div className={cn("w-full overflow-visible", className)} style={{ height: chartHeight }}>
      <ResponsiveContainer width="100%" height="100%">
        {isRadial ? (
          <PieChart margin={radialMargin}>
            <Pie
              data={data}
              dataKey={valueKey}
              nameKey={xKey}
              cx="50%"
              cy="50%"
              innerRadius={kind === "donut" ? "38%" : 0}
              outerRadius="66%"
              paddingAngle={1}
              strokeWidth={0}
              label={({ key, ...props }) => (
                <RadialSegmentLabel key={key} {...props} valueFormat={valueFormat} />
              )}
              labelLine={false}
            >
              {data.map((_, i) => (
                <Cell key={`cell-${i}`} fill={chartColor(i)} />
              ))}
            </Pie>
            <Tooltip content={<PieChartTooltip valueFormat={valueFormat} total={pieTotal} />} />
            {legendVisible ? (
              <Legend
                iconType="circle"
                layout="horizontal"
                verticalAlign="bottom"
                formatter={radialLegendFormatter}
                wrapperStyle={{ fontSize: 11, lineHeight: "1.4", paddingTop: 8 }}
              />
            ) : null}
          </PieChart>
        ) : kind === "bar" || kind === "stackedBar" ? (
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            {axes}
            {series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label ?? s.key}
                fill={colorOf(s, i)}
                radius={[3, 3, 0, 0]}
                stackId={stacked ? "stack" : undefined}
              />
            ))}
          </BarChart>
        ) : kind === "area" || kind === "stackedArea" ? (
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            {axes}
            {series.map((s, i) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label ?? s.key}
                stroke={colorOf(s, i)}
                fill={colorOf(s, i)}
                fillOpacity={0.18}
                strokeWidth={2}
                stackId={stacked ? "stack" : undefined}
              />
            ))}
          </AreaChart>
        ) : (
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            {axes}
            {series.map((s, i) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label ?? s.key}
                stroke={colorOf(s, i)}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
