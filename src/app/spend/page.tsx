import { Activity, CreditCard, DollarSign, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { ChartCard } from "@/components/dashboard/chart-card";
import { SeriesChart } from "@/components/dashboard/series-chart";
import { QueryTable } from "@/components/dashboard/query-table";
import { resolveRange } from "@/lib/date-range";
import { formatCents, formatCompact } from "@/lib/format";
import { getSpend } from "@/lib/queries/spend";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function SpendPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const range = resolveRange(typeof sp.range === "string" ? sp.range : undefined);
  const data = getSpend(range);

  return (
    <>
      <PageHeader
        title="Spend"
        description="Cycle spend, top spenders, and usage-based vs included requests."
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Cycle spend"
          value={formatCents(data.totalSpendCents)}
          icon={<DollarSign className="h-4 w-4" />}
          footer="Current billing cycle"
        />
        <KpiCard
          label="Paying members"
          value={formatCompact(data.payingMembers)}
          icon={<Users className="h-4 w-4" />}
          footer="Members with spend this cycle"
        />
        <KpiCard
          label="Usage-based requests"
          value={formatCompact(data.usageBasedRequests)}
          icon={<CreditCard className="h-4 w-4" />}
          footer={range.label}
        />
        <KpiCard
          label="Included requests"
          value={formatCompact(data.includedRequests)}
          icon={<Activity className="h-4 w-4" />}
          footer={range.label}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Spend over time"
          description="Charged spend from usage events, per day"
          isEmpty={data.spendTrend.length === 0}
        >
          <SeriesChart
            data={data.spendTrend}
            xKey="date"
            xFormat="date"
            kind="line"
            valueFormat="cents"
            series={[{ key: "cents", label: "Spend" }]}
          />
        </ChartCard>
        <ChartCard
          title="Top spenders"
          description="Members by overall cycle spend"
          isEmpty={data.topSpenders.length === 0}
        >
          <SeriesChart
            data={data.topSpenders}
            xKey="key"
            kind="bar"
            valueFormat="cents"
            series={[{ key: "value", label: "Spend" }]}
          />
        </ChartCard>
      </div>

      <ChartCard
        title="Usage-based vs included requests"
        description="Daily request volume by billing source"
        isEmpty={data.requestSplitOverTime.length === 0}
      >
        <SeriesChart
          data={data.requestSplitOverTime}
          xKey="date"
          xFormat="date"
          kind="stackedArea"
          valueFormat="number"
          series={[
            { key: "included", label: "Included" },
            { key: "usageBased", label: "Usage-based" },
            { key: "apiKey", label: "API key" },
          ]}
        />
      </ChartCard>

      <ChartCard
        title="Per-user spend & limits"
        description="Cycle spend alongside each member's monthly and hard limits"
      >
        <QueryTable
          rows={data.perUser}
          searchPlaceholder="Search members…"
          csvFilename="user-spend.csv"
          initialSort={{ key: "overallSpendCents", dir: "desc" }}
          emptyMessage="No spend data yet."
          columns={[
            { key: "user", header: "User" },
            { key: "role", header: "Role" },
            { key: "overallSpendCents", header: "Overall spend", format: "cents" },
            { key: "spendCents", header: "Cycle spend", format: "cents" },
            { key: "monthlyLimitDollars", header: "Monthly limit", format: "dollars" },
            { key: "hardLimitDollars", header: "Hard limit", format: "dollars" },
          ]}
        />
      </ChartCard>
    </>
  );
}
