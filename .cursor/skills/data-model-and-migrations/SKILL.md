---
name: data-model-and-migrations
description: Drizzle SQLite conventions for the Cursor Lens cache — column/type rules, the WAL server-only client, the migration workflow, idempotent upserts, and regenerating the schema doc. Use when adding or changing a table or column in src/db/schema.ts, writing a migration, or touching how rows are written.
---

# Data model and migrations

The local SQLite cache mirrors the Cursor API. `src/db/schema.ts` is the source of truth; it
is **pure** (imports only `drizzle-orm/sqlite-core`) so tests and `scripts/gen-schema-doc.mts`
can load it without `server-only`.

## Column conventions (match the existing schema)

- snake_case table and column names.
- Timestamps are `integer` epoch **milliseconds** (a JS number), not SQLite datetimes.
- Day markers are `text` strings like `"2024-03-18"`.
- Money is `integer` **cents**, except the fractional-cent columns from usage events
  (`requests_costs`, `total_cents`, `charged_cents`, `cursor_token_fee`) which use `real`.
- Booleans use `integer("col", { mode: "boolean" })` (stored 0/1).
- Cursor user IDs are `text` in persisted tables because Admin endpoints may return either
  numeric IDs or stable `user_...` strings.
- Single PK via `.primaryKey()`; composite PK via `primaryKey({ columns: [...] })` (used by
  the day/email-keyed analytics tables). Add an `index(...)` for every common filter column.
- Export `$inferSelect` / `$inferInsert` row types for each table (the bottom of the file).

By-user analytics tables mirror their team counterparts with an extra `email` PK column
(e.g. `analytics_models` → `by_user_models`).

## The client (`src/db/client.ts` / `src/db/index.ts`)

- `better-sqlite3` opened with `journal_mode = WAL` and `foreign_keys = ON`, wrapped by
  Drizzle, cached on `globalThis` so dev HMR reuses one handle.
- `src/db/client.ts` imports `server-only`, so it (and `@/db`) must never be imported from a
  test or build script. **Tests import `./schema` directly; scripts open their own connection.**
- App + sync code import from `@/db`: `import { db, schema, type DailyUsage } from "@/db"`.

## Migration workflow (schema changes ship as checked-in SQL)

1. Edit `src/db/schema.ts`.
2. `npm run db:generate` — drizzle-kit writes a new migration into `drizzle/` (config in
   `drizzle.config.ts`).
3. `npm run db:migrate` — applies pending migrations (`scripts/migrate.mts`).
4. `npm run gen:schema-doc` — regenerate `data/SCHEMA.md` (the Ask Agent reads it). The
   `verify` gate fails if `SCHEMA.md` is out of date, so never hand-edit it.
5. Update this skill if a convention changed, and add/adjust tests.

Never edit applied migration SQL by hand; generate a new one.

## Writing rows — `upsertRows` (`src/lib/sync/upsert.ts`)

Every sync job persists through `upsertRows(table, rows)`:

- Idempotent: `ON CONFLICT(primary key) DO UPDATE`, so re-syncing overlapping windows is a
  no-op, not a duplicate. Tables with only PK columns fall back to `DO NOTHING`.
- Rows sharing a PK are de-duped (last wins) before insert (SQLite rejects a single statement
  that touches the same key twice).
- Inserts run in one transaction, chunked to stay under SQLite's bound-variable cap.

Keep ingestion idempotent: pick a primary key that makes a repeat fetch overwrite, not append
(see `usage_events.event_key`, a deterministic dedupe key built by the sync layer).

## Tables at a glance

Admin: `team_members`, `audit_logs`, `daily_usage`, `spend`, `usage_events`. Analytics
team-level + by-user variants (`analytics_*` / `by_user_*`). Ops: `sync_state` (per-data-type
watermark/etag/status), `sync_runs` + `sync_run_items` (run log plus nullable
`progress_current`, `progress_total`, and `progress_message` for in-flight UI feedback),
`settings` (encrypted keys + config), `saved_reports` (saved Ask-Agent conversations). Full
generated reference: `data/SCHEMA.md`.
