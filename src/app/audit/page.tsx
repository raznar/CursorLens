import { ScrollText, Tags, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { ChartCard } from "@/components/dashboard/chart-card";
import { SeriesChart } from "@/components/dashboard/series-chart";
import { AuditTable } from "@/components/dashboard/audit-table";
import { resolveRange } from "@/lib/date-range";
import { formatCompact, formatNumber } from "@/lib/format";
import { getAudit } from "@/lib/queries/audit";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function AuditPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const range = resolveRange(typeof sp.range === "string" ? sp.range : undefined);
  const data = getAudit(range);

  return (
    <>
      <PageHeader
        title="Audit logs"
        description={`Security and administrative events over the ${range.label.toLowerCase()}.`}
      />

      <div className="grid grid-cols-3 gap-4">
        <KpiCard
          label="Events"
          value={formatCompact(data.totalEvents)}
          icon={<ScrollText className="h-4 w-4" />}
          footer={range.label}
        />
        <KpiCard
          label="Active users"
          value={formatNumber(data.uniqueUsers)}
          icon={<Users className="h-4 w-4" />}
        />
        <KpiCard
          label="Event types"
          value={formatNumber(data.eventTypes.length)}
          icon={<Tags className="h-4 w-4" />}
        />
      </div>

      <ChartCard
        title="Events per day"
        description="Audit event volume over time"
        isEmpty={data.perDay.length === 0}
      >
        <SeriesChart
          data={data.perDay}
          xKey="date"
          xFormat="date"
          kind="bar"
          valueFormat="number"
          series={[{ key: "count", label: "Events" }]}
        />
      </ChartCard>

      <ChartCard
        title="Events"
        description={
          data.totalEvents > data.rows.length
            ? `Showing the ${formatNumber(data.rows.length)} most recent of ${formatNumber(data.totalEvents)} events`
            : "Filterable, searchable audit trail"
        }
      >
        <AuditTable rows={data.rows} eventTypes={data.eventTypes} />
      </ChartCard>
    </>
  );
}
