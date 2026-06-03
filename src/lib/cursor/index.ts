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
  getDailyUsage,
  getMembers,
  getSpend,
  getUsageEvents,
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
  type DateRange,
  type LeaderboardResult,
} from "./analytics";
import type { AuditLogEvent, BugbotRow, DailyUsageRow, TeamMember, UsageEvent } from "./types";
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
    byUser<R>(path: string, schema: z.ZodTypeAny, range: DateRange): Promise<Record<string, R[]>>;
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
    },
    analytics: {
      team: (path, schema, range, etag) => getTeamMetric(http, path, schema, range, etag),
      conversationInsights: (schema, range, etag) =>
        getConversationInsights(http, schema, range, etag),
      leaderboard: (range) => getLeaderboard(http, range),
      bugbot: (range, opts) => getBugbot(http, range, opts),
      byUser: (path, schema, range) => getByUserData(http, path, schema, range),
    },
  };
}

export { CursorHttp, parseRetryAfterMs } from "./client";
export type { ApiResult, CursorClientOptions, FetchLike, RequestSpec } from "./client";
export { createLimiters, schedule, disposeLimiters, type Limiters } from "./ratelimit";
export { chunkWindows, MAX_WINDOW_DAYS, type DateWindow } from "./windows";
export { collectPages, collectByUserPages, hasNextPage, MAX_PAGES } from "./pagination";
export { createMockFetch, MOCK_USERS } from "./mock";
export type { AdminWindow, AuditLogsQuery, SpendResult, UsageEventsQuery } from "./admin";
export { CONVERSATION_INCLUDE, type DateRange, type LeaderboardResult } from "./analytics";
export * from "./types";
