---
name: agent-data-queries
description: How the embedded Ask Agent answers questions about a Cursor team by running read-only SQL over the local SQLite cache — the query.mjs runner, the generated SCHEMA.md map, the system-prompt builder, the chat route, and the SQL conventions for usage/spend/model questions. Use when changing the Ask Agent, its prompt, the query runner, or answering data questions about the cache.
---

# Agent data queries

The Ask Agent is a read-only data analyst. It answers natural-language questions by running
SQL against the local SQLite cache through a bundled runner — it never mutates data and never
calls the live Cursor API. This skill mirrors the guidance injected into the agent's system
prompt; keep the two in sync.

## How it runs

- UI: global collapsible side panel in `src/components/ask/ask-panel.tsx`, mounted from
  `src/app/layout.tsx` via `src/components/ask/ask-agent-root.tsx`. Chat state lives in
  `src/components/ask/use-ask-chat.ts` (persists across route changes). Saved conversations are
  shown in the panel footer with an empty state and local prompt/response restore actions (no
  agent re-run). The clear action only resets the visible local transcript/draft and aborts any
  active stream; it does not delete saved conversations. `/ask` redirects to `/`.
- Route: `src/app/api/chat/route.ts` (`runtime = "nodejs"`, `force-dynamic`) streams the
  answer as newline-delimited JSON events. Body:
  `{ prompt, modelId?, history?, page?: { pathname, range? } }`.
- Model picker: `src/app/api/chat/models/route.ts` calls `Cursor.models.list({ apiKey })`
  using the configured `CURSOR_API_KEY`, normalizes the result through
  `src/lib/agent/model-options.ts`, and always includes `auto` so the backend can choose.
- Page context: the client sends `pathname` + `?range=`; `src/lib/agent/page-context.ts`
  (`derivePageContext`) maps routes via `src/lib/dashboard-pages.ts` and appends section metrics
  from `src/lib/registry.ts` into the system prompt — never trust client-supplied titles.
- SDK wrapper: `src/lib/agent/client.ts` creates a `@cursor/sdk` **local** agent rooted at the
  repo (`local: { cwd, settingSources: [] }`) so it can shell out to the runner, and streams
  text/tool events. It needs a `CURSOR_API_KEY` (personal/service-account) — team Admin keys
  are rejected by the SDK; failures degrade to a friendly error, never a crash.
- System prompt: `src/lib/agent/prompt.ts` (`buildSystemPrompt`) inlines `data/SCHEMA.md`
  **read fresh on every call** (never hardcoded), optional dashboard context, plus the query
  conventions below.

## The query runner (`data/query.mjs`)

```
node data/query.mjs "SELECT ..." [--json|--md|--csv]
```

Opens `${DATA_DIR:-./data}/analytics.db` **read-only** with `fileMustExist` and rejects
anything that is not `SELECT` / `WITH` / `EXPLAIN` / `PRAGMA`. JSON is the default; `--md`
prints a markdown table, `--csv` prints CSV. This is the only DB access the agent has —
defense-in-depth on top of the read-only connection. Never add a write path here.

## The schema map (`data/SCHEMA.md`)

Generated from the live Drizzle schema by `npm run gen:schema-doc`. It is the agent's table/
column reference. After any schema change, regenerate it (the `verify` gate enforces freshness)
— see `data-model-and-migrations`.

## SQL conventions (these mirror the system prompt)

- **Read-only only** — never `INSERT`/`UPDATE`/`DELETE`/DDL. Inspect uncertain columns with
  `PRAGMA table_info(<table>)` before the final query; bound results with `LIMIT` + `ORDER BY`.
- **Models / per-user usage** — prefer `usage_events` and `by_user_models`. Model names are
  stored verbatim (e.g. `claude-opus-4.5`, `gpt-5`); match a family case-insensitively, e.g.
  `lower(model) LIKE '%opus%'`. "Users who used Opus in the last 90 days" comes from these tables.
- **Time** — integer time columns (e.g. `usage_events.timestamp`) are epoch **milliseconds**:
  `timestamp >= (unixepoch('now') - N*86400) * 1000`. Day-grained tables store text dates like
  `'2024-03-18'`: compare with `date('now', '-N days')`.
- **Money** — integer columns are whole **cents**; `requests_costs`, `total_cents`,
  `charged_cents`, `cursor_token_fee` are `real` cents. Divide by 100 for dollars and round.
- **Booleans** are 0/1 integers.

## Output convention

Answer with a concise GitHub-flavored markdown table, then a one-line takeaway. Round numbers,
format money as dollars, keep to the columns that answer the question, and say so plainly when
a query returns no rows (never invent data). Results are exportable to CSV and savable as
conversations (`src/app/api/reports/route.ts`, `src/components/ask/`), which persist both prompt
and assistant response. Save failures are returned as JSON (`code: "save_failed"`) with a
database-migration hint so stale local schemas show an actionable dialog message.

## Mock data for testing

In mock mode the fixtures (`src/lib/cursor/mock.ts`) include Claude Opus usage for two users,
so Opus/model questions are answerable end-to-end after a mock sync.
