"use client";

import * as React from "react";
import { type Column, DataTable } from "@/components/dashboard/data-table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate } from "@/lib/format";

export interface AuditTableRow {
  eventId: string;
  timestamp: number | null;
  userEmail: string | null;
  eventType: string | null;
  ipAddress: string | null;
}

export interface AuditTableProps {
  rows: AuditTableRow[];
  eventTypes: string[];
}

const ALL = "__all__";

const COLUMNS: Column<AuditTableRow>[] = [
  {
    key: "timestamp",
    header: "Time",
    sortable: true,
    value: (r) => r.timestamp ?? 0,
    cell: (r) => (r.timestamp ? formatDate(r.timestamp, "MMM d, yyyy HH:mm") : "—"),
  },
  { key: "userEmail", header: "User", sortable: true, cell: (r) => r.userEmail ?? "—" },
  { key: "eventType", header: "Event", sortable: true, cell: (r) => r.eventType ?? "—" },
  { key: "ipAddress", header: "IP address", cell: (r) => r.ipAddress ?? "—" },
];

/** Audit-log table with an event-type facet filter layered on top of the shared DataTable. */
export function AuditTable({ rows, eventTypes }: AuditTableProps) {
  const [type, setType] = React.useState<string>(ALL);
  const filtered = React.useMemo(
    () => (type === ALL ? rows : rows.filter((r) => r.eventType === type)),
    [rows, type],
  );

  return (
    <div className="flex flex-col gap-3">
      <Select value={type} onValueChange={setType}>
        <SelectTrigger className="w-full max-w-xs">
          <SelectValue placeholder="All event types" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All event types</SelectItem>
          {eventTypes.map((t) => (
            <SelectItem key={t} value={t}>
              {t}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <DataTable
        columns={COLUMNS}
        rows={filtered}
        searchPlaceholder="Search users, events, IPs…"
        csvFilename="audit-logs.csv"
        pageSize={50}
        initialSort={{ key: "timestamp", dir: "desc" }}
        emptyMessage="No audit events in this window."
      />
    </div>
  );
}
