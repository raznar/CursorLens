"use client";

import * as React from "react";
import { type Column, DataTable } from "@/components/dashboard/data-table";
import {
  type DateInput,
  formatCents,
  formatCompact,
  formatDate,
  formatDollars,
  formatNumber,
  formatPercent,
  formatRelative,
} from "@/lib/format";

export type CellFormat =
  | "text"
  | "number"
  | "compact"
  | "cents"
  | "dollars"
  | "percent"
  | "date"
  | "relative";

/** Serializable column spec — lets server pages declare tables without passing functions. */
export interface QueryColumn {
  key: string;
  header: string;
  format?: CellFormat;
  align?: "left" | "right";
  sortable?: boolean;
  className?: string;
}

type Row = Record<string, unknown>;

export interface QueryTableProps {
  columns: QueryColumn[];
  /** Any array of plain row objects; cell values are looked up by column `key`. */
  rows: readonly object[];
  searchable?: boolean;
  searchPlaceholder?: string;
  csvFilename?: string;
  pageSize?: number;
  initialSort?: { key: string; dir: "asc" | "desc" };
  emptyMessage?: string;
}

const NUMERIC: ReadonlySet<CellFormat> = new Set([
  "number",
  "compact",
  "cents",
  "dollars",
  "percent",
]);

function renderCell(format: CellFormat, raw: unknown): React.ReactNode {
  if (raw == null || raw === "") return <span className="text-muted-foreground">—</span>;
  switch (format) {
    case "number":
      return formatNumber(Number(raw));
    case "compact":
      return formatCompact(Number(raw));
    case "cents":
      return formatCents(Number(raw));
    case "dollars":
      return formatDollars(Number(raw));
    case "percent":
      return formatPercent(Number(raw));
    case "date":
      return formatDate(raw as DateInput);
    case "relative":
      return formatRelative(raw as DateInput);
    default:
      return String(raw);
  }
}

function buildColumn(spec: QueryColumn): Column<Row> {
  const format = spec.format ?? "text";
  const numeric = NUMERIC.has(format);
  return {
    key: spec.key,
    header: spec.header,
    align: spec.align ?? (numeric ? "right" : "left"),
    sortable: spec.sortable ?? true,
    className: spec.className,
    value: (row) => {
      const raw = row[spec.key];
      if (numeric) {
        const n = Number(raw);
        return Number.isFinite(n) ? n : 0;
      }
      if (typeof raw === "number") return raw;
      return raw == null ? "" : String(raw);
    },
    cell: (row) => renderCell(format, row[spec.key]),
  };
}

/**
 * Declarative, serializable-props table for server pages. Wraps the shared {@link DataTable}
 * (sort/search/paginate/CSV) and builds per-column cell renderers from a `format` string.
 */
export function QueryTable({ columns, rows, ...rest }: QueryTableProps) {
  const builtColumns = React.useMemo(() => columns.map(buildColumn), [columns]);
  return <DataTable<Row> columns={builtColumns} rows={rows as Row[]} {...rest} />;
}
