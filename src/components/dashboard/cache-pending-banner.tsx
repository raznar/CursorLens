import Link from "next/link";
import { Info } from "lucide-react";
import { config } from "@/lib/config";
import { getAdminKeyStatus, getIngestedCacheReadable } from "@/lib/server/request-cache";

/** Shown when dashboards have no live ingested data to display. */
export function CachePendingBanner() {
  if (getIngestedCacheReadable()) return null;

  const admin = getAdminKeyStatus();
  const needsKey = !admin.configured || config.mock;

  return (
    <div className="flex items-start gap-2 rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 p-4 text-sm">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <div>
        <p className="font-medium">{needsKey ? "No live data loaded" : "Waiting for live data"}</p>
        <p className="text-muted-foreground">
          {needsKey ? (
            <>
              Add an Admin/Analytics API key in Settings (and unset <code>CURSOR_MOCK=1</code> if
              set). Mock fixture data is not shown on dashboards.
            </>
          ) : (
            <>
              Run a live sync to load team data. Cached fixture rows are not displayed.{" "}
              <Link href="/settings" className="underline underline-offset-2 hover:text-foreground">
                Sync now or Backfill
              </Link>
              .
            </>
          )}
        </p>
      </div>
    </div>
  );
}
