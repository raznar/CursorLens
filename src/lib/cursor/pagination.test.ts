import { describe, expect, it } from "vitest";
import {
  collectByUserPages,
  collectPages,
  hasNextPage,
  streamPages,
  totalPagesOf,
} from "./pagination";

interface Page {
  items: number[];
  pagination?: Record<string, number | boolean>;
}

/** Fake paginated endpoint that records request order and resolves in controlled order. */
function fakeEndpoint(envelope: (page: number) => Page["pagination"]) {
  const requested: number[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const fetchPage = async (page: number): Promise<Page> => {
    requested.push(page);
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    // Later pages resolve faster to prove ordering is preserved regardless of arrival.
    await new Promise((r) => setTimeout(r, Math.max(1, 10 - page)));
    inFlight--;
    return { items: [page], pagination: envelope(page) };
  };
  return { fetchPage, requested, maxInFlight: () => maxInFlight };
}

describe("totalPagesOf / hasNextPage", () => {
  it("reads explicit totals and derives them from counts", () => {
    expect(totalPagesOf({ totalPages: 5 })).toBe(5);
    expect(totalPagesOf({ numPages: 3 })).toBe(3);
    expect(totalPagesOf({ totalCount: 250, pageSize: 100 })).toBe(3);
    expect(totalPagesOf({ totalItems: 1 }, 100)).toBe(1);
    expect(totalPagesOf({ totalUsers: 0, pageSize: 50 })).toBe(1);
    expect(totalPagesOf({ page: 1 })).toBeUndefined();
    expect(totalPagesOf(undefined)).toBeUndefined();
  });

  it("prefers hasNextPage, else compares page to the total", () => {
    expect(hasNextPage({ hasNextPage: true }, 1)).toBe(true);
    expect(hasNextPage({ hasNextPage: false, totalPages: 9 }, 1)).toBe(false);
    expect(hasNextPage({ currentPage: 2, numPages: 3 }, 2)).toBe(true);
    expect(hasNextPage({ page: 3, totalPages: 3 }, 3)).toBe(false);
    expect(hasNextPage({ totalCount: 150, pageSize: 100 }, 1)).toBe(true);
    expect(hasNextPage({ totalCount: 150 }, 1, 100)).toBe(true);
    expect(hasNextPage({ totalCount: 150 }, 2, 100)).toBe(false);
    expect(hasNextPage(undefined, 1)).toBe(false);
  });
});

describe("streamPages", () => {
  it("fetches page 1 first, then the rest concurrently, yielding in order", async () => {
    const api = fakeEndpoint((page) => ({ page, totalPages: 6 }));
    const seen: number[] = [];
    for await (const batch of streamPages({
      fetchPage: api.fetchPage,
      getItems: (p: Page) => p.items,
      getPagination: (p: Page) => p.pagination,
      concurrency: 3,
    })) {
      seen.push(batch.page);
      expect(batch.totalPages).toBe(6);
      expect(batch.items).toEqual([batch.page]);
    }
    expect(seen).toEqual([1, 2, 3, 4, 5, 6]);
    expect(api.requested[0]).toBe(1);
    expect(api.requested.slice(1).sort((a, b) => a - b)).toEqual([2, 3, 4, 5, 6]);
    expect(api.maxInFlight()).toBeGreaterThan(1);
    expect(api.maxInFlight()).toBeLessThanOrEqual(3);
  });

  it("walks sequentially when the envelope exposes only hasNextPage", async () => {
    const api = fakeEndpoint((page) => ({ hasNextPage: page < 4 }));
    const pages = await collectPages({
      fetchPage: api.fetchPage,
      getItems: (p: Page) => p.items,
      getPagination: (p: Page) => p.pagination,
    });
    expect(pages).toEqual([1, 2, 3, 4]);
    expect(api.requested).toEqual([1, 2, 3, 4]);
    expect(api.maxInFlight()).toBe(1);
  });

  it("derives the total from totalCount + pageSize (AI Code Tracking envelope)", async () => {
    const api = fakeEndpoint((page) => ({ page, pageSize: 100, totalCount: 250 }));
    const pages = await collectPages({
      fetchPage: api.fetchPage,
      getItems: (p: Page) => p.items,
      getPagination: (p: Page) => p.pagination,
      pageSize: 100,
    });
    expect(pages).toEqual([1, 2, 3]);
  });

  it("stops at a single page when there is no pagination envelope", async () => {
    const api = fakeEndpoint(() => undefined);
    const pages = await collectPages({
      fetchPage: api.fetchPage,
      getItems: (p: Page) => p.items,
      getPagination: (p: Page) => p.pagination,
    });
    expect(pages).toEqual([1]);
  });

  it("propagates a page failure without leaking unhandled rejections", async () => {
    let calls = 0;
    const fetchPage = async (page: number): Promise<Page> => {
      calls++;
      if (page === 3) throw new Error("boom");
      return { items: [page], pagination: { totalPages: 5 } };
    };
    await expect(
      collectPages({
        fetchPage,
        getItems: (p: Page) => p.items,
        getPagination: (p: Page) => p.pagination,
        concurrency: 4,
      }),
    ).rejects.toThrow("boom");
    expect(calls).toBeGreaterThanOrEqual(3);
  });
});

describe("collectByUserPages", () => {
  it("merges keyed maps across pages", async () => {
    const pages: Array<{ data: Record<string, number[]>; pagination: { totalPages: number } }> = [
      { data: { "a@x": [1], "b@x": [2] }, pagination: { totalPages: 2 } },
      { data: { "a@x": [3], "c@x": [4] }, pagination: { totalPages: 2 } },
    ];
    const merged = await collectByUserPages<number>({
      fetchPage: async (page) => pages[page - 1]!,
    });
    expect(merged).toEqual({ "a@x": [1, 3], "b@x": [2], "c@x": [4] });
  });
});
