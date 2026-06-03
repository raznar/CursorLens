"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelative } from "@/lib/format";
import { SyncStatusTable, type SyncStatusRow } from "./sync-status-table";
import { SYNC_STATUS_REFRESH_EVENT } from "./sync-progress-events";

interface SyncJobSummary {
  dataType: string;
  label: string;
}

interface SyncStateJson {
  data_type: string;
  last_synced_at: number;
  watermark: string | null;
  etag: string | null;
  status: string;
  last_error: string | null;
  last_run_id: number | null;
}

interface SyncRunJson {
  id: number;
  started_at: number;
  finished_at: number | null;
  trigger: string;
  status: string;
  mock: number;
  summary: string | null;
}

interface SyncRunItemJson {
  run_id: number;
  data_type: string;
  status: string;
  rows: number;
  duration_ms: number;
  error: string | null;
  progress_current: number | null;
  progress_total: number | null;
  progress_message: string | null;
}

interface SyncStatusJson {
  state: SyncStateJson[];
  latestRun?: SyncRunJson;
  latestItems: SyncRunItemJson[];
  recentRuns: SyncRunJson[];
}

const RUN_BADGE: Record<string, React.ComponentProps<typeof Badge>["variant"]> = {
  ok: "success",
  partial: "warning",
  error: "destructive",
  running: "default",
};

function statusRows(jobs: SyncJobSummary[], status: SyncStatusJson): SyncStatusRow[] {
  const stateByType = new Map(status.state.map((s) => [s.data_type, s]));
  const itemByType = new Map(status.latestItems.map((i) => [i.data_type, i]));
  const latestRunRunning = status.latestRun?.status === "running";
  return jobs.map((job) => {
    const state = stateByType.get(job.dataType);
    const item = itemByType.get(job.dataType);
    return {
      dataType: job.dataType,
      label: job.label,
      status:
        latestRunRunning && item?.status === "running" ? item.status : (state?.status ?? "never"),
      lastSyncedAt: state?.last_synced_at ?? null,
      watermark: state?.watermark ?? null,
      lastError: state?.last_error ?? item?.error ?? null,
      rows: item?.rows ?? null,
      progressCurrent: item?.progress_current ?? null,
      progressTotal: item?.progress_total ?? null,
      progressMessage: item?.progress_message ?? null,
    };
  });
}

export function SyncStatusPanel({
  jobs,
  initialStatus,
}: {
  jobs: SyncJobSummary[];
  initialStatus: SyncStatusJson;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [lastRefreshError, setLastRefreshError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/sync", { cache: "no-store" });
      if (!res.ok) throw new Error(`Status refresh failed (${res.status})`);
      const next = (await res.json()) as SyncStatusJson;
      setStatus(next);
      setLastRefreshError(null);
    } catch (err) {
      setLastRefreshError(err instanceof Error ? err.message : "Status refresh failed");
    }
  }, []);

  useEffect(() => {
    const onRefresh = () => void refreshStatus();
    window.addEventListener(SYNC_STATUS_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(SYNC_STATUS_REFRESH_EVENT, onRefresh);
  }, [refreshStatus]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshStatus();
    }, 2500);
    return () => window.clearInterval(id);
  }, [refreshStatus]);

  const rows = useMemo(() => statusRows(jobs, status), [jobs, status]);
  const latestRun = status.latestRun;
  const runRows = status.latestItems.reduce((sum, item) => sum + item.rows, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Sync status</CardTitle>
            <CardDescription>
              Per-endpoint watermark and last result. {jobs.length} data types.
              {latestRun?.status === "running"
                ? " Auto-refreshing while this run is active."
                : null}
            </CardDescription>
          </div>
          {latestRun && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Last run #{latestRun.id}</span>
              <Badge variant={RUN_BADGE[latestRun.status] ?? "secondary"}>{latestRun.status}</Badge>
              <span>
                {runRows.toLocaleString()} rows{latestRun.status === "running" ? " so far" : ""} ·{" "}
                {formatRelative(latestRun.finished_at ?? latestRun.started_at)}
              </span>
            </div>
          )}
        </div>
        {lastRefreshError ? <p className="text-xs text-destructive">{lastRefreshError}</p> : null}
      </CardHeader>
      <CardContent>
        <SyncStatusTable rows={rows} />
      </CardContent>
    </Card>
  );
}
