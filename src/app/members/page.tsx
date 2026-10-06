import { UserCheck, UserMinus, Users, Zap } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { ChartCard } from "@/components/dashboard/chart-card";
import { QueryTable } from "@/components/dashboard/query-table";
import { resolveRange } from "@/lib/date-range";
import { formatNumber } from "@/lib/format";
import { getMembers } from "@/lib/queries/members";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function MembersPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const range = resolveRange(typeof sp.range === "string" ? sp.range : undefined);
  const data = getMembers(range);

  return (
    <>
      <PageHeader
        title="Members"
        description="Team roster joined with current-cycle spend and recent activity."
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Total members"
          value={formatNumber(data.total)}
          icon={<Users className="h-4 w-4" />}
        />
        <KpiCard
          label="Active members"
          value={formatNumber(data.active)}
          icon={<UserCheck className="h-4 w-4" />}
        />
        <KpiCard
          label="Active in range"
          value={formatNumber(data.activeInRange)}
          icon={<Zap className="h-4 w-4" />}
          footer={range.label}
        />
        <KpiCard
          label="Removed"
          value={formatNumber(data.removed)}
          icon={<UserMinus className="h-4 w-4" />}
        />
      </div>

      <ChartCard
        title="Members"
        description="Role, status, directory groups, spend, last active day, and most-used model"
      >
        <QueryTable
          rows={data.members}
          searchPlaceholder="Search members, roles, groups, models…"
          csvFilename="members.csv"
          pageSize={50}
          initialSort={{ key: "spendCents", dir: "desc" }}
          emptyMessage="No members synced yet."
          columns={[
            { key: "email", header: "Email" },
            { key: "name", header: "Name" },
            { key: "role", header: "Role" },
            { key: "status", header: "Status" },
            { key: "groups", header: "Directory groups" },
            { key: "spendCents", header: "Spend", format: "cents" },
            { key: "lastActive", header: "Last active", format: "date" },
            { key: "model", header: "Most-used model" },
          ]}
        />
      </ChartCard>

      <ChartCard
        title="Directory groups"
        description="Team directory groups with member counts, per-member monthly limits, and summed current-cycle spend"
      >
        <QueryTable
          rows={data.groups}
          searchPlaceholder="Search groups…"
          csvFilename="directory-groups.csv"
          initialSort={{ key: "spendCents", dir: "desc" }}
          emptyMessage="No directory groups synced yet."
          columns={[
            { key: "group", header: "Group" },
            { key: "members", header: "Members", format: "number" },
            { key: "monthlyLimitDollars", header: "Monthly limit / member", format: "dollars" },
            { key: "spendCents", header: "Cycle spend", format: "cents" },
          ]}
        />
      </ChartCard>
    </>
  );
}
