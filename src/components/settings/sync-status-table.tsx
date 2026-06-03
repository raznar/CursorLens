"use client";

import { DataTable, type Column } from "@/components/dashboard/data-table";
import { SyncStatusBadge, type SyncStatus } from "@/components/dashboard/sync-status-badge";

export interface SyncStatusRow {
  dataType: string;
  label: string;
  status: string;
  lastSyncedAt: number | null;
  watermark: string | null;
  lastError: string | null;
  rows: number | null;
  progressCurrent: number | null;
  progressTotal: number | null;
  progressMessage: string | null;
}

const STATUS_VALUES = new Set<SyncStatus>(["ok", "running", "error", "stale", "never", "skipped"]);
function toSyncStatus(status: string): SyncStatus {
  return STATUS_VALUES.has(status as SyncStatus) ? (status as SyncStatus) : "never";
}

/** Per-data-type sync status table (client island: column cell renderers live here). */
export function SyncStatusTable({ rows }: { rows: SyncStatusRow[] }) {
  const columns: Column<SyncStatusRow>[] = [
    {
      key: "label",
      header: "Metric",
      sortable: true,
      cell: (row) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.label}</span>
          <span className="font-mono text-xs text-muted-foreground">{row.dataType}</span>
        </div>
      ),
      value: (row) => row.label,
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      cell: (row) => <SyncStatusBadge status={toSyncStatus(row.status)} at={row.lastSyncedAt} />,
      value: (row) => row.status,
    },
    {
      key: "rows",
      header: "Rows",
      align: "right",
      sortable: true,
      cell: (row) => (row.rows == null ? "—" : row.rows.toLocaleString()),
      value: (row) => row.rows ?? -1,
    },
    {
      key: "progress",
      header: "Progress",
      sortable: true,
      cell: (row) => {
        if (row.progressCurrent == null || row.progressTotal == null) return "—";
        return `${row.progressCurrent.toLocaleString()} / ${row.progressTotal.toLocaleString()}`;
      },
      value: (row) =>
        row.progressCurrent == null || row.progressTotal == null
          ? ""
          : `${row.progressCurrent}/${row.progressTotal}`,
    },
    {
      key: "progressMessage",
      header: "Latest detail",
      cell: (row) =>
        row.progressMessage ? (
          <span className="text-xs text-muted-foreground" title={row.progressMessage}>
            {row.progressMessage.length > 72
              ? `${row.progressMessage.slice(0, 72)}…`
              : row.progressMessage}
          </span>
        ) : (
          "—"
        ),
      value: (row) => row.progressMessage ?? "",
    },
    {
      key: "watermark",
      header: "Watermark",
      cell: (row) => row.watermark ?? "—",
      value: (row) => row.watermark ?? "",
    },
    {
      key: "lastError",
      header: "Last error",
      cell: (row) =>
        row.lastError ? (
          <span className="text-xs text-destructive" title={row.lastError}>
            {row.lastError.length > 60 ? `${row.lastError.slice(0, 60)}…` : row.lastError}
          </span>
        ) : (
          "—"
        ),
      value: (row) => row.lastError ?? "",
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      searchable
      searchPlaceholder="Filter data types…"
      pageSize={40}
      csvFilename="sync-status.csv"
      initialSort={{ key: "label", dir: "asc" }}
      emptyMessage="No sync has run yet."
    />
  );
}
