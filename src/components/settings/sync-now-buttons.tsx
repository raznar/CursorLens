"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  SYNC_RUN_STATE_EVENT,
  SYNC_STATUS_REFRESH_EVENT,
  type SyncRunStateDetail,
} from "./sync-progress-events";

export interface SyncNowButtonsProps {
  backfillDays: number;
  /** Whether a run was active when the page rendered (keeps the buttons disabled on load). */
  initialRunning?: boolean;
}

type Mode = "incremental" | "backfill";

/**
 * "Sync now" (incremental) + "Backfill" triggers. The POST returns as soon as the run is
 * started (202) — progress arrives via the status panel's polling, which broadcasts whether
 * a run is active so these buttons stay disabled until it finishes.
 */
export function SyncNowButtons({ backfillDays, initialRunning = false }: SyncNowButtonsProps) {
  const router = useRouter();
  const [pendingMode, setPendingMode] = useState<Mode | null>(null);
  const [running, setRunning] = useState(initialRunning);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onState = (event: Event) => {
      const detail = (event as CustomEvent<SyncRunStateDetail>).detail;
      setRunning(detail.running);
      if (!detail.running) setNotice(null);
    };
    window.addEventListener(SYNC_RUN_STATE_EVENT, onState);
    return () => window.removeEventListener(SYNC_RUN_STATE_EVENT, onState);
  }, []);

  async function trigger(mode: Mode) {
    setPendingMode(mode);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const body = (await res.json().catch(() => null)) as {
        error?: string;
        runId?: number;
      } | null;
      if (res.status === 409) {
        setRunning(true);
        setNotice(body?.error ?? "A sync is already running.");
      } else if (!res.ok) {
        throw new Error(body?.error ?? `Sync failed (${res.status})`);
      } else {
        setRunning(true);
        setNotice(
          mode === "backfill"
            ? `Backfill started (run #${body?.runId ?? "?"}). Progress updates below.`
            : `Sync started (run #${body?.runId ?? "?"}).`,
        );
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setPendingMode(null);
      window.dispatchEvent(new Event(SYNC_STATUS_REFRESH_EVENT));
    }
  }

  const busy = pendingMode !== null || running;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={busy} onClick={() => void trigger("incremental")}>
          <RefreshCw className={`h-4 w-4${running ? "animate-spin" : ""}`} />
          {pendingMode === "incremental" ? "Starting…" : running ? "Sync running…" : "Sync now"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => void trigger("backfill")}
        >
          <History className="h-4 w-4" />
          {pendingMode === "backfill" ? "Starting…" : `Backfill ${backfillDays}d`}
        </Button>
      </div>
      {notice ? <p className="text-xs text-muted-foreground">{notice}</p> : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
