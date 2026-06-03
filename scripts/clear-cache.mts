/**
 * Wipe all ingested metrics and mock sync history from analytics.db.
 * Usage: npx tsx scripts/clear-cache.mts
 */
import path from "node:path";
import process from "node:process";
import Module from "node:module";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

type LoadFn = (request: string, parent: unknown, isMain: boolean) => unknown;
const cjsModule = Module as unknown as { _load: LoadFn };
const originalLoad = cjsModule._load;
cjsModule._load = function patchedLoad(request, parent, isMain) {
  if (request === "server-only") return {};
  return originalLoad.call(this, request, parent, isMain);
};

function applyMigrations(): void {
  const dataDir = process.env.DATA_DIR ?? "./data";
  const dbPath = process.env.DATABASE_URL ?? path.join(dataDir, "analytics.db");
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  migrate(drizzle(sqlite), { migrationsFolder: "./drizzle" });
  sqlite.close();
}

async function main(): Promise<void> {
  applyMigrations();
  const { clearAllMockAndFixtureData } = await import("@/lib/sync/cache-policy");
  clearAllMockAndFixtureData();
  console.log("Cleared all ingested tables, sync_state, and mock sync runs.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
