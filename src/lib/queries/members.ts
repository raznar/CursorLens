import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { dailyUsage, db, spend, teamMembers } from "@/db";
import { whenCacheReadable } from "./cache-guard";
import { dayBetween, type Range } from "./filters";

const EMPTY_MEMBERS: MembersData = {
  members: [],
  total: 0,
  active: 0,
  removed: 0,
  activeInRange: 0,
};

export interface MemberRow {
  email: string;
  name: string | null;
  role: string | null;
  status: string;
  spendCents: number;
  lastActive: string | null;
  model: string | null;
}

export interface MembersData {
  members: MemberRow[];
  total: number;
  active: number;
  removed: number;
  activeInRange: number;
}

/**
 * Members page: the team roster joined to current-cycle spend and the most recent active
 * day (with that day's most-used model) from the daily-usage rollup. All joins are by email.
 */
export function getMembers(range: Range): MembersData {
  return whenCacheReadable(EMPTY_MEMBERS, () => getMembersLoaded(range));
}

function getMembersLoaded(range: Range): MembersData {
  const members = db
    .select({
      id: teamMembers.id,
      email: teamMembers.email,
      name: teamMembers.name,
      role: teamMembers.role,
      isRemoved: teamMembers.is_removed,
    })
    .from(teamMembers)
    .all();

  const spendRows = db
    .select({ email: spend.email, cents: sql<number>`coalesce(${spend.overall_spend_cents}, 0)` })
    .from(spend)
    .all();
  const spendByEmail = new Map(
    spendRows.filter((r) => r.email).map((r) => [r.email!.toLowerCase(), r.cents]),
  );

  const lastActiveRows = db
    .select({ email: dailyUsage.email, lastDay: sql<string>`max(${dailyUsage.day})` })
    .from(dailyUsage)
    .where(eq(dailyUsage.is_active, true))
    .groupBy(dailyUsage.email)
    .all();
  const lastDayByEmail = new Map(
    lastActiveRows.filter((r) => r.email).map((r) => [r.email!.toLowerCase(), r.lastDay]),
  );

  const lastDays = [
    ...new Set(lastActiveRows.map((r) => r.lastDay).filter((d): d is string => !!d)),
  ];
  const modelRows = lastDays.length
    ? db
        .select({
          email: dailyUsage.email,
          day: dailyUsage.day,
          model: dailyUsage.most_used_model,
        })
        .from(dailyUsage)
        .where(inArray(dailyUsage.day, lastDays))
        .all()
    : [];
  const modelByKey = new Map<string, string | null>();
  for (const r of modelRows) {
    if (r.email) modelByKey.set(`${r.email.toLowerCase()}\u0000${r.day}`, r.model ?? null);
  }

  const rows: MemberRow[] = members.map((m) => {
    const emailKey = m.email.toLowerCase();
    const lastActive = lastDayByEmail.get(emailKey) ?? null;
    return {
      email: m.email,
      name: m.name,
      role: m.role,
      status: m.isRemoved ? "Removed" : "Active",
      spendCents: spendByEmail.get(emailKey) ?? 0,
      lastActive,
      model: lastActive ? (modelByKey.get(`${emailKey}\u0000${lastActive}`) ?? null) : null,
    };
  });

  const [activeRow] = db
    .select({ n: sql<number>`count(distinct ${dailyUsage.email})` })
    .from(dailyUsage)
    .where(and(eq(dailyUsage.is_active, true), dayBetween(dailyUsage.day, range)))
    .all();

  const total = rows.length;
  const removed = rows.filter((r) => r.status === "Removed").length;
  return {
    members: rows,
    total,
    active: total - removed,
    removed,
    activeInRange: activeRow?.n ?? 0,
  };
}
