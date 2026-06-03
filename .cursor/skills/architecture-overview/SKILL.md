---
name: architecture-overview
description: Entry-point map of the Cursor Lens app — directory layout, the one-way layered dependency rule, the data flow from the Cursor API to SQLite to the dashboard and Ask Agent, and the two-key model. Use first when orienting in this repo, before any non-trivial change, or when deciding which area/skill a task belongs to.
---

# Architecture overview

Self-hosted Next.js app that ingests one Cursor team's Admin + Analytics API data into
local SQLite, renders a read-only dashboard, and embeds the Cursor SDK so a local agent
answers questions about the data. Read this first, then jump to the area-specific skill.

## Directory map

```
.
├── src/
│   ├── app/            Next.js App Router: dashboard pages (RSC) + API routes
│   │                   (api/sync, api/chat, api/reports), settings/; ask/ redirects to /
│   ├── components/     UI only: ui/ (shadcn primitives), charts/, dashboard/, layout/, ask/, settings/
│   ├── db/             Drizzle schema + the server-only SQLite client
│   ├── lib/
│   │   ├── cursor/     Cursor API client: HTTP, rate limiters, window chunking, pagination,
│   │   │               mock fixtures, typed Admin/Analytics wrappers, and Zod response schemas
│   │   ├── sync/       Ingestion engine + per-data-type jobs (admin / analytics-team / analytics-by-user)
│   │   ├── queries/    Server-only read helpers each dashboard page calls
│   │   ├── agent/      Embedded Ask Agent: @cursor/sdk wrapper + system-prompt + page context
│   │   └── config.ts errors.ts logger.ts format.ts registry.ts dashboard-pages.ts crypto.ts keys.ts date-range.ts utils.ts
│   └── instrumentation.ts   node-cron registration for the hourly incremental sync
├── data/              SCHEMA.md (generated), query.mjs (read-only SQL runner), analytics.db (gitignored)
├── drizzle/           Checked-in SQL migrations
└── scripts/           migrate.mts, gen-schema-doc.mts, check-skills.mts, sync-cli.mts
```

## Layered dependency rule (one-way; enforced by `npm run boundaries`)

Defined in `.dependency-cruiser.cjs`. Dependencies flow one way only:

```
app / components  ->  lib/sync (domain) + db (data access) + shared lib
lib/sync          ->  lib/cursor (API client) + db + shared lib
lib/cursor        ->  shared lib only        (never db / sync / ui)
db                ->  shared lib only        (never cursor / sync / ui)
```

Shared lib = `src/lib/config.ts`, `src/lib/errors.ts`, `src/lib/logger.ts`,
`src/lib/format.ts`, `src/lib/registry.ts`. `src/lib/cursor` and `src/db/schema.ts` are
**pure** (no `server-only`) so tests and `scripts/gen-schema-doc.mts` can load them.
Never introduce a back-edge (e.g. importing `@/db` from `src/lib/cursor`) — it fails CI.

## Data flow

```
Cursor API ── lib/cursor (Basic auth, ETag, 429 backoff, paging, Zod-validate)
           ── lib/sync (isolated resumable jobs, idempotent upserts)
           ── SQLite via Drizzle (src/db)
                 ├── lib/queries ── app/ dashboard pages (RSC, force-dynamic)
                 └── data/query.mjs (read-only) ── Ask Agent (src/app/api/chat/route.ts)
```

Dashboards read SQLite, never the live API. Only `src/app/api/sync/route.ts`, the cron in
`src/instrumentation.ts`, and `scripts/sync-cli.mts` trigger ingestion.

## Two-key model

- **Admin/Analytics key** — Basic auth (`admin:*` scope), used for all ingestion. Resolved
  by `src/lib/keys.ts` and passed into the pure client; `src/lib/cursor` never reads keys.
- **`CURSOR_API_KEY`** — a personal/service-account key the SDK requires for the Ask Agent;
  team Admin keys are NOT accepted by the SDK. Dashboards work without it (chat disabled).

Env vars win over stored values; stored keys are encrypted (`src/lib/crypto.ts`). Set
`CURSOR_MOCK=1` (or leave the admin key unset) to run everything against bundled fixtures.

## Where to go next

| Working on                     | Skill                       |
| ------------------------------ | --------------------------- |
| UI: tokens, components, charts | `design-system`             |
| DB tables / migrations         | `data-model-and-migrations` |
| A new Cursor API endpoint      | `adding-a-cursor-endpoint`  |
| A new dashboard page/metric    | `adding-a-dashboard-page`   |
| Ingestion / rate limits        | `sync-and-rate-limits`      |
| The embedded Ask Agent         | `agent-data-queries`        |
| The skills system itself       | `maintaining-skills`        |

The same map lives in `AGENTS.md`. Every change must keep `npm run verify` green and update
the matching skill (see `maintaining-skills`).
