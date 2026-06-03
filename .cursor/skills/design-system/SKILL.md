---
name: design-system
description: Conventions for the Cursor Lens UI — design tokens, the Tailwind theme, shadcn primitives, the MetricChart chart wrapper, dashboard domain components, and shared formatters. Use when adding or changing any UI: a page, chart, card, table, color, or number/date/money formatting.
---

# Design system

Single token layer drives the whole look; components consume tokens, never raw colors.
Charts go through one wrapper; units go through shared formatters.

## Tokens (the single source of truth)

Defined as HSL CSS variables in `src/app/globals.css` (`:root` = light, `.dark` = dark) and
exposed to Tailwind in `tailwind.config.ts` (`darkMode: "class"`). **Re-theming = edit the
tokens, never the components.**

- Semantic colors: `background`, `foreground`, `card`, `popover`, `primary`, `secondary`,
  `muted`, `accent`, `destructive`, `success`, `warning`, `border`, `input`, `ring`.
- Fixed 8-color chart palette: `--chart-1` … `--chart-8`. Reference via `chartColor(i)` in
  `src/lib/format.ts` (wraps the 8 colors); never hardcode a hex value.
- `--radius` and `--font-sans`/`--font-mono` round out the scale.

Use Tailwind classes (`bg-card`, `text-muted-foreground`, `border-border`) — do not write
inline hex or arbitrary HSL. Theme is toggled by `src/components/theme-provider.tsx`.

## Primitives and components

- shadcn primitives in `src/components/ui/` (`button`, `card`, `table`, `tabs`, `badge`,
  `input`, `select`, `dialog`, `tooltip`, `skeleton`, etc.). Use `cn()` from `src/lib/utils.ts`
  to merge classes.
- Domain components in `src/components/dashboard/`: `KpiCard` (`kpi-card.tsx`),
  `ChartCard` (`chart-card.tsx`, titled shell with a built-in empty state),
  `DataTable`/`QueryTable` (`data-table.tsx` / `query-table.tsx`, sort/search/paginate/CSV),
  `DateRangePicker` (`date-range-picker.tsx`), `TrendBadge` (`trend-badge.tsx`),
  `EmptyState` (`empty-state.tsx`), `SyncStatusBadge` (`sync-status-badge.tsx`).
- Layout/nav in `src/components/layout/` — register pages in `src/components/layout/nav-items.ts`.
  Desktop sidebar collapse: `shell-context.tsx` + topbar `PanelLeft` / `PanelLeftClose` toggle
  (`w-60` ↔ `w-16`, icon-only nav with tooltips). Preference stored in `localStorage`.
- Ask Agent in `src/components/ask/`: collapsed = fixed floating tab mid-right; expanded =
  in-flow `sm:w-96` flex sibling of `main` (shifts center content, no overlay). Panel uses
  `bg-card` with `bg-muted/*` header/footer bands and a faint accent inset edge — not `bg-background`.
  The header includes a compact destructive-hover clear action for the current local transcript.
  The saved-conversations section stays visible at the panel bottom, with an empty state before
  any conversation is saved and compact prompt/response previews that restore the stored exchange
  locally. The compact model picker (`ask-model-select.tsx`) sits above the composer and uses the
  shared `select` primitive. Shared chat hook `use-ask-chat.ts`, bubbles `ask-message.tsx`,
  markdown `markdown.tsx`.

## Charts — always `MetricChart`

`src/components/charts/metric-chart.tsx` is the one chart primitive (line / area / bar /
stackedBar / stackedArea / pie / donut) with shared axes, tooltip, palette, and number
formatting. The
`kind` values come from `ChartKind` in `src/lib/registry.ts`; `valueFormat` from
`ValueFormat` in `src/lib/format.ts`.

`MetricChart` is a client component. Server pages can only pass serializable props, so render
charts through the thin client wrapper `src/components/dashboard/series-chart.tsx`
(`SeriesChart`), which reconstructs the x-axis tick formatter from an `xFormat` string
(`"date"` renders `YYYY-MM-DD` as "Jan 5"). New chart types go inside `MetricChart`, not into
one-off chart components.

## Formatters — always `src/lib/format.ts`

Keep units consistent everywhere:

- `formatNumber` / `formatCompact` (1.2K, 3.4M)
- `formatCents` (integer cents → USD), `formatDollars`
- `formatPercent` (ratio in [0,1] → "22.6%")
- `formatDate` / `formatRelative`, `formatTokens`
- `formatValue(format, value)` dispatches by the registry's `ValueFormat`
  (`"number" | "compact" | "cents" | "percent" | "tokens"`).

Never re-implement money/number/date formatting inline — extend `format.ts` instead.

## Scrollbars

- Dashboard `main` uses `scrollbar-hide` in `globals.css` (scroll still works; no gutter
  beside the Ask Agent tab).
- Radix `ScrollArea` scrollbars fade in on hover / while scrolling (`scroll-area.tsx`).
