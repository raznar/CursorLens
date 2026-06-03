/**
 * Applies Drizzle migrations from ./drizzle to the local SQLite database.
 * Usage: npm run db:migrate
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const dataDir = process.env.DATA_DIR ?? "./data";
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = process.env.DATABASE_URL ?? path.join(dataDir, "analytics.db");
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");

const db = drizzle(sqlite);
migrate(db, { migrationsFolder: "./drizzle" });
sqlite.close();

console.log(`Migrations applied to ${dbPath}`);
