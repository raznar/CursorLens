import { Check, Gauge, Keyboard, Zap } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { ChartCard } from "@/components/dashboard/chart-card";
import { SeriesChart } from "@/components/dashboard/series-chart";
import { QueryTable, type QueryColumn } from "@/components/dashboard/query-table";
import { resolveRange } from "@/lib/date-range";
import { formatCompact, formatPercent } from "@/lib/format";
import { getProductivity } from "@/lib/queries/productivity";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

const LEADERBOARD_COLUMNS: QueryColumn[] = [
  { key: "rank", header: "#", format: "number" },
  { key: "email", header: "User" },
  { key: "accepts", header: "Accepts", format: "compact" },
  { key: "linesAccepted", header: "Lines", format: "compact" },
  { key: "acceptRatio", header: "Accept %", format: "percent" },
];

export default async function ProductivityPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const range = resolveRange(typeof sp.range === "string" ? sp.range : undefined);
  const data = getProductivity(range);

  return (
    <>
      <PageHeader
        title="Productivity"
        description={`Agent edit and Tab acceptance, file extensions, and leaderboards over the ${range.label.toLowerCase()}.`}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Agent edit acceptance"
          value={data.agentAcceptance == null ? "—" : formatPercent(data.agentAcceptance)}
          icon={<Gauge className="h-4 w-4" />}
          footer="Accepted vs rejected diffs"
        />
        <KpiCard
          label="Tab acceptance"
          value={data.tabAcceptance == null ? "—" : formatPercent(data.tabAcceptance)}
          icon={<Keyboard className="h-4 w-4" />}
          footer="Accepts vs suggestions"
        />
        <KpiCard
          label="Diffs accepted"
          value={formatCompact(data.diffsAccepted)}
          icon={<Check className="h-4 w-4" />}
          footer={range.label}
        />
        <KpiCard
          label="Tab accepts"
          value={formatCompact(data.tabAccepts)}
          icon={<Zap className="h-4 w-4" />}
          footer={range.label}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Agent edits over time"
          description="Accepted vs rejected AI-suggested diffs per day"
          isEmpty={data.agentEdits.length === 0}
        >
          <SeriesChart
            data={data.agentEdits}
            xKey="date"
            xFormat="date"
            kind="area"
            valueFormat="compact"
            series={[
              { key: "accepted", label: "Accepted", color: "hsl(var(--success))" },
              { key: "rejected", label: "Rejected", color: "hsl(var(--destructive))" },
            ]}
          />
        </ChartCard>
        <ChartCard
          title="Tab usage over time"
          description="Tab accepts vs suggestions per day"
          isEmpty={data.tabs.length === 0}
        >
          <SeriesChart
            data={data.tabs}
            xKey="date"
            xFormat="date"
            kind="line"
            valueFormat="compact"
            series={[
              { key: "accepts", label: "Accepts" },
              { key: "suggestions", label: "Suggestions" },
            ]}
          />
        </ChartCard>
      </div>

      <ChartCard
        title="Top file extensions"
        description="Lines accepted by file extension"
        isEmpty={data.topExtensions.length === 0}
      >
        <SeriesChart
          data={data.topExtensions}
          xKey="key"
          kind="bar"
          valueFormat="compact"
          series={[{ key: "value", label: "Lines accepted" }]}
        />
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Agent leaderboard" description="Top members by agent acceptance">
          <QueryTable
            rows={data.agentLeaderboard}
            searchPlaceholder="Search members…"
            csvFilename="agent-leaderboard.csv"
            initialSort={{ key: "rank", dir: "asc" }}
            emptyMessage="No leaderboard data yet."
            columns={LEADERBOARD_COLUMNS}
          />
        </ChartCard>
        <ChartCard title="Tab leaderboard" description="Top members by Tab acceptance">
          <QueryTable
            rows={data.tabLeaderboard}
            searchPlaceholder="Search members…"
            csvFilename="tab-leaderboard.csv"
            initialSort={{ key: "rank", dir: "asc" }}
            emptyMessage="No leaderboard data yet."
            columns={LEADERBOARD_COLUMNS}
          />
        </ChartCard>
      </div>
    </>
  );
}
