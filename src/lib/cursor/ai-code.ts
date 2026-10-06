/**
 * Typed wrappers for the AI Code Tracking API (Enterprise alpha): per-commit AI line
 * attribution and accepted AI changes. Both endpoints page with a flat
 * `{ items, totalCount, page, pageSize }` envelope, allow up to 1000 items per page, are
 * limited to 20 requests/minute each, and support ETags. Dates are sent as full ISO
 * timestamps because `commitTs` / `createdAt` are instant-precise.
 *
 *  - GET /analytics/ai-code/commits
 *  - GET /analytics/ai-code/changes
 */
import type { CursorHttp } from "./client";
import type { DateRange } from "./analytics";
import { streamPages, type PageBatch } from "./pagination";
import {
  AiCodeChangesResponseSchema,
  AiCodeCommitsResponseSchema,
  type AiCodeChange,
  type AiCodeCommit,
} from "./types";

export const AI_CODE_PAGE_SIZE = 1000;

export interface AiCodeQuery {
  /** Optional single-user filter (email, `user_…` id, or numeric id). */
  user?: string;
  pageSize?: number;
}

export function streamAiCodeCommits(
  http: CursorHttp,
  range: DateRange,
  opts: AiCodeQuery = {},
): AsyncGenerator<PageBatch<AiCodeCommit>> {
  const pageSize = opts.pageSize ?? AI_CODE_PAGE_SIZE;
  return streamPages({
    fetchPage: async (page) => {
      const res = await http.request({
        method: "GET",
        path: "/analytics/ai-code/commits",
        group: "aiCodeCommits",
        schema: AiCodeCommitsResponseSchema,
        query: {
          startDate: range.start.toISOString(),
          endDate: range.end.toISOString(),
          user: opts.user,
          page,
          pageSize,
        },
      });
      return res.data!;
    },
    getItems: (d) => d.items,
    getPagination: (d) => ({
      page: d.page ?? undefined,
      pageSize: d.pageSize ?? undefined,
      totalCount: d.totalCount ?? undefined,
    }),
    pageSize,
  });
}

export function streamAiCodeChanges(
  http: CursorHttp,
  range: DateRange,
  opts: AiCodeQuery = {},
): AsyncGenerator<PageBatch<AiCodeChange>> {
  const pageSize = opts.pageSize ?? AI_CODE_PAGE_SIZE;
  return streamPages({
    fetchPage: async (page) => {
      const res = await http.request({
        method: "GET",
        path: "/analytics/ai-code/changes",
        group: "aiCodeChanges",
        schema: AiCodeChangesResponseSchema,
        query: {
          startDate: range.start.toISOString(),
          endDate: range.end.toISOString(),
          user: opts.user,
          page,
          pageSize,
        },
      });
      return res.data!;
    },
    getItems: (d) => d.items,
    getPagination: (d) => ({
      page: d.page ?? undefined,
      pageSize: d.pageSize ?? undefined,
      totalCount: d.totalCount ?? undefined,
    }),
    pageSize,
  });
}
