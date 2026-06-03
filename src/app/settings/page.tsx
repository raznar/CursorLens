import Link from "next/link";
import { Info } from "lucide-react";
import { KeyForm } from "@/components/settings/key-form";
import { SyncNowButtons } from "@/components/settings/sync-now-buttons";
import { SyncSettingsForm } from "@/components/settings/sync-settings-form";
import { SyncStatusPanel } from "@/components/settings/sync-status-panel";
import { config } from "@/lib/config";
import { isEncryptionAvailable } from "@/lib/crypto";
import { adminKeyStatus, cursorKeyStatus } from "@/lib/keys";
import { ingestedCacheReadable, isLiveIngestionEnabled } from "@/lib/sync/cache-policy";
import { SYNC_JOBS, getSyncConfig, getSyncStatus } from "@/lib/sync";
import {
  clearAdminKey,
  clearCachedData,
  clearCursorKey,
  saveAdminKey,
  saveCursorKey,
  saveSyncSettings,
} from "./actions";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const admin = adminKeyStatus();
  const sdk = cursorKeyStatus();
  const encryption = isEncryptionAvailable();
  const syncConfig = getSyncConfig();
  const syncStatus = getSyncStatus();
  const syncJobs = SYNC_JOBS.map((job) => ({ dataType: job.dataType, label: job.label }));

  const usingMock = config.mock || !admin.configured;
  const awaitingLiveCache = isLiveIngestionEnabled() && !ingestedCacheReadable();

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 p-6 lg:p-10">
      <header className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
            ← Back to dashboard
          </Link>
        </div>
        <p className="text-sm text-muted-foreground">
          Manage API keys, the sync schedule, and inspect ingestion status.
        </p>
      </header>

      {usingMock && (
        <div className="flex items-start gap-2 rounded-lg border border-dashed bg-muted/40 p-4 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="font-medium">Mock mode active</p>
            <p className="text-muted-foreground">
              {config.mock
                ? "CURSOR_MOCK=1 is set — syncs use bundled fixtures instead of the live Cursor API."
                : "No Admin/Analytics key is configured, so syncs fall back to bundled fixtures. Add a key below to ingest real data."}
            </p>
          </div>
        </div>
      )}

      {awaitingLiveCache && (
        <div className="flex items-start gap-2 rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 p-4 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="font-medium">Dashboards hide fixture data</p>
            <p className="text-muted-foreground">
              Your admin key is saved. Mock sync rows were cleared; run Sync now or Backfill below
              to load live data. Until then, dashboard pages stay empty.
            </p>
          </div>
        </div>
      )}

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-medium">API keys</h2>
          <p className="text-sm text-muted-foreground">
            Stored encrypted at rest (AES-256-GCM). Environment variables take precedence.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <KeyForm
            title="Admin / Analytics key"
            description="Basic-auth key with admin:* scope. Used to ingest all dashboard data."
            configured={admin.configured}
            source={admin.source}
            placeholder="key_..."
            encryptionAvailable={encryption}
            saveAction={saveAdminKey}
            clearAction={clearAdminKey}
          />
          <KeyForm
            title="Cursor API key (Ask Agent)"
            description="User or service-account key for the embedded agent. Admin keys are not accepted by the SDK."
            configured={sdk.configured}
            source={sdk.source}
            placeholder="key_..."
            encryptionAvailable={encryption}
            saveAction={saveCursorKey}
            clearAction={clearCursorKey}
          />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium">Sync</h2>
            <p className="text-sm text-muted-foreground">
              Trigger a sync now or adjust the schedule.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SyncNowButtons backfillDays={syncConfig.backfillDays} />
            {admin.configured && !config.mock && (
              <form action={clearCachedData}>
                <button
                  type="submit"
                  className="shadow-xs inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
                >
                  Clear cached data
                </button>
              </form>
            )}
          </div>
        </div>
        <SyncSettingsForm
          intervalHours={syncConfig.intervalHours}
          backfillDays={syncConfig.backfillDays}
          saveAction={saveSyncSettings}
        />
      </section>

      <section className="flex flex-col gap-4">
        <SyncStatusPanel jobs={syncJobs} initialStatus={syncStatus} />

        {syncStatus.recentRuns.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {syncStatus.recentRuns.length} recent run
            {syncStatus.recentRuns.length === 1 ? "" : "s"} recorded.
          </p>
        )}
      </section>
    </main>
  );
}
