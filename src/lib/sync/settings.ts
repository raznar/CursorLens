import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";

/**
 * Non-secret sync configuration stored in the `settings` table (API keys live there too,
 * but encrypted via `lib/keys`). These values drive the cron interval and the default
 * backfill window, and are editable from the Settings page.
 */
export const SETTING_SYNC_INTERVAL_HOURS = "sync_interval_hours";
export const SETTING_SYNC_BACKFILL_DAYS = "sync_backfill_days";

export const DEFAULT_SYNC_INTERVAL_HOURS = 1;
export const DEFAULT_BACKFILL_DAYS = 30;
/** Trailing window (days) re-pulled on each incremental run to catch late-arriving data. */
export const DEFAULT_INCREMENTAL_DAYS = 7;

export interface SyncConfig {
  intervalHours: number;
  backfillDays: number;
}

function clampInt(
  value: string | number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function readSetting(key: string): string | undefined {
  return db.select().from(settings).where(eq(settings.key, key)).get()?.value;
}

function writeSetting(key: string, value: string): void {
  const now = Date.now();
  db.insert(settings)
    .values({ key, value, updated_at: now })
    .onConflictDoUpdate({ target: settings.key, set: { value, updated_at: now } })
    .run();
}

export function getSyncConfig(): SyncConfig {
  return {
    intervalHours: clampInt(
      readSetting(SETTING_SYNC_INTERVAL_HOURS),
      DEFAULT_SYNC_INTERVAL_HOURS,
      1,
      24,
    ),
    backfillDays: clampInt(readSetting(SETTING_SYNC_BACKFILL_DAYS), DEFAULT_BACKFILL_DAYS, 1, 365),
  };
}

export function setSyncConfig(partial: Partial<SyncConfig>): SyncConfig {
  if (partial.intervalHours !== undefined) {
    writeSetting(
      SETTING_SYNC_INTERVAL_HOURS,
      String(clampInt(partial.intervalHours, DEFAULT_SYNC_INTERVAL_HOURS, 1, 24)),
    );
  }
  if (partial.backfillDays !== undefined) {
    writeSetting(
      SETTING_SYNC_BACKFILL_DAYS,
      String(clampInt(partial.backfillDays, DEFAULT_BACKFILL_DAYS, 1, 365)),
    );
  }
  return getSyncConfig();
}
