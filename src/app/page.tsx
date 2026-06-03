import { Activity, CheckCheck, Code, DollarSign, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { ChartCard } from "@/components/dashboard/chart-card";
import { SeriesChart } from "@/components/dashboard/series-chart";
import { SyncStatusBadge } from "@/components/dashboard/sync-status-badge";
import { resolveRange } from "@/lib/date-range";
import { formatCents, formatCompact, formatNumber, formatPercent } from "@/lib/format";
import { getOverview } from "@/lib/queries/overview";
import { getLatestSyncStatus } from "@/lib/queries/sync";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function OverviewPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const range = resolveRange(typeof sp.range === "string" ? sp.range : undefined);
  const { kpis, dauTrend, spendTrend, topModels } = getOverview(range);
  const sync = getLatestSyncStatus();

  return (
    <>
      <PageHeader
        title="Overview"
        description={`Team activity, spend, and adoption over the ${range.label.toLowerCase()}.`}
        meta={<SyncStatusBadge status={sync.status} at={sync.at} />}
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard
          label="Active users"
          value={formatNumber(kpis.latestDau)}
          delta={kpis.dauDelta}
          icon={<Users className="h-4 w-4" />}
          footer="Latest daily active users"
        />
        <KpiCard
          label="Cycle spend"
          value={formatCents(kpis.cycleSpendCents)}
          icon={<DollarSign className="h-4 w-4" />}
          footer="Current billing cycle"
        />
        <KpiCard
          label="Requests"
          value={formatCompact(kpis.totalRequests)}
          delta={kpis.requestsDelta}
          icon={<Activity className="h-4 w-4" />}
          footer={range.label}
        />
        <KpiCard
          label="Lines accepted"
          value={formatCompact(kpis.linesAccepted)}
          delta={kpis.linesDelta}
          icon={<Code className="h-4 w-4" />}
          footer={range.label}
        />
        <KpiCard
          label="Acceptance rate"
          value={kpis.acceptanceRate == null ? "—" : formatPercent(kpis.acceptanceRate)}
          delta={kpis.acceptanceDelta}
          icon={<CheckCheck className="h-4 w-4" />}
          footer="Applies accepted vs rejected"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Daily active users"
          description="Unique active users per day"
          isEmpty={dauTrend.length === 0}
        >
          <SeriesChart
            data={dauTrend}
            xKey="date"
            xFormat="date"
            kind="area"
            valueFormat="number"
            series={[{ key: "dau", label: "Active users" }]}
          />
        </ChartCard>

        <ChartCard
          title="Spend over time"
          description="Charged spend from usage events, per day"
          isEmpty={spendTrend.length === 0}
        >
          <SeriesChart
            data={spendTrend}
            xKey="date"
            xFormat="date"
            kind="line"
            valueFormat="cents"
            series={[{ key: "cents", label: "Spend" }]}
          />
        </ChartCard>
      </div>

      <ChartCard
        title="Top models"
        description="Messages by model across the selected window"
        isEmpty={topModels.length === 0}
      >
        <SeriesChart
          data={topModels}
          xKey="key"
          kind="bar"
          valueFormat="compact"
          series={[{ key: "value", label: "Messages" }]}
        />
      </ChartCard>
    </>
  );
}
