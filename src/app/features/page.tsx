import { Bug, MessageCircle, Plug, Sparkles, Terminal } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { ChartCard } from "@/components/dashboard/chart-card";
import { SeriesChart } from "@/components/dashboard/series-chart";
import { resolveRange } from "@/lib/date-range";
import { formatCompact, formatPercent } from "@/lib/format";
import { getFeatures } from "@/lib/queries/features";
import { ratio } from "@/lib/queries/transforms";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function FeaturesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const range = resolveRange(typeof sp.range === "string" ? sp.range : undefined);
  const data = getFeatures(range);
  const resolvedRate = ratio(data.bugbot.resolvedTotal, data.bugbot.issuesTotal);

  return (
    <>
      <PageHeader
        title="Features"
        description={`MCP, commands, plans, skills, Ask mode, conversation insights, and BugBot over the ${range.label.toLowerCase()}.`}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="MCP calls"
          value={formatCompact(data.totals.mcp)}
          icon={<Plug className="h-4 w-4" />}
          footer={range.label}
        />
        <KpiCard
          label="Commands run"
          value={formatCompact(data.totals.commands)}
          icon={<Terminal className="h-4 w-4" />}
          footer={range.label}
        />
        <KpiCard
          label="Skills used"
          value={formatCompact(data.totals.skills)}
          icon={<Sparkles className="h-4 w-4" />}
          footer={range.label}
        />
        <KpiCard
          label="Ask-mode messages"
          value={formatCompact(data.totals.askMode)}
          icon={<MessageCircle className="h-4 w-4" />}
          footer={range.label}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="MCP adoption"
          description="Usage by MCP server"
          isEmpty={data.mcp.length === 0}
        >
          <SeriesChart
            data={data.mcp}
            xKey="key"
            kind="bar"
            valueFormat="number"
            series={[{ key: "value", label: "Usage" }]}
          />
        </ChartCard>
        <ChartCard
          title="Commands"
          description="Usage by command"
          isEmpty={data.commands.length === 0}
        >
          <SeriesChart
            data={data.commands}
            xKey="key"
            kind="bar"
            valueFormat="number"
            series={[{ key: "value", label: "Usage" }]}
          />
        </ChartCard>
        <ChartCard title="Plan mode" description="Usage by model" isEmpty={data.plans.length === 0}>
          <SeriesChart
            data={data.plans}
            xKey="key"
            kind="bar"
            valueFormat="number"
            series={[{ key: "value", label: "Usage" }]}
          />
        </ChartCard>
        <ChartCard title="Skills" description="Usage by skill" isEmpty={data.skills.length === 0}>
          <SeriesChart
            data={data.skills}
            xKey="key"
            kind="bar"
            valueFormat="number"
            series={[{ key: "value", label: "Usage" }]}
          />
        </ChartCard>
      </div>

      <ChartCard title="Ask mode" description="Usage by model" isEmpty={data.askMode.length === 0}>
        <SeriesChart
          data={data.askMode}
          xKey="key"
          kind="bar"
          valueFormat="number"
          series={[{ key: "value", label: "Usage" }]}
        />
      </ChartCard>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Conversation insights
        </h2>
        {data.insights.length === 0 ? (
          <ChartCard
            title="Conversation insights"
            description="Aggregate intents, complexity, categories, guidance, and work types"
            isEmpty
            emptyMessage="No conversation insights yet."
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {data.insights.map((slice) => (
              <ChartCard key={slice.slice} title={slice.label} description="Distribution">
                <SeriesChart
                  data={slice.items}
                  xKey="key"
                  kind="donut"
                  valueFormat="number"
                  series={[{ key: "value", label: slice.label }]}
                />
              </ChartCard>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          BugBot
        </h2>
        <div className="grid grid-cols-3 gap-4">
          <KpiCard
            label="Reviews"
            value={formatCompact(data.bugbot.reviews)}
            icon={<Bug className="h-4 w-4" />}
          />
          <KpiCard label="Issues found" value={formatCompact(data.bugbot.issuesTotal)} />
          <KpiCard
            label="Resolved"
            value={resolvedRate == null ? "—" : formatPercent(resolvedRate)}
            footer={`${formatCompact(data.bugbot.resolvedTotal)} resolved`}
          />
        </div>
        <ChartCard
          title="Issues by severity"
          description="BugBot issues found across reviewed PRs"
          isEmpty={data.bugbot.issuesTotal === 0}
        >
          <SeriesChart
            data={data.bugbot.bySeverity}
            xKey="key"
            kind="bar"
            valueFormat="number"
            series={[{ key: "value", label: "Issues" }]}
          />
        </ChartCard>
      </div>
    </>
  );
}
