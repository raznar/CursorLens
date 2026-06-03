"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SYNC_STATUS_REFRESH_EVENT } from "./sync-progress-events";

export interface SyncNowButtonsProps {
  backfillDays: number;
}

/** "Sync now" (incremental) + "Backfill" trigger buttons. */
export function SyncNowButtons({ backfillDays }: SyncNowButtonsProps) {
  const router = useRouter();
  const [pendingMode, setPendingMode] = useState<"incremental" | "backfill" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function trigger(mode: "incremental" | "backfill") {
    setPendingMode(mode);
    setError(null);
    window.dispatchEvent(new Event(SYNC_STATUS_REFRESH_EVENT));
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Sync failed (${res.status})`);
      }
      window.dispatchEvent(new Event(SYNC_STATUS_REFRESH_EVENT));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setPendingMode(null);
      window.dispatchEvent(new Event(SYNC_STATUS_REFRESH_EVENT));
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={pendingMode !== null}
          onClick={() => void trigger("incremental")}
        >
          <RefreshCw className="h-4 w-4" />
          {pendingMode === "incremental" ? "Syncing…" : "Sync now"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pendingMode !== null}
          onClick={() => void trigger("backfill")}
        >
          <History className="h-4 w-4" />
          {pendingMode === "backfill" ? "Backfilling…" : `Backfill ${backfillDays}d`}
        </Button>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
