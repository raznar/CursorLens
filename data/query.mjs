#!/usr/bin/env node
/**
 * Read-only SQL runner over the local analytics SQLite cache. This is the tool the embedded
 * Ask Agent uses to read the database — it never writes.
 *
 * Usage:
 *   node data/query.mjs "SELECT * FROM team_members LIMIT 5"          # JSON (default)
 *   node data/query.mjs "SELECT email, role FROM team_members" --md   # markdown table
 *   node data/query.mjs "SELECT * FROM spend" --csv                   # CSV
 *
 * The database path is ${DATA_DIR:-./data}/analytics.db (or $DATABASE_URL). The connection is
 * opened read-only with fileMustExist, and a guard rejects anything that is not a read query
 * (only SELECT / WITH / EXPLAIN / PRAGMA are allowed).
 */
import path from "node:path";
import process from "node:process";
import Database from "better-sqlite3";

/** Only read statements are permitted; defense-in-depth on top of the readonly connection. */
const READ_ONLY_PREFIX = /^\s*(?:SELECT|WITH|EXPLAIN|PRAGMA)\b/i;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseArgs(argv) {
  let format = "json";
  const rest = [];
  for (const arg of argv.slice(2)) {
    if (arg === "--md" || arg === "--markdown") format = "md";
    else if (arg === "--json") format = "json";
    else if (arg === "--csv") format = "csv";
    else if (arg === "--help" || arg === "-h") format = "help";
    else rest.push(arg);
  }
  return { sql: rest.join(" ").trim(), format };
}

function cellToString(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function toCsv(rows, columns) {
  const escape = (value) => {
    const s = cellToString(value);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map(escape).join(",")];
  for (const row of rows) lines.push(columns.map((c) => escape(row[c])).join(","));
  return lines.join("\n") + "\n";
}

function toMarkdown(rows, columns) {
  if (columns.length === 0) return "_(no columns)_\n";
  const escape = (value) => cellToString(value).replace(/\|/g, "\\|").replace(/\n/g, " ");
  const header = `| ${columns.join(" | ")} |`;
  const divider = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${columns.map((c) => escape(row[c])).join(" | ")} |`);
  return [header, divider, ...body].join("\n") + "\n";
}

function columnNames(stmt, rows) {
  if (rows.length > 0) return Object.keys(rows[0]);
  try {
    return stmt.columns().map((c) => c.name);
  } catch {
    return [];
  }
}

function main() {
  const { sql, format } = parseArgs(process.argv);

  if (format === "help" || !sql) {
    const usage = 'Usage: node data/query.mjs "SELECT ..." [--json|--md|--csv]';
    if (format === "help") {
      console.log(usage);
      return;
    }
    fail(usage);
  }

  if (!READ_ONLY_PREFIX.test(sql)) {
    fail("Refusing to run: only SELECT / WITH / EXPLAIN / PRAGMA statements are allowed.");
  }

  const dataDir = process.env.DATA_DIR ?? "./data";
  const dbPath = process.env.DATABASE_URL ?? path.join(dataDir, "analytics.db");

  let db;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
  } catch (err) {
    fail(`Could not open database at ${dbPath}: ${err.message}`);
  }

  try {
    const stmt = db.prepare(sql);
    let rows;
    try {
      rows = stmt.all();
    } catch (err) {
      // Some read statements (e.g. certain PRAGMAs) return no result set.
      if (/does not return data/i.test(err.message)) rows = [];
      else throw err;
    }
    const columns = columnNames(stmt, rows);

    if (format === "csv") process.stdout.write(toCsv(rows, columns));
    else if (format === "md") process.stdout.write(toMarkdown(rows, columns));
    else process.stdout.write(JSON.stringify(rows, null, 2) + "\n");
  } catch (err) {
    fail(`Query failed: ${err.message}`);
  } finally {
    db.close();
  }
}

main();
