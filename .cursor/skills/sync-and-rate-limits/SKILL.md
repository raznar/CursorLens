---
name: sync-and-rate-limits
description: How ingestion respects the Cursor API in Cursor Lens — per-group rate limiters, Basic auth, ETag/304, 429 backoff honoring Retry-After, 30-day window chunking, the hourly poll guard, and the isolated resumable sync engine with watermarks. Use when changing ingestion, rate limiting, backoff, scheduling, sync jobs, or mock mode.
---

# Sync and rate limits

Ingestion never hammers the API: every request is rate-limited and retried politely, long
ranges are chunked, hourly-aggregated endpoints are throttled, and each data type syncs in
isolation so one failure never aborts the run. The dashboard reads SQLite, not the API.

## Rate limiters (`src/lib/registry.ts` + `src/lib/cursor/ratelimit.ts`)

`RATE_LIMITS` defines per-team-per-minute buckets, one `bottleneck` limiter per
`RateLimitGroup`:

| group                           | per min | endpoints                                             |
| ------------------------------- | ------- | ----------------------------------------------------- |
| `adminGeneral`                  | 20      | members, audit-logs, daily-usage, spend, usage-events |
| `adminSpendLimit`               | 250     | user-spend-limit                                      |
| `analyticsTeam`                 | 100     | most `/analytics/team/*`                              |
| `analyticsByUser`               | 50      | `/analytics/by-user/*`                                |
| `analyticsConversationInsights` | 20      | conversation-insights                                 |

Each limiter uses a reservoir that refreshes every 60s (the primary cap) plus `minTime`
spacing to smooth bursts. Pick a metric's group in its registry entry; the client schedules on
it automatically. Mock mode bypasses the limiter.

## HTTP client (`src/lib/cursor/client.ts`)

`CursorHttp.request()`:

- **Basic auth** — the admin key is the username with an empty password.
- **ETag** — pass `etag` to send `If-None-Match`; a `304` returns `{ notModified: true }` so
  the job can skip unchanged data and keep its stored ETag.
- **429** — retries honoring `Retry-After` / `X-RateLimit-Reset` (`parseRetryAfterMs`), else
  exponential backoff with full jitter; 5xx and network errors also retry (default 4 attempts).
- **Validation** — every 2xx body is Zod-validated against the request's `schema`; failures
  become a typed `ValidationError`. 401/403 become `AuthError` (expected for non-enterprise
  keys on Enterprise-only endpoints) and are surfaced, not fatal. See `src/lib/errors.ts`.

The client is pure: it's handed an API key and never reads `db` / `keys`.

## Window chunking (`src/lib/cursor/windows.ts`)

`audit-logs`, `daily-usage-data`, `filtered-usage-events`, and all analytics endpoints reject
ranges > 30 days. `chunkWindows(start, end)` splits a range into contiguous, non-overlapping,
day-aligned ≤30-day windows; jobs iterate `ctx.chunks`. Pagination within a window is followed
to completion (`src/lib/cursor/pagination.ts`).

## Sync engine (`src/lib/sync/engine.ts`)

`runSync({ mode, days, trigger, only })`:

- Resolves the admin key (mock mode when absent or `CURSOR_MOCK=1`), opens one client, and runs
  every job in `SYNC_JOBS` (`src/lib/sync/jobs/index.ts`) **in isolation** — a thrown error is
  recorded and never aborts the others.
- `mode`: `incremental` (default) re-pulls a trailing `DEFAULT_INCREMENTAL_DAYS` window to catch
  late data; `backfill` re-pulls `days` (config in `src/lib/sync/settings.ts`).
- **Hourly poll guard**: jobs with `hourlyPoll: true` (`daily-usage`, `usage-events`) are skipped
  if synced from the **live** API within the last hour on an incremental run (mock runs do not
  count); backfills bypass the guard.
- Bookkeeping: per-job results → `sync_run_items`; watermark / ETag / status → `sync_state`; the
  run summary → `sync_runs` (includes a `mock` flag — `1` when fixtures were used, not live API
  calls). Idempotent writes go through `upsertRows` (`src/lib/sync/upsert.ts`), so a
  resumed/overlapping sync overwrites rather than duplicates.
- Progress: the engine writes a `running` `sync_run_items` row before each job starts and exposes
  `ctx.reportProgress()` so chunked jobs can update cumulative rows, completed/total windows, and
  a human-readable progress message while they fetch and insert data. `usage-events` reports each
  window as it is fetched and then written to SQLite; the Settings page polls `/api/sync` to show
  those updates during backfills.
- **Live vs mock cache** (`src/lib/sync/cache-policy.ts`): fixture rows are never shown on
  dashboards (`ingestedCacheReadable` is false until a live sync completes). When an admin key
  is configured and `CURSOR_MOCK` is off, `clearAllMockAndFixtureData()` wipes ingested tables +
  mock `sync_runs` history; boot and saving a new admin key call this path. Sync uses fixtures
  only when `CURSOR_MOCK=1` **and** no admin key. CLI: `npm run clear-cache`. The hourly poll
  guard ignores mock runs (only `sync_runs.mock = 0` ok items count).

## Triggers

- Hourly cron registered in `src/instrumentation.ts` (only when a key is configured or mock is on).
- `src/app/api/sync/route.ts` — `POST` triggers a run, `GET` returns status (`getSyncStatus`).
- `scripts/sync-cli.mts` — `npm run sync` for local/CI runs.

## Mock / offline mode (`src/lib/cursor/mock.ts`)

`CURSOR_MOCK=1` (or no admin key) serves deterministic, schema-valid fixtures for every
endpoint through an injected `fetch` shim — the full request/parse/validate/upsert path runs
with no live key. Keep fixtures in sync when adding an endpoint (see `adding-a-cursor-endpoint`).
