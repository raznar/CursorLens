import "server-only";
import fs from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { config } from "@/lib/config";
import * as schema from "./schema";

/**
 * The server-only SQLite client. The dashboard and sync engine read/write through `db`;
 * nothing else should open the database file. Kept on `globalThis` so Next.js dev HMR
 * reuses one handle instead of leaking a new connection on every reload.
 *
 * Note: this module imports `server-only`, so it must never be imported from a test or a
 * build script. Tests should import `./schema` directly; scripts open their own connection.
 */
function createClient() {
  fs.mkdirSync(config.dataDir, { recursive: true });
  const sqlite = new Database(config.dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  return { sqlite, db };
}

type DbClient = ReturnType<typeof createClient>;

const globalForDb = globalThis as unknown as { __analyticsDbClient?: DbClient };

const client = globalForDb.__analyticsDbClient ?? createClient();
if (!config.isProd) {
  globalForDb.__analyticsDbClient = client;
}

export const sqlite = client.sqlite;
export const db = client.db;
