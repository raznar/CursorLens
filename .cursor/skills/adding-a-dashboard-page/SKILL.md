---
name: adding-a-dashboard-page
description: How to add or extend a read-only dashboard page in Cursor Lens — a server-only query helper, a force-dynamic RSC page, a nav entry, and the shared KpiCard/ChartCard/SeriesChart/QueryTable components driven by the date range. Use when adding a dashboard page, section, KPI, chart, or table that reads the SQLite cache.
---

# Adding a dashboard page

Pages are React Server Components that read SQLite directly through a query helper and render
with shared components. No page hits the live API. Read `design-system` for the component and
formatter conventions.

## Checklist

```
- [ ] 1. Query helper        src/lib/queries/<area>.ts  (server-only; returns plain serializable data)
- [ ] 2. Page (RSC)          src/app/<area>/page.tsx    (export const dynamic = "force-dynamic")
- [ ] 3. Nav entry           src/components/layout/nav-items.ts
- [ ] 4. (optional) Metric   src/lib/registry.ts section, if the page surfaces a registry metric
- [ ] 5. Tests + npm run verify
```

## 1. Query helper (`src/lib/queries/`)

Add a `server-only` module that selects from `@/db` and returns plain, serializable objects
(no Drizzle handles, no Dates that must round-trip). Accept a `Range` and filter with the
shared helpers in `src/lib/queries/filters.ts`; reshape with the pure helpers in
`src/lib/queries/transforms.ts` (`pivotSeries`, `withShare`, `topN`, `ratio`, …) so the logic
stays unit-testable. See `src/lib/queries/models.ts` for the canonical pattern.

## 2. Page (`src/app/<area>/page.tsx`)

```tsx
export const dynamic = "force-dynamic"; // reads SQLite at request time; never prerender

export default async function AreaPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const range = resolveRange(typeof sp.range === "string" ? sp.range : undefined);
  const data = getAreaData(range);
  return (/* PageHeader + KpiCards + ChartCard/SeriesChart + QueryTable */);
}
```

- Resolve the time window with `resolveRange` from `src/lib/date-range.ts` (presets 7/14/30/90d;
  default 30d). Read it from `?range=` so the `DateRangePicker` works.
- Compose with `PageHeader` (`src/components/layout/page-header.tsx`), `KpiCard`, `ChartCard`,
  and `QueryTable` (`src/components/dashboard/`).
- Charts: pass serializable props to `SeriesChart` (`src/components/dashboard/series-chart.tsx`),
  which wraps `MetricChart`. Use a registry `ChartKind` and a `ValueFormat`; format display
  values with `src/lib/format.ts`. Use `pie` or `donut` for single-series category
  distributions (e.g. conversation insights); time series stay on line/area/bar kinds.
- Use `ChartCard`'s `isEmpty` / `QueryTable`'s `emptyMessage` so empty data degrades gracefully
  (the cache may be empty before the first sync).
- Route transitions use `src/app/loading.tsx` (`DashboardPageSkeleton`) for instant feedback;
  nav links prefetch RSC payloads. Reuse that skeleton if a page needs a custom loading UI.

## 3. Nav entry (`src/components/layout/nav-items.ts`)

Add a `NavItem` (`href`, `label`, `lucide` icon) to `NAV_ITEMS` (primary) or
`SECONDARY_NAV_ITEMS`. The sidebar/topbar render from these arrays.

## 4–5. Finalize

If the page surfaces a registry metric, make sure that metric's `section` matches the page (see
`adding-a-cursor-endpoint`). Add tests for the query helper's transforms, then `npm run verify`.
Update this skill or `design-system` if a pattern changed.
