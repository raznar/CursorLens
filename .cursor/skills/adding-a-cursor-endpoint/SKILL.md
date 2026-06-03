---
name: adding-a-cursor-endpoint
description: Step-by-step checklist for ingesting a new Cursor Admin or Analytics API endpoint into the Cursor Lens cache — Zod schema, typed client wrapper, registry entry, Drizzle table + migration, and a sync job. Use when wiring a new Cursor API endpoint or data type into ingestion.
---

# Adding a Cursor endpoint

Wire a new endpoint end-to-end. Each layer is one-directional (see `architecture-overview`):
types → client wrapper → registry → table/migration → sync job. Read
`sync-and-rate-limits` for client/limiter details and `data-model-and-migrations` for schema rules.

## Checklist

```
- [ ] 1. Zod schema + inferred type      src/lib/cursor/types.ts
- [ ] 2. Typed client wrapper             src/lib/cursor/admin.ts | analytics.ts (+ export in index.ts)
- [ ] 3. Registry entry                   src/lib/registry.ts (METRICS)
- [ ] 4. Drizzle table + migration        src/db/schema.ts  ->  npm run db:generate / db:migrate
- [ ] 5. Sync job                         src/lib/sync/jobs/{admin,analytics-team,analytics-by-user}.ts
- [ ] 6. Regenerate schema doc            npm run gen:schema-doc
- [ ] 7. Tests + npm run verify
```

## 1. Zod schema (`src/lib/cursor/types.ts`)

Add a `*ResponseSchema` plus its inferred `type`. Be lenient on optionality (`.nullish()`)
since the API omits fields, but strict on the shapes you persist. This is the single source of
truth for the endpoint's response; the client validates every response against it. When team
and by-user variants of the same metric differ (e.g. `top-file-extensions`), use separate row
schemas — the by-user live API may omit `event_date` on each row.

## 2. Typed client wrapper (`src/lib/cursor/`)

Add a function in `admin.ts` (Admin API) or `analytics.ts` (Analytics API) that calls
`http.request({ method, path, group, schema, query|body, etag? })` and returns plain data.
Follow pagination to completion with `collectPages` / `collectByUserPages`
(`src/lib/cursor/pagination.ts`). Pick the right `group` (see step 3). Export it from
`src/lib/cursor/index.ts` and, if it's a new facade method, add it to the `CursorClient`
interface there. Add a fixture branch in `src/lib/cursor/mock.ts` so offline mode works.

## 3. Registry entry (`src/lib/registry.ts`)

Append a `MetricDef` to `METRICS` with: `id` (also the sync `dataType`), `label`,
`description`, `source` (`admin` | `analytics-team` | `analytics-by-user`), `endpoint`,
`rateLimitGroup` (a `RateLimitGroup` key in `RATE_LIMITS`), `section`, `defaultChart`,
`valueFormat`, and `hasByUser` / `enterpriseOnly` when relevant.

## 4. Table + migration (`src/db/schema.ts`)

Add a `sqliteTable` following the column conventions in `data-model-and-migrations` (snake_case,
epoch-ms integers, cents vs `real`, boolean mode, a PK that makes re-fetch idempotent, indices),
then `npm run db:generate` and `npm run db:migrate`.

## 5. Sync job (`src/lib/sync/jobs/`)

Add a `SyncJob` (`dataType`, `metricId`, `label`, `enterpriseOnly?`, `hourlyPoll?`, `run`).
For the common team-analytics shape, reuse the `teamDailyJob` factory in `analytics-team.ts`
(supply `schema`, `table`, `mapRows`, `watermark`); by-user metrics use the `byUserJob` factory
in `analytics-by-user.ts` (its `dataType` is `by-user/<metricId>`). In `run`, iterate
`ctx.chunks` (≤30-day windows), thread the ETag when there's a single chunk, transform with
helpers from `jobs/helpers.ts`, and persist via `upsertRows`. Register the job in its
`analyticsTeamJobs` / `analyticsByUserJobs` / `adminJobs` array so `src/lib/sync/jobs/index.ts`
picks it up.

## 6–7. Finalize

Run `npm run gen:schema-doc` to refresh `data/SCHEMA.md`, add unit tests (schema parse,
transform, and the registry entry), then `npm run verify` (typecheck + lint + boundaries +
tests + check:skills + schema drift). Update this skill or `data-model-and-migrations` if a
convention changed.
