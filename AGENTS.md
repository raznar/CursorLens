# Cursor Lens — agent guide

Self-hosted Next.js app that ingests a Cursor team's Admin + Analytics API data into
local SQLite, renders a read-only dashboard, and embeds the Cursor SDK so a local agent
can answer questions about the data.

## Read the skills first

Project knowledge lives in [`.cursor/skills/`](.cursor/skills/). Before non-trivial work,
read the relevant skill. Start with `architecture-overview`. Skill ↔ code-area map:

| Area you're changing           | Skill to read & update      |
| ------------------------------ | --------------------------- |
| Anything (orientation)         | `architecture-overview`     |
| UI: tokens, components, charts | `design-system`             |
| DB tables / migrations         | `data-model-and-migrations` |
| A new Cursor API endpoint      | `adding-a-cursor-endpoint`  |
| A new dashboard page/metric    | `adding-a-dashboard-page`   |
| Ingestion / rate limits        | `sync-and-rate-limits`      |
| The embedded Ask Agent         | `agent-data-queries`        |
| The skills system itself       | `maintaining-skills`        |

## Architecture (one-way dependencies, enforced by `npm run boundaries`)

```
app / components  ->  lib/sync (domain) + db (data access)
lib/sync          ->  lib/cursor (API client) + db + shared lib
lib/cursor        ->  shared lib only        (never db / sync / ui)
db                ->  shared lib only        (never cursor / sync / ui)
```

## Definition of done (every change)

1. `npm run verify` is green (typecheck + lint + boundaries + tests + check:skills + schema-doc drift).
2. The matching skill in `.cursor/skills/` is updated.
3. If DB schema changed: `npm run gen:schema-doc` regenerated `data/SCHEMA.md`.
4. New behavior ships with tests.

## Key facts

- Two keys: an **Admin/Analytics key** (Basic auth) for ingestion, and a separate
  **`CURSOR_API_KEY`** (user/service-account) for the SDK agent — Admin keys are not
  accepted by the SDK.
- Respect Cursor API rate limits (see `sync-and-rate-limits`). Never hammer the API; the
  dashboard reads from SQLite, not the live API.
- Set `CURSOR_MOCK=1` to develop/test against bundled fixtures with no live key.

## Cursor Cloud specific instructions

- This app requires **Node.js 24** (see `.nvmrc`). The agent runtime's `node` may be Node 22 at `/exec-daemon/node`. Node 24.21.0 is installed under `/usr/local`; use `export PATH="/usr/local/bin:$PATH"` before `npm` or `node`.
- On Linux, `npm ci` fails because the lockfile omits optional `@emnapi/*` packages. Install with `npm ci || npm install` (the same fallback as the Dockerfile). That rewrites `package-lock.json` on disk; leave that rewrite uncommitted unless you intend to refresh the lockfile.
- Live Cursor keys are optional. If `.env` is missing, create it with `CURSOR_LENS_SECRET` (`openssl rand -hex 32`) and `CURSOR_MOCK=1`, then `npm run db:migrate` and `npm run sync -- --backfill --days 14`.
- Dashboards do not render fixture rows. Without a live Admin key and a non-mock sync, pages show "No live data loaded". Mock mode still runs ingestion: Settings shows "Mock mode active", and `POST /api/sync` records runs in SQLite.
- Dev server: `npm run dev -- --hostname 0.0.0.0 --port 3000`. `npm run verify` is the full gate.
