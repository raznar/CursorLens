# Cursor Lens

A self-hosted Next.js app that ingests your Cursor team's **Admin** and **Analytics** API
data into a local SQLite cache, renders beautiful **read-only dashboards**, and embeds the
**Cursor SDK** so a local agent can answer natural-language questions about the data.

Everything runs on your own infrastructure: API keys are encrypted at rest, the dashboards
read from SQLite (never the live API), and ingestion is rate-limit-aware so it never hammers
Cursor's API.

---

## Table of contents

- [What it is](#what-it-is)
- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Quick start](#quick-start)
- [How data syncing works](#how-data-syncing-works)
- [Mock / offline mode](#mock--offline-mode)
- [The Ask Agent](#the-ask-agent)
- [The self-maintaining skills system](#the-self-maintaining-skills-system)
- [npm scripts](#npm-scripts)
- [Verification and CI](#verification-and-ci)
- [Docker deployment](#docker-deployment)
- [Security notes](#security-notes)
- [Data directory and schema](#data-directory-and-schema)

---

## What it is

Cursor exposes team usage through two APIs — the **Admin API** (members, spend, raw usage
events, audit logs) and the **Analytics API** (aggregated adoption, model, and feature
metrics). This app:

1. **Ingests** all of the requested endpoints from both APIs into a local SQLite database,
   incrementally and on a schedule, respecting Cursor's rate limits.
2. **Visualizes** the cache through a set of read-only dashboard pages for adoption, models,
   spend, productivity, features, members, and audit.
3. **Answers questions** about the data through an embedded Cursor SDK agent that writes and
   runs read-only SQL against the cache, returns markdown tables, and can export CSV or save
   reusable reports.

The dashboards never call the live Cursor API — they read SQLite — so they stay fast and stay
within rate limits no matter how many people open them.

## Features

### Admin API ingestion

All requested Admin endpoints are ingested:

- **Team members** — roster, roles, removed status (`team_members`).
- **Audit logs** — event stream with actor, type, and payload (`audit_logs`).
- **Daily usage** — per-user/day activity, lines, applies, requests, model mix (`daily_usage`).
- **Spend** — per-user spend, premium requests, and limits (`spend`).
- **Usage events** — granular billable events with model, tokens, and costs (`usage_events`).
- **User spend limits** — per-user hard/monthly limit overrides.

### Analytics API ingestion

All Analytics endpoints are ingested at both the team level and, where available, broken down
by user (the `analytics_*` tables and their `by_user_*` counterparts):

- Models, Ask-mode models, and plan/model usage
- Tab completions and agent edits (acceptance + line stats)
- Commands, MCP tool usage, and skills usage
- Top file extensions and client versions
- DAU (including CLI / Cloud Agent / Bugbot), leaderboards, Bugbot reviews, and
  conversation insights

### Read-only dashboards

Server-rendered pages (React Server Components) that read SQLite directly and degrade
gracefully when the cache is empty:

| Page         | Route           | What it shows                           |
| ------------ | --------------- | --------------------------------------- |
| Overview     | `/`             | Headline KPIs across all areas          |
| Adoption     | `/adoption`     | DAU, active users, client versions      |
| Models       | `/models`       | Model mix and trends (team + by user)   |
| Spend        | `/spend`        | Cost trends, top spenders, limits       |
| Productivity | `/productivity` | Tabs, edits, accept ratios, lines       |
| Features     | `/features`     | Commands, MCP, skills, Bugbot, insights |
| Members      | `/members`      | Team roster and per-user activity       |
| Audit        | `/audit`        | Searchable audit-log table              |

Every page is driven by a shared date-range picker (7 / 14 / 30 / 90 day presets) and built
from a single design-token layer plus reusable `KpiCard` / `ChartCard` / `SeriesChart` /
`QueryTable` components.

### Embedded Ask Agent + custom reports

- A chat page at `/ask` backed by the Cursor SDK runs **read-only SQL** over the cache and
  answers in concise markdown tables.
- Results export to **CSV** and can be saved as **reusable reports** (re-runnable later).
- The agent's only database access is a hardened read-only query runner — it cannot mutate
  data and never calls the live Cursor API.

### Rate-limit-aware caching

- Per-endpoint-group rate limiters (token-bucket reservoirs) keep ingestion within Cursor's
  documented per-minute caps.
- ETag / `304 Not Modified` support skips unchanged data; `429` responses are retried honoring
  `Retry-After` with jittered exponential backoff.
- Long ranges are chunked into 30-day windows; hourly-aggregated endpoints are throttled by a
  poll guard so repeated incremental runs don't re-pull within the hour.

## Architecture

- High-level orientation lives in [`AGENTS.md`](AGENTS.md).
- Deep, area-specific documentation lives in [`.cursor/skills/`](.cursor/skills/) — start with
  the `architecture-overview` skill.

The codebase enforces a strict one-way dependency rule (validated by `npm run boundaries`):

```
app / components  ->  lib/sync (domain) + db (data access) + shared lib
lib/sync          ->  lib/cursor (API client) + db + shared lib
lib/cursor        ->  shared lib only        (never db / sync / ui)
db                ->  shared lib only        (never cursor / sync / ui)
```

Data flows one direction: Cursor API → `lib/cursor` (auth, validation, backoff) →
`lib/sync` (idempotent jobs) → SQLite via Drizzle → `lib/queries` → dashboard pages, and
separately → `data/query.mjs` → the Ask Agent.

## Prerequisites

- **Node.js 24** (the project is developed and tested on Node 24).
- **A Cursor team on the Enterprise plan.** The Analytics API and several Admin endpoints are
  **Enterprise-only**; non-Enterprise keys receive `401`/`403` on those endpoints. This is
  handled gracefully — failures are surfaced per data type in the sync status, not fatal.
- **Two separate keys** (the "two-key model"):
  - **Admin / Analytics API key** — used for all data **ingestion** via HTTP Basic auth
    (`admin:*` scope). Create it in your Cursor team's Admin → API Keys settings. Set as
    `CURSOR_ADMIN_API_KEY` (or enter it in the in-app Settings page).
  - **`CURSOR_API_KEY`** — a personal or service-account key the **Cursor SDK** requires for
    the Ask Agent. Team Admin keys are **not** accepted by the SDK. The dashboards work fine
    without this key; only the chat agent is disabled.
- **SDK agent-runtime caveat.** The Ask Agent uses the Cursor SDK's **local runtime**, which
  spawns Cursor's agent on the host machine. It therefore runs best where Cursor's agent
  runtime is available (e.g. `npm run dev` / `npm run start` on a developer machine or a host
  with Cursor installed). It will **not** function inside the minimal Docker image — see
  [Docker deployment](#docker-deployment).

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Create your environment file
cp .env.example .env

# 3. Generate the required encryption secret and put it in .env
openssl rand -hex 32
# -> paste the value into CURSOR_LENS_SECRET in .env

# 4. Create the SQLite database / apply migrations
npm run db:migrate

# 5. Start the dev server
npm run dev
```

Then open <http://localhost:3000>.

To try it **without any Cursor key**, set `CURSOR_MOCK=1` in `.env` and run a sync (see
[Mock / offline mode](#mock--offline-mode)). Otherwise, add your keys (env vars take
precedence over values entered in the Settings page) and trigger a sync from
**Settings → Sync now**.

### Environment variables

| Variable                 | Required           | Purpose                                                                          |
| ------------------------ | ------------------ | -------------------------------------------------------------------------------- |
| `CURSOR_LENS_SECRET`     | Yes                | Encrypts API keys at rest in SQLite (`openssl rand -hex 32`).                    |
| `ANALYTICS_AGENT_SECRET` | Legacy fallback    | Previous name for `CURSOR_LENS_SECRET`; still accepted for existing deployments. |
| `CURSOR_ADMIN_API_KEY`   | For live ingestion | Admin/Analytics key (Basic auth) used to ingest data.                            |
| `CURSOR_API_KEY`         | For the Ask Agent  | Personal/service-account SDK key for chat.                                       |
| `DATA_DIR`               | No                 | Where the DB + `SCHEMA.md` + `query.mjs` live (default `./data`).                |
| `CURSOR_MOCK`            | No                 | `1` serves bundled fixtures instead of the live API.                             |
| `CURSOR_API_BASE_URL`    | No                 | Override the API base (default `https://api.cursor.com`).                        |
| `LOG_LEVEL`              | No                 | `trace` \| `debug` \| `info` \| `warn` \| `error` (default `info`).              |

Keys may also be entered in the **Settings** page; environment variables always win.

## How data syncing works

Ingestion can be triggered four ways, all of which run the same isolated, resumable sync
engine (each data type syncs independently, so one failure never aborts the rest):

- **Hourly cron** — registered automatically at server boot (only when an admin key is
  configured or mock mode is on) via `src/instrumentation.ts`.
- **Settings → "Sync now"** — a button in the in-app Settings page.
- **`POST /api/sync`** — triggers a run; `GET /api/sync` returns current status.
- **`npm run sync`** — a CLI for local or CI runs:

```bash
npm run sync                          # incremental (re-pulls a trailing window)
npm run sync -- --backfill --days 30  # backfill the last 30 days
npm run sync -- --only models,spend   # a subset of data types
```

Incremental runs re-pull a short trailing window to catch late-arriving data; backfills
re-pull a longer range. Writes are idempotent (`ON CONFLICT … DO UPDATE`), so overlapping or
resumed syncs overwrite rather than duplicate. Per-run bookkeeping is recorded in
`sync_runs` / `sync_run_items`, and per-data-type watermarks/ETags/status in `sync_state`.

## Mock / offline mode

Set `CURSOR_MOCK=1` (or simply leave the admin key unset) to run the **entire**
request → parse → validate → upsert path against bundled, schema-valid fixtures — no live key
required. This is how the full test suite runs, and it lets you explore the app offline:

```bash
rm -f data/analytics.db*
npm run db:migrate
CURSOR_MOCK=1 npm run sync -- --backfill --days 14
npm run dev
```

The fixtures include Claude Opus usage for multiple users, so model/Opus questions are
answerable end-to-end after a mock sync.

## The Ask Agent

Open `/ask` (requires `CURSOR_API_KEY`). Ask plain-English questions; the agent inspects the
schema, writes read-only SQL, runs it through the bundled `data/query.mjs` runner, and replies
with a markdown table plus a one-line takeaway. Answers are exportable to CSV and savable as
reports.

Example prompts:

- "All users who used Opus in the past 90 days."
- "Top 10 spenders this month, with dollar amounts."
- "Daily active users over the last 30 days."
- "Which models grew the most in usage week over week?"
- "Tab acceptance rate by user for the last 14 days."
- "Audit events of type `org.sso.updated` in the last week."

The agent is read-only by construction: the query runner opens the database with
`fileMustExist` in read-only mode and rejects anything that is not `SELECT` / `WITH` /
`EXPLAIN` / `PRAGMA`.

## The self-maintaining skills system

Project knowledge is encoded as **agent skills** under [`.cursor/skills/`](.cursor/skills/),
one per area (architecture, design system, data model, ingestion, dashboards, the Ask Agent,
and adding endpoints). These are living docs:

- An always-applied rule and the [`AGENTS.md`](AGENTS.md) entry point direct contributors (and
  AI agents) to read the relevant skill before non-trivial work and to **update it in the same
  change**.
- `npm run check:skills` fails the build if any skill references a file path that no longer
  exists, so docs can't silently drift from the code.
- `npm run gen:schema-doc` regenerates [`data/SCHEMA.md`](data/SCHEMA.md) from the Drizzle
  schema; `npm run verify` fails if it is stale. The Ask Agent reads this file at request time.

## npm scripts

| Script                   | Description                                                     |
| ------------------------ | --------------------------------------------------------------- |
| `npm run dev`            | Start the Next.js dev server.                                   |
| `npm run build`          | Production build.                                               |
| `npm run start`          | Start the production server (after `build`).                    |
| `npm run db:migrate`     | Apply Drizzle migrations to the SQLite DB.                      |
| `npm run db:generate`    | Generate a new migration from `src/db/schema.ts`.               |
| `npm run db:studio`      | Open Drizzle Studio against the DB.                             |
| `npm run gen:schema-doc` | Regenerate `data/SCHEMA.md` (`-- --check` to verify freshness). |
| `npm run sync`           | Run ingestion from the CLI (see syncing above).                 |
| `npm run check:skills`   | Verify every skill references only real paths.                  |
| `npm run typecheck`      | `tsc --noEmit`.                                                 |
| `npm run lint`           | ESLint (`eslint-config-next`).                                  |
| `npm run boundaries`     | Enforce the layered dependency rule.                            |
| `npm run test`           | Run the Vitest suite.                                           |
| `npm run verify`         | The full gate (see below).                                      |

## Verification and CI

`npm run verify` is the definition of done for any change. It runs, in order:

```
typecheck  ->  lint  ->  boundaries  ->  test  ->  check:skills  ->  schema-doc drift check
```

Keep it green. New behavior ships with tests, and any change in a documented area updates the
matching skill in `.cursor/skills/`.

## Docker deployment

A multi-stage `Dockerfile` and `docker-compose.yml` are included for running the
**dashboards + ingestion** in a container.

```bash
# Set CURSOR_LENS_SECRET (and your keys, or CURSOR_MOCK=1) in .env first
docker compose up --build
```

This builds the app on `node:24-bookworm-slim` (with the toolchain needed for the
`better-sqlite3` native addon), applies database migrations on container start, and serves on
**port 3000**. The SQLite database is persisted to a named volume mounted at `/app/data`.

> **Ask Agent caveat:** the embedded chat agent uses the Cursor SDK's local runtime, which
> needs Cursor's agent runtime on the host and **does not run inside this minimal container**.
> Docker is intended for the dashboards and ingestion. To use the Ask Agent, run the app with
> `npm run dev` / `npm run start` on a host where Cursor is installed.

See [`.env.example`](.env.example) for the full list of supported environment variables.

## Security notes

- **Keys encrypted at rest.** API keys entered through the Settings UI are encrypted in SQLite
  using `CURSOR_LENS_SECRET`; they are never stored in plaintext.
- **Read-only agent access.** The Ask Agent's only database access is a read-only connection
  through `data/query.mjs`, which rejects any non-read statement — defense in depth on top of
  the read-only connection.
- **Local-first.** Dashboards read your local SQLite cache, not the live Cursor API. Nothing
  leaves your infrastructure except the authenticated ingestion calls to Cursor's API.
- **Validated inputs.** Every API response is Zod-validated, so upstream schema changes surface
  as clear validation errors rather than silent data corruption.
- The database files (`data/*.db*`) and `.env` are gitignored.

## Data directory and schema

The `data/` directory holds:

- `analytics.db` — the SQLite cache (gitignored; created by `npm run db:migrate`).
- [`data/SCHEMA.md`](data/SCHEMA.md) — the generated, human-readable schema reference (also
  consumed by the Ask Agent). Regenerate with `npm run gen:schema-doc`; never edit by hand.
- `data/query.mjs` — the hardened read-only SQL runner the Ask Agent uses.

Override the location with `DATA_DIR` if you want the database elsewhere.
