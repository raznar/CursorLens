/**
 * Typed wrappers for the five Admin API endpoints. Each returns plain data (pagination is
 * followed to completion here); the sync engine handles 30-day windowing and persistence.
 *
 * Endpoints:
 *  - GET  /teams/members              (roster, not paginated)
 *  - POST /teams/spend                (per-user cycle spend, paginated)
 *  - POST /teams/daily-usage-data     (per-user-per-day, paginated over all members)
 *  - POST /teams/filtered-usage-events(granular events, paginated)
 *  - GET  /teams/audit-logs           (security events, paginated)
 */
import type { CursorHttp } from "./client";
import { collectPages } from "./pagination";
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

/** Default page size for paginated admin endpoints (servers cap as needed). */
const PAGE_SIZE = 500;

export async function getMembers(http: CursorHttp): Promise<TeamMember[]> {
  const res = await http.request({
    method: "GET",
    path: "/teams/members",
    group: "adminGeneral",
    schema: TeamMembersResponseSchema,
  });
  return res.data?.teamMembers ?? [];
}

export interface SpendResult {
  rows: SpendRow[];
  subscriptionCycleStart?: number;
}

export async function getSpend(http: CursorHttp, pageSize = PAGE_SIZE): Promise<SpendResult> {
  let subscriptionCycleStart: number | undefined;
  const rows = await collectPages({
    fetchPage: async (page) => {
      const res = await http.request({
        method: "POST",
        path: "/teams/spend",
        group: "adminGeneral",
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
  });
  return { rows, subscriptionCycleStart };
}

export interface AdminWindow {
  /** Inclusive start, epoch ms. */
  startDate: number;
  /** Inclusive end, epoch ms. */
  endDate: number;
}

export async function getDailyUsage(
  http: CursorHttp,
  window: AdminWindow,
  pageSize = PAGE_SIZE,
): Promise<DailyUsageRow[]> {
  return collectPages({
    fetchPage: async (page) => {
      const res = await http.request({
        method: "POST",
        path: "/teams/daily-usage-data",
        group: "adminGeneral",
        body: { startDate: window.startDate, endDate: window.endDate, page, pageSize },
        schema: DailyUsageResponseSchema,
      });
      return res.data!;
    },
    getItems: (d) => d.data,
    getPagination: (d) => d.pagination,
  });
}

export interface UsageEventsQuery extends AdminWindow {
  email?: string;
  userId?: number;
}

export async function getUsageEvents(
  http: CursorHttp,
  query: UsageEventsQuery,
  pageSize = PAGE_SIZE,
): Promise<UsageEvent[]> {
  return collectPages({
    fetchPage: async (page) => {
      const res = await http.request({
        method: "POST",
        path: "/teams/filtered-usage-events",
        group: "adminGeneral",
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
  });
}

export interface AuditLogsQuery {
  /** Inclusive start, epoch ms. */
  startTime: number;
  /** Inclusive end, epoch ms. */
  endTime: number;
  eventTypes?: string;
  search?: string;
}

export async function getAuditLogs(
  http: CursorHttp,
  query: AuditLogsQuery,
  pageSize = PAGE_SIZE,
): Promise<AuditLogEvent[]> {
  return collectPages({
    fetchPage: async (page) => {
      const res = await http.request({
        method: "GET",
        path: "/teams/audit-logs",
        group: "adminGeneral",
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
  });
}
