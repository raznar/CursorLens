import { Activity, Cpu, Gauge, MessageSquare } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { ChartCard } from "@/components/dashboard/chart-card";
import { SeriesChart } from "@/components/dashboard/series-chart";
import { QueryTable } from "@/components/dashboard/query-table";
import { resolveRange } from "@/lib/date-range";
import { formatCompact, formatPercent, formatTokens } from "@/lib/format";
import { getModels } from "@/lib/queries/models";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function ModelsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const range = resolveRange(typeof sp.range === "string" ? sp.range : undefined);
  const data = getModels(range);
  const totalMessages = data.modelMix.reduce((sum, row) => sum + row.messages, 0);

  return (
    <>
      <PageHeader
        title="Models"
        description={`AI model mix, max-mode share, and per-model cost over the ${range.label.toLowerCase()}.`}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Messages"
          value={formatCompact(totalMessages)}
          icon={<MessageSquare className="h-4 w-4" />}
          footer={range.label}
        />
        <KpiCard
          label="Usage events"
          value={formatCompact(data.events)}
          icon={<Activity className="h-4 w-4" />}
          footer="Billable + included requests"
        />
        <KpiCard
          label="Max-mode share"
          value={data.maxModeShare == null ? "—" : formatPercent(data.maxModeShare)}
          icon={<Gauge className="h-4 w-4" />}
          footer="Events using max mode"
        />
        <KpiCard
          label="Tokens"
          value={formatTokens(data.totalTokens)}
          icon={<Cpu className="h-4 w-4" />}
          footer="Input + output + cache"
        />
      </div>

      <ChartCard
        title="Model usage over time"
        description="Messages per model per day"
        isEmpty={data.messagesOverTime.keys.length === 0}
      >
        <SeriesChart
          data={data.messagesOverTime.data}
          xKey="date"
          xFormat="date"
          kind="stackedArea"
          valueFormat="compact"
          series={data.messagesOverTime.keys.map((key) => ({ key, label: key }))}
        />
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Cost by model"
          description="Charged spend per model from usage events"
          isEmpty={data.costByModel.length === 0}
        >
          <SeriesChart
            data={data.costByModel}
            xKey="model"
            kind="bar"
            valueFormat="cents"
            series={[{ key: "cents", label: "Cost" }]}
          />
        </ChartCard>
        <ChartCard
          title="Tokens by model"
          description="Total tokens per model from usage events"
          isEmpty={data.tokensByModel.length === 0}
        >
          <SeriesChart
            data={data.tokensByModel}
            xKey="model"
            kind="bar"
            valueFormat="tokens"
            series={[{ key: "tokens", label: "Tokens" }]}
          />
        </ChartCard>
      </div>

      <ChartCard title="Model mix" description="Share of messages by model">
        <QueryTable
          rows={data.modelMix}
          searchable={false}
          initialSort={{ key: "messages", dir: "desc" }}
          emptyMessage="No model usage in this window."
          columns={[
            { key: "model", header: "Model" },
            { key: "messages", header: "Messages", format: "compact" },
            { key: "share", header: "Share", format: "percent" },
          ]}
        />
      </ChartCard>

      <ChartCard title="Model usage by user" description="Messages per user per model">
        <QueryTable
          rows={data.byUser}
          searchPlaceholder="Search users or models…"
          csvFilename="model-usage-by-user.csv"
          initialSort={{ key: "messages", dir: "desc" }}
          emptyMessage="No per-user model data in this window."
          columns={[
            { key: "email", header: "User" },
            { key: "model", header: "Model" },
            { key: "messages", header: "Messages", format: "compact" },
          ]}
        />
      </ChartCard>
    </>
  );
}
