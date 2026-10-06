/**
 * Pagination helpers. The Cursor APIs use several different pagination envelopes, so
 * {@link hasNextPage} / {@link totalPagesOf} normalize them, {@link streamPages} drives a
 * page loop with bounded look-ahead, and {@link collectPages} gathers everything into one
 * array. Pure module — no I/O.
 */
import type { Pagination } from "./types";

/** Hard guard so a malformed `hasNextPage` can never produce an infinite loop. */
export const MAX_PAGES = 2000;

/** Pages requested ahead of the consumer (the rate limiter still caps requests/minute). */
export const DEFAULT_PAGE_CONCURRENCY = 4;

/**
 * Total page count, tolerating the various envelopes: explicit `totalPages`/`numPages`, or
 * derived from `totalCount`/`totalItems`/`totalUsers` and the page size (the AI Code
 * Tracking API exposes only `totalCount` + `pageSize`).
 */
export function totalPagesOf(
  pagination: Pagination | undefined,
  requestedPageSize?: number,
): number | undefined {
  if (!pagination) return undefined;
  const total = pagination.totalPages ?? pagination.numPages;
  if (typeof total === "number") return Math.max(1, total);
  const count = pagination.totalCount ?? pagination.totalItems ?? pagination.totalUsers;
  const size = pagination.pageSize ?? requestedPageSize;
  if (typeof count === "number" && typeof size === "number" && size > 0) {
    return Math.max(1, Math.ceil(count / size));
  }
  return undefined;
}

/**
 * Decide whether another page exists, tolerating the various envelopes:
 * - explicit `hasNextPage` boolean (audit-logs, usage-events, by-user, leaderboard, bugbot)
 * - `currentPage`/`page` vs a total page count (spend exposes only `totalPages`;
 *   AI Code Tracking exposes `totalCount` + `pageSize`)
 */
export function hasNextPage(
  pagination: Pagination | undefined,
  requestedPage: number,
  requestedPageSize?: number,
): boolean {
  if (!pagination) return false;
  if (typeof pagination.hasNextPage === "boolean") return pagination.hasNextPage;
  const current = pagination.currentPage ?? pagination.page ?? requestedPage;
  const total = totalPagesOf(pagination, requestedPageSize);
  if (typeof total === "number") return current < total;
  return false;
}

export interface PageBatch<TItem> {
  /** 1-indexed page number. */
  page: number;
  /** Total page count once known (after page 1), if the envelope exposes one. */
  totalPages?: number;
  items: TItem[];
}

export interface StreamPagesOptions<TPage, TItem> {
  fetchPage: (page: number) => Promise<TPage>;
  getItems: (page: TPage) => TItem[];
  getPagination: (page: TPage) => Pagination | undefined;
  /** Page size sent to the API; used to derive the total when only a count is returned. */
  pageSize?: number;
  /** Pages kept in flight ahead of the consumer. Default {@link DEFAULT_PAGE_CONCURRENCY}. */
  concurrency?: number;
  maxPages?: number;
}

/**
 * Yield every page (1-indexed, in order) as soon as it is available. Page 1 is fetched
 * alone to learn the total; the remaining pages are requested `concurrency` at a time
 * through the rate limiter so network latency no longer serializes with the limiter's
 * spacing. Consumers persist each batch as it arrives, which bounds memory and means a
 * failure loses one page rather than a whole window. If the envelope exposes no total,
 * pages are walked sequentially via `hasNextPage`.
 */
export async function* streamPages<TPage, TItem>(
  opts: StreamPagesOptions<TPage, TItem>,
): AsyncGenerator<PageBatch<TItem>, void, undefined> {
  const max = opts.maxPages ?? MAX_PAGES;
  const concurrency = Math.max(1, opts.concurrency ?? DEFAULT_PAGE_CONCURRENCY);

  const first = await opts.fetchPage(1);
  const firstPagination = opts.getPagination(first);
  const known = totalPagesOf(firstPagination, opts.pageSize);
  const totalPages = known === undefined ? undefined : Math.min(known, max);
  yield { page: 1, totalPages, items: opts.getItems(first) };

  if (totalPages === undefined) {
    // Unknown total: walk sequentially while the envelope says there is more.
    let pagination = firstPagination;
    for (let page = 2; page <= max && hasNextPage(pagination, page - 1, opts.pageSize); page++) {
      const response = await opts.fetchPage(page);
      pagination = opts.getPagination(response);
      yield { page, items: opts.getItems(response) };
    }
    return;
  }

  const pending = new Map<number, Promise<TPage>>();
  let next = 2;
  const fill = () => {
    while (next <= totalPages && pending.size < concurrency) {
      const page = next++;
      pending.set(page, opts.fetchPage(page));
    }
  };

  try {
    for (let page = 2; page <= totalPages; page++) {
      fill();
      const response = await pending.get(page)!;
      pending.delete(page);
      yield { page, totalPages, items: opts.getItems(response) };
    }
  } finally {
    // If the consumer stops early (or a page failed), in-flight requests must not surface
    // as unhandled rejections.
    for (const inFlight of pending.values()) inFlight.catch(() => undefined);
  }
}

/**
 * Fetch every page and flat-map the items together. `fetchPage` returns the raw response
 * for a page; `getItems` and `getPagination` extract the items and the pagination envelope.
 */
export async function collectPages<TPage, TItem>(
  opts: StreamPagesOptions<TPage, TItem>,
): Promise<TItem[]> {
  const items: TItem[] = [];
  for await (const batch of streamPages(opts)) items.push(...batch.items);
  return items;
}

/** One page of a by-user response: `data` keyed by email. */
export interface ByUserPageBatch<Row> {
  page: number;
  totalPages?: number;
  data: Record<string, Row[]>;
}

/**
 * Like {@link streamPages} but for by-user responses whose `data` is keyed by email. Each
 * page is yielded as-is (pages partition users, so no merging is needed per page).
 */
export async function* streamByUserPages<Row>(opts: {
  fetchPage: (page: number) => Promise<{ data: Record<string, Row[]>; pagination?: Pagination }>;
  pageSize?: number;
  concurrency?: number;
  maxPages?: number;
}): AsyncGenerator<ByUserPageBatch<Row>, void, undefined> {
  // The keyed map is the page's single "item".
  const stream = streamPages({
    fetchPage: opts.fetchPage,
    getItems: (page) => [page.data],
    getPagination: (page) => page.pagination,
    pageSize: opts.pageSize,
    concurrency: opts.concurrency,
    maxPages: opts.maxPages,
  });
  for await (const batch of stream) {
    yield { page: batch.page, totalPages: batch.totalPages, data: batch.items[0] ?? {} };
  }
}

/**
 * Like {@link collectPages} but for by-user responses whose `data` is keyed by email.
 * Merges every page's `{ email: rows[] }` map into one accumulator.
 */
export async function collectByUserPages<Row>(opts: {
  fetchPage: (page: number) => Promise<{ data: Record<string, Row[]>; pagination?: Pagination }>;
  pageSize?: number;
  maxPages?: number;
}): Promise<Record<string, Row[]>> {
  const merged: Record<string, Row[]> = {};
  for await (const batch of streamByUserPages(opts)) {
    for (const [email, rows] of Object.entries(batch.data)) {
      (merged[email] ??= []).push(...rows);
    }
  }
  return merged;
}
