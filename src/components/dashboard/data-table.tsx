"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Download, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/dashboard/empty-state";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: string;
  /** Custom cell renderer. */
  cell?: (row: T) => React.ReactNode;
  /** Sort/search/CSV value. Falls back to row[key]. */
  value?: (row: T) => string | number;
  align?: "left" | "right";
  sortable?: boolean;
  className?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  searchable?: boolean;
  searchPlaceholder?: string;
  pageSize?: number;
  csvFilename?: string;
  initialSort?: { key: string; dir: "asc" | "desc" };
  emptyMessage?: string;
}

function rawValue<T>(row: T, col: Column<T>): string | number {
  if (col.value) return col.value(row);
  const v = (row as unknown as Record<string, unknown>)[col.key];
  if (typeof v === "number") return v;
  return v == null ? "" : String(v);
}

function toCsv<T>(columns: Column<T>[], rows: T[]): string {
  const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const header = columns.map((c) => escape(c.header)).join(",");
  const body = rows
    .map((row) => columns.map((c) => escape(String(rawValue(row, c)))).join(","))
    .join("\n");
  return `${header}\n${body}`;
}

/** Generic sortable/searchable/paginated table with CSV export. */
export function DataTable<T>({
  columns,
  rows,
  searchable = true,
  searchPlaceholder = "Search…",
  pageSize = 25,
  csvFilename,
  initialSort,
  emptyMessage,
}: DataTableProps<T>) {
  const [query, setQuery] = React.useState("");
  const [page, setPage] = React.useState(0);
  const [sort, setSort] = React.useState<{ key: string; dir: "asc" | "desc" } | null>(
    initialSort ?? null,
  );

  const filtered = React.useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter((row) =>
      columns.some((c) => String(rawValue(row, c)).toLowerCase().includes(q)),
    );
  }, [rows, columns, query]);

  const sorted = React.useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return filtered;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = rawValue(a, col);
      const bv = rawValue(b, col);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [filtered, columns, sort]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const clampedPage = Math.min(page, pageCount - 1);
  const pageRows = sorted.slice(clampedPage * pageSize, clampedPage * pageSize + pageSize);

  function toggleSort(key: string) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "desc" };
      if (prev.dir === "desc") return { key, dir: "asc" };
      return null;
    });
    setPage(0);
  }

  function downloadCsv() {
    const csv = toCsv(columns, sorted);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = csvFilename ?? "export.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-3">
      {(searchable || csvFilename) && (
        <div className="flex items-center justify-between gap-2">
          {searchable ? (
            <div className="relative max-w-xs flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
                placeholder={searchPlaceholder}
                className="pl-8"
              />
            </div>
          ) : (
            <span />
          )}
          {csvFilename ? (
            <Button variant="outline" size="sm" onClick={downloadCsv} disabled={!sorted.length}>
              <Download className="h-4 w-4" />
              CSV
            </Button>
          ) : null}
        </div>
      )}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => {
                const active = sort?.key === col.key;
                const Icon = !active ? ChevronsUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
                return (
                  <TableHead
                    key={col.key}
                    className={cn(col.align === "right" && "text-right", col.className)}
                  >
                    {col.sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key)}
                        className={cn(
                          "inline-flex items-center gap-1 hover:text-foreground",
                          col.align === "right" && "flex-row-reverse",
                        )}
                      >
                        {col.header}
                        <Icon className="h-3 w-3" />
                      </button>
                    ) : (
                      col.header
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="p-0">
                  <EmptyState description={emptyMessage ?? "No matching rows."} />
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((row, i) => (
                <TableRow key={i}>
                  {columns.map((col) => (
                    <TableCell
                      key={col.key}
                      className={cn(
                        col.align === "right" && "text-right tabular-nums",
                        col.className,
                      )}
                    >
                      {col.cell ? col.cell(row) : String(rawValue(row, col))}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {sorted.length} row{sorted.length === 1 ? "" : "s"}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={clampedPage === 0}
            >
              Previous
            </Button>
            <span>
              Page {clampedPage + 1} of {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={clampedPage >= pageCount - 1}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
