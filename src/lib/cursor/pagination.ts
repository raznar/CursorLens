/**
 * Pagination helpers. The Cursor APIs use several different pagination envelopes, so
 * {@link hasNextPage} normalizes them and {@link collectPages} drives a page loop to
 * completion. Pure module — no I/O.
 */
import type { Pagination } from "./types";

/** Hard guard so a malformed `hasNextPage` can never produce an infinite loop. */
export const MAX_PAGES = 2000;

/**
 * Decide whether another page exists, tolerating the various envelopes:
 * - explicit `hasNextPage` boolean (audit-logs, usage-events, by-user, leaderboard, bugbot)
 * - `currentPage`/`page` vs `totalPages`/`numPages` (spend exposes only `totalPages`)
 */
export function hasNextPage(pagination: Pagination | undefined, requestedPage: number): boolean {
  if (!pagination) return false;
  if (typeof pagination.hasNextPage === "boolean") return pagination.hasNextPage;
  const current = pagination.currentPage ?? pagination.page ?? requestedPage;
  const total = pagination.totalPages ?? pagination.numPages;
  if (typeof total === "number") return current < total;
  return false;
}

/**
 * Fetch every page (1-indexed) and flat-map the items together.
 * `fetchPage` returns the raw response for a page; `getItems` and `getPagination` extract
 * the items and the pagination envelope from it.
 */
export async function collectPages<TPage, TItem>(opts: {
  fetchPage: (page: number) => Promise<TPage>;
  getItems: (page: TPage) => TItem[];
  getPagination: (page: TPage) => Pagination | undefined;
  maxPages?: number;
}): Promise<TItem[]> {
  const items: TItem[] = [];
  const max = opts.maxPages ?? MAX_PAGES;
  for (let page = 1; page <= max; page++) {
    const response = await opts.fetchPage(page);
    items.push(...opts.getItems(response));
    if (!hasNextPage(opts.getPagination(response), page)) break;
  }
  return items;
}

/**
 * Like {@link collectPages} but for by-user responses whose `data` is keyed by email.
 * Merges every page's `{ email: rows[] }` map into one accumulator.
 */
export async function collectByUserPages<Row>(opts: {
  fetchPage: (page: number) => Promise<{ data: Record<string, Row[]>; pagination?: Pagination }>;
  maxPages?: number;
}): Promise<Record<string, Row[]>> {
  const merged: Record<string, Row[]> = {};
  const max = opts.maxPages ?? MAX_PAGES;
  for (let page = 1; page <= max; page++) {
    const response = await opts.fetchPage(page);
    for (const [email, rows] of Object.entries(response.data)) {
      (merged[email] ??= []).push(...rows);
    }
    if (!hasNextPage(response.pagination, page)) break;
  }
  return merged;
}
