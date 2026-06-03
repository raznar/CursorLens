import "server-only";
import { and, desc, isNotNull, sql } from "drizzle-orm";
import { auditLogs, db } from "@/db";
import { whenCacheReadable } from "./cache-guard";
import { dayFromMs, msBetween, type Range } from "./filters";

const EMPTY_AUDIT: AuditData = {
  rows: [],
  totalEvents: 0,
  uniqueUsers: 0,
  eventTypes: [],
  perDay: [],
};

export interface AuditRow {
  eventId: string;
  timestamp: number | null;
  userEmail: string | null;
  eventType: string | null;
  ipAddress: string | null;
}

export interface AuditData {
  rows: AuditRow[];
  totalEvents: number;
  uniqueUsers: number;
  eventTypes: string[];
  perDay: Array<{ date: string; count: number }>;
}

/** Maximum rows materialized to the client table (most recent first). */
const ROW_CAP = 5000;

/** Audit-log page: recent events (capped), per-day volume, and filter facets. */
export function getAudit(range: Range): AuditData {
  return whenCacheReadable(EMPTY_AUDIT, () => getAuditLoaded(range));
}

function getAuditLoaded(range: Range): AuditData {
  const rows = db
    .select({
      eventId: auditLogs.event_id,
      timestamp: auditLogs.timestamp,
      userEmail: auditLogs.user_email,
      eventType: auditLogs.event_type,
      ipAddress: auditLogs.ip_address,
    })
    .from(auditLogs)
    .where(msBetween(auditLogs.timestamp, range))
    .orderBy(desc(auditLogs.timestamp))
    .limit(ROW_CAP)
    .all();

  const [summary] = db
    .select({
      total: sql<number>`count(*)`,
      users: sql<number>`count(distinct ${auditLogs.user_email})`,
    })
    .from(auditLogs)
    .where(msBetween(auditLogs.timestamp, range))
    .all();

  const typeRows = db
    .select({ eventType: auditLogs.event_type })
    .from(auditLogs)
    .where(and(msBetween(auditLogs.timestamp, range), isNotNull(auditLogs.event_type)))
    .groupBy(auditLogs.event_type)
    .orderBy(auditLogs.event_type)
    .all();

  const day = dayFromMs(auditLogs.timestamp);
  const perDay = db
    .select({ date: day, count: sql<number>`count(*)` })
    .from(auditLogs)
    .where(msBetween(auditLogs.timestamp, range))
    .groupBy(day)
    .orderBy(day)
    .all();

  return {
    rows,
    totalEvents: summary?.total ?? 0,
    uniqueUsers: summary?.users ?? 0,
    eventTypes: typeRows.map((r) => r.eventType).filter((t): t is string => !!t),
    perDay,
  };
}
