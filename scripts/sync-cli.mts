/**
 * CLI to run a sync from the terminal / cron.
 *
 *   npm run sync                         # incremental
 *   npm run sync -- --backfill --days 30 # backfill last 30 days
 *   npm run sync -- --only models,spend  # subset of data types
 *   CURSOR_MOCK=1 npm run sync -- --backfill --days 30
 *
 * The sync engine imports `server-only` (transitively via the DB client), which throws
 * outside a React Server Component. We neutralize it with a tiny ESM loader hook, then
 * apply migrations and run the engine. Mock mode (CURSOR_MOCK=1 or no admin key) needs no
 * live key, so this also doubles as the offline ingestion smoke test.
 */
import path from "node:path";
import process from "node:process";
import Module from "node:module";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

// --- Neutralize `server-only` for this process. tsx loads the app's `.ts` files as
// CommonJS, so the marker is pulled via `require()`; patch the CJS loader to return an
// empty module instead of letting it throw. Must run before importing the engine.
type LoadFn = (request: string, parent: unknown, isMain: boolean) => unknown;
const cjsModule = Module as unknown as { _load: LoadFn };
const originalLoad = cjsModule._load;
cjsModule._load = function patchedLoad(request, parent, isMain) {
  if (request === "server-only") return {};
  return originalLoad.call(this, request, parent, isMain);
};

interface CliArgs {
  mode: "incremental" | "backfill";
  days?: number;
  only?: string[];
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { mode: "incremental" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--backfill") args.mode = "backfill";
    else if (arg === "--incremental") args.mode = "incremental";
    else if (arg === "--days") args.days = Number(argv[++i]);
    else if (arg.startsWith("--days=")) args.days = Number(arg.slice("--days=".length));
    else if (arg === "--only") args.only = (argv[++i] ?? "").split(",").filter(Boolean);
    else if (arg.startsWith("--only="))
      args.only = arg.slice("--only=".length).split(",").filter(Boolean);
  }
  return args;
}

function applyMigrations(): void {
  const dataDir = process.env.DATA_DIR ?? "./data";
  const dbPath = process.env.DATABASE_URL ?? path.join(dataDir, "analytics.db");
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  migrate(drizzle(sqlite), { migrationsFolder: "./drizzle" });
  sqlite.close();
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // Ensure the schema exists before the engine opens the DB.
  applyMigrations();

  const { runSync } = await import("@/lib/sync");
  const summary = await runSync({
    mode: args.mode,
    days: args.days,
    only: args.only,
    trigger: "cli",
  });

  console.log(
    `\nSync ${summary.status.toUpperCase()} (${summary.mode}${summary.mock ? ", mock" : ""}) — ` +
      `${summary.totalRows} rows in ${summary.durationMs}ms (run #${summary.runId})\n`,
  );
  const pad = (s: string, n: number) => s.padEnd(n);
  console.log(`${pad("data_type", 26)}${pad("status", 10)}${pad("rows", 8)}duration`);
  console.log("-".repeat(56));
  for (const item of summary.items) {
    const note = item.notModified ? " (304)" : item.error ? ` ${item.error}` : "";
    console.log(
      `${pad(item.dataType, 26)}${pad(item.status, 10)}${pad(String(item.rows), 8)}${item.durationMs}ms${note}`,
    );
  }

  if (summary.status === "error") process.exitCode = 1;
}

main().catch((err) => {
  console.error("sync failed:", err);
  process.exit(1);
});
