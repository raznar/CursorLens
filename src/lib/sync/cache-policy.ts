import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  analyticsAgentEdits,
  analyticsAskMode,
  analyticsBugbot,
  analyticsClientVersions,
  analyticsCommands,
  analyticsConversationInsights,
  analyticsDau,
  analyticsLeaderboard,
  analyticsMcp,
  analyticsModels,
  analyticsPlans,
  analyticsSkills,
  analyticsTabs,
  analyticsTopFileExtensions,
  auditLogs,
  byUserAgentEdits,
  byUserAskMode,
  byUserClientVersions,
  byUserCommands,
  byUserMcp,
  byUserModels,
  byUserPlans,
  byUserSkills,
  byUserTabs,
  byUserTopFileExtensions,
  dailyUsage,
  settings,
  spend,
  syncRunItems,
  syncRuns,
  syncState,
  teamMembers,
  usageEvents,
} from "@/db/schema";
import { config } from "@/lib/config";
import { getAdminApiKey } from "@/lib/keys";

/** Set to "1" after the first successful live sync when an admin key is configured. */
export const SETTING_LIVE_CACHE_READY = "ingestion_live_cache_ready";
/** Set to "1" after mock fixture rows were purged ahead of live ingestion. */
export const SETTING_MOCK_CACHE_CLEARED = "ingestion_mock_cache_cleared";

const HOUR_MS = 60 * 60 * 1000;

const INGESTED_TABLES = [
  teamMembers,
  auditLogs,
  dailyUsage,
  spend,
  usageEvents,
  analyticsDau,
  analyticsAgentEdits,
  analyticsTabs,
  analyticsClientVersions,
  analyticsModels,
  analyticsTopFileExtensions,
  analyticsMcp,
  analyticsCommands,
  analyticsPlans,
  analyticsSkills,
  analyticsAskMode,
  analyticsConversationInsights,
  analyticsLeaderboard,
  analyticsBugbot,
  byUserModels,
  byUserAgentEdits,
  byUserTabs,
  byUserTopFileExtensions,
  byUserClientVersions,
  byUserMcp,
  byUserCommands,
  byUserPlans,
  byUserSkills,
  byUserAskMode,
] as const;

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

/** True when syncs target the live Cursor Admin API (key present and CURSOR_MOCK is off). */
export function isLiveIngestionEnabled(): boolean {
  return Boolean(getAdminApiKey()) && !config.mock;
}

/**
 * Dashboards and the Ask Agent read SQLite only after a completed live sync. Fixture/mock
 * rows are never shown, including when no admin key is configured.
 */
export function ingestedCacheReadable(): boolean {
  if (!isLiveIngestionEnabled()) return false;
  return readSetting(SETTING_LIVE_CACHE_READY) === "1";
}

/** Delete all ingested metric tables and reset per-endpoint sync bookkeeping. */
export function purgeIngestedCache(): void {
  for (const table of INGESTED_TABLES) {
    db.delete(table).run();
  }
  db.delete(syncState).run();
  writeSetting(SETTING_LIVE_CACHE_READY, "0");
}

function deleteMockSyncRuns(): void {
  const mockRuns = db.select({ id: syncRuns.id }).from(syncRuns).where(eq(syncRuns.mock, 1)).all();
  for (const { id } of mockRuns) {
    db.delete(syncRunItems).where(eq(syncRunItems.run_id, id)).run();
  }
  db.delete(syncRuns).where(eq(syncRuns.mock, 1)).run();
}

/**
 * Wipe all cached metrics, sync state, and mock sync history. Use when switching to live
 * ingestion or when the user wants fixture data removed entirely.
 */
export function clearAllMockAndFixtureData(): void {
  purgeIngestedCache();
  deleteMockSyncRuns();
  writeSetting(SETTING_MOCK_CACHE_CLEARED, "1");
}

/** Call when a user stores a new admin key so stale fixture rows cannot appear on dashboards. */
export function onAdminKeyConfigured(): void {
  clearAllMockAndFixtureData();
}

function hasMockSyncHistory(): boolean {
  const row = db
    .select({ id: syncRuns.id })
    .from(syncRuns)
    .where(eq(syncRuns.mock, 1))
    .limit(1)
    .get();
  return Boolean(row);
}

/**
 * On live ingestion startup: remove any mock sync history and purge tables if fixtures were
 * ever ingested (or live cache was never marked ready).
 */
export function ensureLiveCacheBaseline(): void {
  if (!isLiveIngestionEnabled()) return;
  if (readSetting(SETTING_MOCK_CACHE_CLEARED) === "1" && !hasMockSyncHistory()) return;
  if (hasMockSyncHistory() || readSetting(SETTING_LIVE_CACHE_READY) !== "1") {
    clearAllMockAndFixtureData();
    return;
  }
  deleteMockSyncRuns();
  writeSetting(SETTING_MOCK_CACHE_CLEARED, "1");
}

/** Mark dashboards readable after a live sync finishes (any outcome). */
export function markLiveCacheReady(): void {
  if (!isLiveIngestionEnabled()) return;
  writeSetting(SETTING_LIVE_CACHE_READY, "1");
}

/**
 * Last time a data type was successfully ingested from the live API. Mock runs are ignored
 * for the hourly poll guard on `daily-usage` and `usage-events`.
 */
export function getLastLiveOkSyncedAt(dataType: string): number | null {
  const row = db
    .select({ started_at: syncRuns.started_at })
    .from(syncRunItems)
    .innerJoin(syncRuns, eq(syncRunItems.run_id, syncRuns.id))
    .where(
      and(
        eq(syncRunItems.data_type, dataType),
        eq(syncRunItems.status, "ok"),
        eq(syncRuns.mock, 0),
        inArray(syncRuns.status, ["ok", "partial"]),
      ),
    )
    .orderBy(desc(syncRuns.started_at))
    .limit(1)
    .get();
  return row?.started_at ?? null;
}

/** True when `lastOkAt` is within one hour of `runStartedAt` (hourly poll guard). */
export function hourlyPollWindowActive(lastOkAt: number | null, runStartedAt: number): boolean {
  if (lastOkAt == null) return false;
  return runStartedAt - lastOkAt < HOUR_MS;
}

/** Whether an incremental hourly-polled job should be skipped (live-aware). */
export function shouldSkipHourlyPoll(dataType: string, runStartedAt: number): boolean {
  if (isLiveIngestionEnabled()) {
    return hourlyPollWindowActive(getLastLiveOkSyncedAt(dataType), runStartedAt);
  }
  const prev = db.select().from(syncState).where(eq(syncState.data_type, dataType)).get();
  return hourlyPollWindowActive(prev?.last_synced_at ?? null, runStartedAt);
}
