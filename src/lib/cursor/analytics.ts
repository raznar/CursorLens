/**
 * Typed wrappers for the Analytics API: team-level metrics (single GET, ETag-capable),
 * the paginated leaderboard/bugbot endpoints, and the by-user family (data keyed by email).
 *
 * Team analytics are date-windowed by the sync engine (≤ 30 days per call) and use
 * `startDate`/`endDate` in `YYYY-MM-DD` form for better HTTP caching.
 */
import type { z } from "zod";
import { toApiDate } from "@/lib/date-range";
import type { ApiResult, CursorHttp } from "./client";
import {
  collectByUserPages,
  collectPages,
  hasNextPage,
  MAX_PAGES,
  streamByUserPages,
  streamPages,
  type ByUserPageBatch,
  type PageBatch,
} from "./pagination";
import {
  BugbotResponseSchema,
  BugbotReviewsResponseSchema,
  ConversationInsightsResponseSchema,
  LeaderboardResponseSchema,
  type BugbotReview,
  type BugbotRow,
  type LeaderboardEntry,
  type Pagination,
} from "./types";

export interface DateRange {
  start: Date;
  end: Date;
}

/** The `include` slices required by the conversation-insights endpoint. */
export const CONVERSATION_INCLUDE = "intents,complexity,categories,guidanceLevels,workTypes";

/** Documented maxima: by-user 500 users/page, leaderboard 500, bugbot + bugbot-reviews 250. */
export const BY_USER_PAGE_SIZE = 500;
export const LEADERBOARD_PAGE_SIZE = 500;
export const BUGBOT_PAGE_SIZE = 250;
export const BUGBOT_REVIEWS_PAGE_SIZE = 250;

/**
 * Fetch a single-request team analytics metric, threading ETag / `If-None-Match`.
 * `T` is inferred from `schema`, so callers get the exact validated response type back.
 */
export function getTeamMetric<T>(
  http: CursorHttp,
  path: string,
  schema: z.ZodType<T>,
  range: DateRange,
  etag?: string,
): Promise<ApiResult<T>> {
  return http.request({
    method: "GET",
    path,
    group: "analyticsTeam",
    schema,
    query: { startDate: toApiDate(range.start), endDate: toApiDate(range.end) },
    etag,
  });
}

/** Conversation insights (its own rate-limit group; `include` is required). */
export function getConversationInsights<T>(
  http: CursorHttp,
  schema: z.ZodType<T>,
  range: DateRange,
  etag?: string,
): Promise<ApiResult<T>> {
  return http.request({
    method: "GET",
    path: "/analytics/team/conversation-insights",
    group: "analyticsConversationInsights",
    schema,
    query: {
      startDate: toApiDate(range.start),
      endDate: toApiDate(range.end),
      include: CONVERSATION_INCLUDE,
    },
    etag,
  });
}

export { ConversationInsightsResponseSchema };

export interface LeaderboardResult {
  tab: LeaderboardEntry[];
  agent: LeaderboardEntry[];
  periodStart: string;
  periodEnd: string;
}

/** Leaderboard: paginated; accumulate both the Tab and Agent boards across pages. */
export async function getLeaderboard(
  http: CursorHttp,
  range: DateRange,
  pageSize = LEADERBOARD_PAGE_SIZE,
): Promise<LeaderboardResult> {
  const tab: LeaderboardEntry[] = [];
  const agent: LeaderboardEntry[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await http.request({
      method: "GET",
      path: "/analytics/team/leaderboard",
      group: "analyticsTeam",
      schema: LeaderboardResponseSchema,
      query: { startDate: toApiDate(range.start), endDate: toApiDate(range.end), page, pageSize },
    });
    const data = res.data!;
    if (data.data.tab_leaderboard?.data) tab.push(...data.data.tab_leaderboard.data);
    if (data.data.agent_leaderboard?.data) agent.push(...data.data.agent_leaderboard.data);
    if (!hasNextPage(data.pagination, page)) break;
  }
  return { tab, agent, periodStart: toApiDate(range.start), periodEnd: toApiDate(range.end) };
}

export async function getBugbot(
  http: CursorHttp,
  range: DateRange,
  opts: { prState?: "merged" | "all"; repo?: string; pageSize?: number } = {},
): Promise<BugbotRow[]> {
  return collectPages({
    fetchPage: async (page) => {
      const res = await http.request({
        method: "GET",
        path: "/analytics/team/bugbot",
        group: "analyticsTeam",
        schema: BugbotResponseSchema,
        query: {
          startDate: toApiDate(range.start),
          endDate: toApiDate(range.end),
          prState: opts.prState ?? "all",
          repo: opts.repo,
          page,
          pageSize: opts.pageSize ?? BUGBOT_PAGE_SIZE,
        },
      });
      return res.data!;
    },
    getItems: (d) => d.data,
    getPagination: (d) => d.pagination,
  });
}

export interface BugbotReviewsQuery {
  repo?: string;
  prNumber?: number;
  dryRun?: boolean;
}

/**
 * Per-review Bugbot analytics (`read:*` scope): posted and dry-run reviews with billed cost
 * and per-finding resolution. Streamed page by page; shares the team analytics bucket.
 */
export function streamBugbotReviews(
  http: CursorHttp,
  range: DateRange,
  opts: BugbotReviewsQuery & { pageSize?: number } = {},
): AsyncGenerator<PageBatch<BugbotReview>> {
  const pageSize = opts.pageSize ?? BUGBOT_REVIEWS_PAGE_SIZE;
  return streamPages({
    fetchPage: async (page) => {
      const res = await http.request({
        method: "GET",
        path: "/analytics/team/bugbot-reviews",
        group: "analyticsTeam",
        schema: BugbotReviewsResponseSchema,
        query: {
          startDate: toApiDate(range.start),
          endDate: toApiDate(range.end),
          repo: opts.repo,
          prNumber: opts.prNumber,
          dryRun: opts.dryRun,
          page,
          pageSize,
        },
      });
      return res.data!;
    },
    getItems: (d) => d.data,
    getPagination: (d) => d.pagination,
    pageSize,
  });
}

/** By-user envelope shape consumed by the merge loop. */
interface ByUserEnvelope<R> {
  data: Record<string, R[]>;
  pagination?: Pagination;
}

/**
 * Stream a by-user metric one page at a time (each page is a `{ email: rows }` map for a
 * disjoint set of users). `R` (the row type) is supplied by the caller; the response schema
 * validates shape.
 */
export function streamByUserData<R>(
  http: CursorHttp,
  path: string,
  schema: z.ZodTypeAny,
  range: DateRange,
  pageSize = BY_USER_PAGE_SIZE,
): AsyncGenerator<ByUserPageBatch<R>> {
  return streamByUserPages<R>({
    fetchPage: async (page) => {
      const res = await http.request({
        method: "GET",
        path,
        group: "analyticsByUser",
        schema,
        query: { startDate: toApiDate(range.start), endDate: toApiDate(range.end), page, pageSize },
      });
      return res.data as ByUserEnvelope<R>;
    },
    pageSize,
  });
}

/** Fetch a by-user metric, following pagination and merging every page's map. */
export async function getByUserData<R>(
  http: CursorHttp,
  path: string,
  schema: z.ZodTypeAny,
  range: DateRange,
  pageSize = BY_USER_PAGE_SIZE,
): Promise<Record<string, R[]>> {
  return collectByUserPages<R>({
    fetchPage: async (page) => {
      const res = await http.request({
        method: "GET",
        path,
        group: "analyticsByUser",
        schema,
        query: { startDate: toApiDate(range.start), endDate: toApiDate(range.end), page, pageSize },
      });
      return res.data as ByUserEnvelope<R>;
    },
    pageSize,
  });
}
