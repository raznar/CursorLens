/**
 * Public entrypoint for the Cursor API client.
 *
 *   import { createCursorClient } from "@/lib/cursor";
 *   const client = createCursorClient({ apiKey });      // live
 *   const client = createCursorClient({ mock: true });  // bundled fixtures
 *
 * `createCursorClient` resolves mock mode (explicit option, else `config.mock`), installs
 * the mock `fetch` shim when mocking, and returns a small facade that binds the typed
 * Admin + Analytics wrappers to one rate-limited HTTP client. The client is pure — it is
 * given an API key, never reading it from `db`/`keys`.
 */
import { config } from "@/lib/config";
import { CursorHttp, type ApiResult, type CursorClientOptions } from "./client";
import { createMockFetch } from "./mock";
import {
  getAuditLogs,
  getBillingGroups,
  getDailyUsage,
  getDirectoryGroupMembers,
  getDirectoryGroups,
  getMembers,
  getSpend,
  getUsageEvents,
  streamAuditLogs,
  streamDailyUsage,
  streamUsageEvents,
  type AdminWindow,
  type AuditLogsQuery,
  type SpendResult,
  type UsageEventsQuery,
} from "./admin";
import {
  getBugbot,
  getByUserData,
  getConversationInsights,
  getLeaderboard,
  getTeamMetric,
  streamBugbotReviews,
  streamByUserData,
  type BugbotReviewsQuery,
  type DateRange,
  type LeaderboardResult,
} from "./analytics";
import { streamAiCodeChanges, streamAiCodeCommits, type AiCodeQuery } from "./ai-code";
import type { ByUserPageBatch, PageBatch } from "./pagination";
import type {
  AiCodeChange,
  AiCodeCommit,
  AuditLogEvent,
  BillingGroupsResponse,
  BugbotReview,
  BugbotRow,
  DailyUsageRow,
  DirectoryGroup,
  DirectoryGroupMember,
  TeamMember,
  UsageEvent,
} from "./types";
import type { z } from "zod";

export interface CursorClient {
  readonly http: CursorHttp;
  readonly mock: boolean;
  readonly admin: {
    members(): Promise<TeamMember[]>;
    spend(): Promise<SpendResult>;
    dailyUsage(window: AdminWindow): Promise<DailyUsageRow[]>;
    usageEvents(query: UsageEventsQuery): Promise<UsageEvent[]>;
    auditLogs(query: AuditLogsQuery): Promise<AuditLogEvent[]>;
    /** Page-at-a-time variants for the windowed, high-volume endpoints. */
    dailyUsagePages(window: AdminWindow): AsyncGenerator<PageBatch<DailyUsageRow>>;
    usageEventPages(query: UsageEventsQuery): AsyncGenerator<PageBatch<UsageEvent>>;
    auditLogPages(query: AuditLogsQuery): AsyncGenerator<PageBatch<AuditLogEvent>>;
    billingGroups(billingCycle?: string): Promise<BillingGroupsResponse>;
    directoryGroups(): Promise<DirectoryGroup[]>;
    directoryGroupMembers(groupId: string): Promise<DirectoryGroupMember[]>;
  };
  readonly aiCode: {
    commitPages(range: DateRange, opts?: AiCodeQuery): AsyncGenerator<PageBatch<AiCodeCommit>>;
    changePages(range: DateRange, opts?: AiCodeQuery): AsyncGenerator<PageBatch<AiCodeChange>>;
  };
  readonly analytics: {
    team<T>(
      path: string,
      schema: z.ZodType<T>,
      range: DateRange,
      etag?: string,
    ): Promise<ApiResult<T>>;
    conversationInsights<T>(
      schema: z.ZodType<T>,
      range: DateRange,
      etag?: string,
    ): Promise<ApiResult<T>>;
    leaderboard(range: DateRange): Promise<LeaderboardResult>;
    bugbot(
      range: DateRange,
      opts?: { prState?: "merged" | "all"; repo?: string },
    ): Promise<BugbotRow[]>;
    bugbotReviewPages(
      range: DateRange,
      opts?: BugbotReviewsQuery,
    ): AsyncGenerator<PageBatch<BugbotReview>>;
    byUser<R>(path: string, schema: z.ZodTypeAny, range: DateRange): Promise<Record<string, R[]>>;
    byUserPages<R>(
      path: string,
      schema: z.ZodTypeAny,
      range: DateRange,
    ): AsyncGenerator<ByUserPageBatch<R>>;
  };
}

export function createCursorClient(options: CursorClientOptions = {}): CursorClient {
  const mock = options.mock ?? config.mock;
  const fetchImpl = options.fetchImpl ?? (mock ? createMockFetch() : undefined);
  const http = new CursorHttp({ ...options, mock, fetchImpl });

  return {
    http,
    mock,
    admin: {
      members: () => getMembers(http),
      spend: () => getSpend(http),
      dailyUsage: (window) => getDailyUsage(http, window),
      usageEvents: (query) => getUsageEvents(http, query),
      auditLogs: (query) => getAuditLogs(http, query),
      dailyUsagePages: (window) => streamDailyUsage(http, window),
      usageEventPages: (query) => streamUsageEvents(http, query),
      auditLogPages: (query) => streamAuditLogs(http, query),
      billingGroups: (billingCycle) => getBillingGroups(http, billingCycle),
      directoryGroups: () => getDirectoryGroups(http),
      directoryGroupMembers: (groupId) => getDirectoryGroupMembers(http, groupId),
    },
    aiCode: {
      commitPages: (range, opts) => streamAiCodeCommits(http, range, opts),
      changePages: (range, opts) => streamAiCodeChanges(http, range, opts),
    },
    analytics: {
      team: (path, schema, range, etag) => getTeamMetric(http, path, schema, range, etag),
      conversationInsights: (schema, range, etag) =>
        getConversationInsights(http, schema, range, etag),
      leaderboard: (range) => getLeaderboard(http, range),
      bugbot: (range, opts) => getBugbot(http, range, opts),
      bugbotReviewPages: (range, opts) => streamBugbotReviews(http, range, opts),
      byUser: (path, schema, range) => getByUserData(http, path, schema, range),
      byUserPages: (path, schema, range) => streamByUserData(http, path, schema, range),
    },
  };
}

export { CursorHttp, parseRetryAfterMs } from "./client";
export type { ApiResult, CursorClientOptions, FetchLike, RequestSpec } from "./client";
export {
  createLimiters,
  schedule,
  disposeLimiters,
  getSharedLimiters,
  resetSharedLimiters,
  type Limiters,
} from "./ratelimit";
export {
  chunkWindows,
  startOfUtcDay,
  endOfUtcDay,
  MAX_WINDOW_DAYS,
  type DateWindow,
} from "./windows";
export {
  collectPages,
  collectByUserPages,
  streamPages,
  streamByUserPages,
  hasNextPage,
  totalPagesOf,
  MAX_PAGES,
  DEFAULT_PAGE_CONCURRENCY,
  type PageBatch,
  type ByUserPageBatch,
} from "./pagination";
export { createMockFetch, MOCK_USERS } from "./mock";
export type { AdminWindow, AuditLogsQuery, SpendResult, UsageEventsQuery } from "./admin";
export {
  CONVERSATION_INCLUDE,
  type BugbotReviewsQuery,
  type DateRange,
  type LeaderboardResult,
} from "./analytics";
export { AI_CODE_PAGE_SIZE, type AiCodeQuery } from "./ai-code";
export * from "./types";
