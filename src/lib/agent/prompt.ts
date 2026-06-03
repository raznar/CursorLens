import fs from "node:fs";
import path from "node:path";
import { formatPageContextForPrompt, type PageContext } from "./page-context";

/**
 * Builds the system prompt for the embedded Ask Agent. The agent is a read-only
 * data analyst that answers questions by running SQL against the local SQLite
 * cache through `data/query.mjs`.
 *
 * The database schema is inlined from `data/SCHEMA.md`, read fresh on every call
 * (never hardcoded) so it always tracks the live Drizzle schema — see the
 * `keep-skills-current` rule / `gen:schema-doc`.
 */

/** Path (relative to the repo root) of the read-only SQL runner the agent shells out to. */
export const QUERY_RUNNER = "data/query.mjs";
/** Path (relative to the repo root) of the generated schema doc we inline. */
export const SCHEMA_DOC = "data/SCHEMA.md";

export interface BuildSystemPromptOptions {
  /** Repo root used to resolve `data/SCHEMA.md`. Defaults to `process.cwd()`. */
  cwd?: string;
  /**
   * Inject the schema markdown directly instead of reading from disk. Primarily
   * for tests; production callers omit it so the doc is read at request time.
   */
  schemaMarkdown?: string;
  /** Lightweight dashboard page context (route, range, section metrics). */
  pageContext?: PageContext;
}

/** Read `data/SCHEMA.md` from disk, returning "" if it is missing/unreadable. */
export function readSchemaDoc(cwd: string = process.cwd()): string {
  try {
    return fs.readFileSync(path.join(cwd, SCHEMA_DOC), "utf8").trim();
  } catch {
    return "";
  }
}

/** Assemble the full system prompt, inlining the current schema doc. */
export function buildSystemPrompt(options: BuildSystemPromptOptions = {}): string {
  const cwd = options.cwd ?? process.cwd();
  const schema = options.schemaMarkdown ?? readSchemaDoc(cwd);
  const schemaSection =
    schema.length > 0
      ? schema
      : "_(schema doc unavailable — list tables with " +
        `\`node ${QUERY_RUNNER} "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"\`` +
        " and inspect columns with `PRAGMA table_info(<table>)`.)_";

  const pageSection = options.pageContext
    ? `\n\n## Current dashboard context\n${formatPageContextForPrompt(options.pageContext)}`
    : "";

  return `You are the Ask Agent for "Cursor Lens" — a read-only data analyst for a
self-hosted SQLite cache of one Cursor team's Admin + Analytics API data. Answer the
admin's natural-language questions about their team's Cursor usage by querying that database.

## How to answer
- Run READ-ONLY SQL via the bundled runner, from the repo root:
    node ${QUERY_RUNNER} "<SQL>" --json
  Use \`--md\` for a markdown table or \`--csv\` for CSV; JSON is the default. The runner opens
  the database read-only and rejects anything that is not SELECT / WITH / EXPLAIN / PRAGMA, so
  only ever write read queries — never attempt INSERT/UPDATE/DELETE/DDL.
- Work iteratively: if you are unsure of a column, inspect it
  (\`PRAGMA table_info(<table>)\`) before writing the final query. Keep result sets bounded
  with \`LIMIT\` and sensible \`ORDER BY\`.
- Prefer the \`usage_events\` and \`by_user_models\` tables for per-user model questions.
  Model names are stored verbatim and look like 'claude-4-opus', 'claude-3-5-sonnet',
  'gpt-4o', etc. Match a family case-insensitively, e.g. \`lower(model) LIKE '%opus%'\`.
- Time math: integer time columns (e.g. \`usage_events.timestamp\`) are epoch MILLISECONDS.
  For "the past N days" use \`timestamp >= (unixepoch('now') - N*86400) * 1000\`. Day-grained
  tables store text dates like '2024-03-18'; compare those with \`date('now', '-N days')\`.
- Money: integer columns are whole cents; the fractional-cent columns
  (\`requests_costs\`, \`total_cents\`, \`charged_cents\`, \`cursor_token_fee\`) are REAL cents.
  Divide by 100 for dollars and round when presenting.
- Booleans are stored as 0/1 integers.

## Output
Present results as a concise GitHub-flavored markdown table, then a single-line takeaway
beneath it. Round numbers, format money as dollars, and keep tables to the columns that
answer the question. If a query returns no rows, say so plainly instead of inventing data.

## Database schema (generated from the live Drizzle schema)
${schemaSection}${pageSection}`;
}
