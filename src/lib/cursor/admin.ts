/**
 * Typed wrappers for the Admin API endpoints. Windowed, high-volume endpoints expose a
 * `stream*` variant that yields one page at a time (see `pagination.ts`) so the sync engine
 * can persist each page as it lands; the `get*` variants collect everything into an array.
 * The sync engine handles 30-day windowing and persistence.
 *
 * Endpoints:
 *  - GET  /teams/members              (roster, not paginated)
 *  - POST /teams/spend                (per-user cycle spend, paginated)
 *  - POST /teams/daily-usage-data     (per-user-per-day, paginated over all members)
 *  - POST /teams/filtered-usage-events(granular events, paginated)
 *  - GET  /teams/audit-logs           (security events, paginated)
 */
import type { CursorHttp } from "./client";
import { collectPages, streamPages, type PageBatch } from "./pagination";
import {
  AuditLogsResponseSchema,
  DailyUsageResponseSchema,
  SpendResponseSchema,
  TeamMembersResponseSchema,
  UsageEventsResponseSchema,
  type AuditLogEvent,
  type DailyUsageRow,
  type SpendRow,
  type TeamMember,
  type UsageEvent,
} from "./types";

/**
 * Page sizes per the Admin API docs: `filtered-usage-events` allows up to 1000, `audit-logs`
 * up to 500, `daily-usage-data` documents a 1000 example; `spend` documents no cap.
 */
export const SPEND_PAGE_SIZE = 500;
export const DAILY_USAGE_PAGE_SIZE = 1000;
export const USAGE_EVENTS_PAGE_SIZE = 1000;
export const AUDIT_LOGS_PAGE_SIZE = 500;

export async function getMembers(http: CursorHttp): Promise<TeamMember[]> {
  const res = await http.request({
    method: "GET",
    path: "/teams/members",
    group: "adminMembers",
    schema: TeamMembersResponseSchema,
  });
  return res.data?.teamMembers ?? [];
}

export interface SpendResult {
  rows: SpendRow[];
  subscriptionCycleStart?: number;
}

export async function getSpend(http: CursorHttp, pageSize = SPEND_PAGE_SIZE): Promise<SpendResult> {
  let subscriptionCycleStart: number | undefined;
  const rows = await collectPages({
    fetchPage: async (page) => {
      const res = await http.request({
        method: "POST",
        path: "/teams/spend",
        group: "adminSpend",
        body: { page, pageSize, sortBy: "amount", sortDirection: "desc" },
        schema: SpendResponseSchema,
      });
      return res.data!;
    },
    getItems: (d) => {
      subscriptionCycleStart = d.subscriptionCycleStart ?? subscriptionCycleStart;
      return d.teamMemberSpend;
    },
    getPagination: (d) => ({ totalPages: d.totalPages ?? undefined }),
    pageSize,
  });
  return { rows, subscriptionCycleStart };
}

export interface AdminWindow {
  /** Inclusive start, epoch ms. */
  startDate: number;
  /** Inclusive end, epoch ms. */
  endDate: number;
}

export function streamDailyUsage(
  http: CursorHttp,
  window: AdminWindow,
  pageSize = DAILY_USAGE_PAGE_SIZE,
): AsyncGenerator<PageBatch<DailyUsageRow>> {
  return streamPages({
    fetchPage: async (page) => {
      const res = await http.request({
        method: "POST",
        path: "/teams/daily-usage-data",
        group: "adminDailyUsage",
        body: { startDate: window.startDate, endDate: window.endDate, page, pageSize },
        schema: DailyUsageResponseSchema,
      });
      return res.data!;
    },
    getItems: (d) => d.data,
    getPagination: (d) => d.pagination,
    pageSize,
  });
}

export async function getDailyUsage(
  http: CursorHttp,
  window: AdminWindow,
  pageSize = DAILY_USAGE_PAGE_SIZE,
): Promise<DailyUsageRow[]> {
  return collectBatches(streamDailyUsage(http, window, pageSize));
}

export interface UsageEventsQuery extends AdminWindow {
  email?: string;
  userId?: number;
}

export function streamUsageEvents(
  http: CursorHttp,
  query: UsageEventsQuery,
  pageSize = USAGE_EVENTS_PAGE_SIZE,
): AsyncGenerator<PageBatch<UsageEvent>> {
  return streamPages({
    fetchPage: async (page) => {
      const res = await http.request({
        method: "POST",
        path: "/teams/filtered-usage-events",
        group: "adminUsageEvents",
        body: {
          startDate: query.startDate,
          endDate: query.endDate,
          page,
          pageSize,
          email: query.email,
          userId: query.userId,
        },
        schema: UsageEventsResponseSchema,
      });
      return res.data!;
    },
    getItems: (d) => d.usageEvents,
    getPagination: (d) => d.pagination,
    pageSize,
  });
}

export async function getUsageEvents(
  http: CursorHttp,
  query: UsageEventsQuery,
  pageSize = USAGE_EVENTS_PAGE_SIZE,
): Promise<UsageEvent[]> {
  return collectBatches(streamUsageEvents(http, query, pageSize));
}

export interface AuditLogsQuery {
  /** Inclusive start, epoch ms. */
  startTime: number;
  /** Inclusive end, epoch ms. */
  endTime: number;
  eventTypes?: string;
  search?: string;
}

export function streamAuditLogs(
  http: CursorHttp,
  query: AuditLogsQuery,
  pageSize = AUDIT_LOGS_PAGE_SIZE,
): AsyncGenerator<PageBatch<AuditLogEvent>> {
  return streamPages({
    fetchPage: async (page) => {
      const res = await http.request({
        method: "GET",
        path: "/teams/audit-logs",
        group: "adminAuditLogs",
        query: {
          startTime: query.startTime,
          endTime: query.endTime,
          eventTypes: query.eventTypes,
          search: query.search,
          page,
          pageSize,
        },
        schema: AuditLogsResponseSchema,
      });
      return res.data!;
    },
    getItems: (d) => d.events,
    getPagination: (d) => d.pagination,
    pageSize,
  });
}

export async function getAuditLogs(
  http: CursorHttp,
  query: AuditLogsQuery,
  pageSize = AUDIT_LOGS_PAGE_SIZE,
): Promise<AuditLogEvent[]> {
  return collectBatches(streamAuditLogs(http, query, pageSize));
}

async function collectBatches<T>(batches: AsyncGenerator<PageBatch<T>>): Promise<T[]> {
  const items: T[] = [];
  for await (const batch of batches) items.push(...batch.items);
  return items;
}
