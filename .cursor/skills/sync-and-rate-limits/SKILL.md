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
`RateLimitGroup`. Admin API limits are scoped **per endpoint** (API overview: "most are
scoped to a single endpoint"), so every Admin route has its own bucket; Analytics limits are
shared per family:

| group                             | per min | endpoints                                  |
| --------------------------------- | ------- | ------------------------------------------ |
| `adminMembers`                    | 20      | `GET /teams/members`                       |
| `adminAuditLogs`                  | 20      | `GET /teams/audit-logs`                    |
| `adminDailyUsage`                 | 20      | `POST /teams/daily-usage-data`             |
| `adminSpend`                      | 20      | `POST /teams/spend`                        |
| `adminUsageEvents`                | 60      | `POST /teams/filtered-usage-events`        |
| `adminGroups`                     | 20      | `/teams/groups`, `/teams/directory-groups` |
| `adminSpendLimit`                 | 250     | user-spend-limit                           |
| `analyticsTeam`                   | 100     | shared by `/analytics/team/*`              |
| `analyticsByUser`                 | 50      | shared by `/analytics/by-user/*`           |
| `analyticsConversationInsights`   | 20      | conversation-insights                      |
| `aiCodeCommits` / `aiCodeChanges` | 20      | `/analytics/ai-code/{commits,changes}`     |

Each limiter uses a reservoir that refreshes every 60s (the primary cap) plus `minTime`
spacing to smooth bursts. Pick a metric's group in its registry entry; the client schedules on
it automatically. Mock mode bypasses the limiter.

Limiters are **process-wide** (`getSharedLimiters()`, stored on `globalThis`): limits are per
team, so every client in the process draws from the same buckets. Tests inject their own via
`CursorClientOptions.limiters`; `resetSharedLimiters()` drops the singleton. If a team turns
out to share one Admin bucket after all, collapse the `admin*` entries in `RATE_LIMITS` — the
429 path (below) is the backstop either way.

Page sizes follow the documented maxima: usage-events 1000, daily-usage 1000, audit-logs 500,
spend 500, by-user 500, leaderboard 500, bugbot 250 (constants in `admin.ts` / `analytics.ts`).

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
ranges > 30 days. `chunkWindows(start, end)` splits a range into contiguous, day-aligned
≤30-day windows; jobs iterate `ctx.chunks`. Both bounds are **inclusive**: `start` is
00:00:00.000 UTC and `end` is 23:59:59.999 UTC of the window's last day (the final window ends
at the range end). This matters for `filtered-usage-events` and `audit-logs`, which compare
timestamps at millisecond precision and do not round `endDate` up — windows that ended at
midnight silently dropped the last day of every chunk. Day-granular endpoints only read the
calendar date.

## Pagination (`src/lib/cursor/pagination.ts`)

`streamPages()` fetches page 1 alone to learn the total (`totalPages`/`numPages`, or
`totalCount ÷ pageSize` for the AI Code Tracking envelope), then keeps
`DEFAULT_PAGE_CONCURRENCY` (4) pages in flight through the limiter and yields pages in order.
Latency no longer serializes with the limiter's spacing, and consumers persist each page as it
lands, so memory is bounded and a failure loses one page rather than a whole window. Envelopes
with only `hasNextPage` fall back to a sequential walk. `collectPages()` /
`collectByUserPages()` gather everything for small endpoints. The client facade exposes
`admin.{usageEventPages,auditLogPages,dailyUsagePages}` and `analytics.byUserPages` as
page-at-a-time generators; jobs upsert per page and report `page k/N` progress.

## Coverage and resumable backfills (`src/lib/sync/plan.ts`, `coverage.ts`)

`sync_coverage(data_type, window_start, window_end, etag, rows, synced_at, run_id)` records
every window a **windowed** job (`SyncJob.windowed: true`) fully ingested — complete UTC days
only, never today. Jobs call `ctx.markCovered(window, { etag, rows })` after a window's last
page is written; the engine plans each windowed job's `ctx.chunks` with `planWindows()`:

- **incremental** / `force: true` → the full range, as before;
- **backfill** → only days that are uncovered **or** inside the trailing
  `DEFAULT_INCREMENTAL_DAYS` refresh window, grouped into contiguous runs and re-chunked to ≤30
  days. An empty plan records the job as `skipped` ("Already covered") without any request.

So a crashed backfill resumes at the first uncovered window, and re-running "Backfill" costs
only the trailing days. `POST /api/sync { force: true }` / `npm run sync -- --backfill --force`
re-pulls everything; "Clear cached data" also wipes coverage. Analytics jobs pass
`ctx.etagFor(window)` (the ETag stored with an identically bounded coverage row) as
`If-None-Match`, so forced re-pulls of unchanged history return 304s that cost no rate limit.

## Sync engine (`src/lib/sync/engine.ts`)

`startSync({ mode, days, trigger, only })` starts a run **in the background** and returns
`{ runId, promise }`; `runSync(...)` is `startSync(...).promise` for callers that want to wait
(CLI, tests). Exactly **one run per process**: a second `startSync` while one is active throws
`BusyError` (409). The cron logs and skips; `POST /api/sync` answers `409 { runId }`. The lock
lives on `globalThis` and is in-process only — `npm run sync` from another process is not
coordinated with the server.

- `reconcileInterruptedRuns()` runs at boot (`src/instrumentation.ts`) and before each start:
  any `sync_runs` row still `running` belongs to a process that died, so its `running` items
  and `sync_state` rows become `error: Interrupted…` and the run is closed as `partial`/`error`.
- Resolves the admin key (mock mode when absent or `CURSOR_MOCK=1`), opens one client, and runs
  every job in `SYNC_JOBS` (`src/lib/sync/jobs/index.ts`) **in isolation** — a thrown error is
  recorded and never aborts the others. The returned promise never rejects; an engine-level
  failure is folded into the summary as an `engine` item.
- **Lanes**: jobs are grouped by `SyncJob.rateLimitGroup` (default: the registry metric's
  group). Jobs in one lane share a bucket and run sequentially; lanes run concurrently
  (`Promise.all`), so wall time is the longest lane rather than the sum. SQLite writes stay
  safe because better-sqlite3 is synchronous — lanes only interleave at `await`s on the network.
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

- Hourly cron registered in `src/instrumentation.ts` (only when a key is configured or mock is
  on); it skips while a run is active.
- `src/app/api/sync/route.ts` — `POST` starts a run and returns `202 { runId }` (pass
  `wait: true` to block for the summary; `409` while busy); `GET` returns status
  (`getSyncStatus`, including `active`). The Settings page polls `GET` and broadcasts
  `SYNC_RUN_STATE_EVENT` so the Sync/Backfill buttons stay disabled until the run finishes.
- `scripts/sync-cli.mts` — `npm run sync` for local/CI runs (awaits via `runSync`).

## Mock / offline mode (`src/lib/cursor/mock.ts`)

`CURSOR_MOCK=1` (or no admin key) serves deterministic, schema-valid fixtures for every
endpoint through an injected `fetch` shim — the full request/parse/validate/upsert path runs
with no live key. Keep fixtures in sync when adding an endpoint (see `adding-a-cursor-endpoint`).
