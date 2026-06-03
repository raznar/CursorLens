---
name: maintaining-skills
description: Meta-skill for keeping the Cursor Lens project skills, SCHEMA.md, and the verify gate current as the code evolves — the skill↔code-area map, the update workflow, the check:skills path rule, and how to add a new skill. Use when changing code in a documented area, editing skills, or adding a new skill or subsystem.
---

# Maintaining skills

Project knowledge lives in `.cursor/skills/`. Skills are living docs: when you change an area's
behavior or conventions, update that area's `SKILL.md` **in the same change** so docs never
drift from code. This is part of the definition of done, enforced by an always-applied rule
(`.cursor/rules/keep-skills-current.mdc`), the `AGENTS.md` entry point, and a `stop` hook
(`.cursor/hooks.json`).

## Skill ↔ code-area map (mirror of `AGENTS.md`)

| Area you're changing                                         | Skill to read & update      |
| ------------------------------------------------------------ | --------------------------- |
| Anything (orientation)                                       | `architecture-overview`     |
| UI: tokens, components, charts (`src/app`, `src/components`) | `design-system`             |
| DB tables / migrations (`src/db/schema.ts`, `drizzle/`)      | `data-model-and-migrations` |
| A new Cursor API endpoint (`src/lib/cursor`)                 | `adding-a-cursor-endpoint`  |
| A new dashboard page/metric (`src/app`, `src/lib/queries`)   | `adding-a-dashboard-page`   |
| Ingestion / rate limits (`src/lib/sync`, `src/lib/cursor`)   | `sync-and-rate-limits`      |
| The embedded Ask Agent (`src/lib/agent`, `data/query.mjs`)   | `agent-data-queries`        |
| The skills system itself                                     | `maintaining-skills`        |

Keep this table and the one in `AGENTS.md` identical.

## Update workflow

1. Make the code change.
2. Update the matching `SKILL.md` (above) in the same change — keep it accurate and tight.
3. If `src/db/schema.ts` changed: `npm run gen:schema-doc` to refresh `data/SCHEMA.md`
   (the Ask Agent reads it; the verify gate fails if it's stale).
4. `npm run check:skills` — flags any skill referencing a path that no longer exists.
5. `npm run verify` must be green (typecheck + lint + boundaries + tests + check:skills +
   SCHEMA drift). The `stop` hook nudges this before you finish.

## The check:skills path rule (important)

`scripts/check-skills.mts` scans every `SKILL.md` under `.cursor/skills/` and extracts paths
referenced in markdown links `](...)` or inline-code backticks. A token is treated as a repo
path when it starts with `src/`, `scripts/`, `data/`, `drizzle/`, `.cursor/`, `AGENTS.md`, or
`README.md` **and** contains a `/` or `.`. If such a path doesn't exist on disk, the check
fails.

Therefore: **only reference files/dirs that exist.** When you rename or move a file, update the
skills that cite it. To mention a path that may not exist yet, describe it in prose without
backticks, or reference a sibling skill by bare name (e.g. `design-system`) — bare names have
no `/` or `.`, so they're never validated as paths.

## Adding a new skill or subsystem

1. Add a new subfolder under `.cursor/skills/` containing a `SKILL.md` (folder name = the skill
   name, lowercase-hyphen). Frontmatter `description` is third-person with WHAT + WHEN trigger
   terms; omit `disable-model-invocation` so the skill auto-invokes from ambient context.
2. Keep the body well under 500 lines; reference only real paths; use progressive disclosure
   (link one level deep to a `reference.md` if needed).
3. Register it in this map **and** in `AGENTS.md`.
4. Run `npm run check:skills` (it reports the skill count) and `npm run verify`.
