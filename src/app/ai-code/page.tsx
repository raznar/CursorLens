import { Bot, GitCommit, Percent, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { ChartCard } from "@/components/dashboard/chart-card";
import { SeriesChart } from "@/components/dashboard/series-chart";
import { QueryTable } from "@/components/dashboard/query-table";
import { resolveRange } from "@/lib/date-range";
import { formatCompact, formatPercent } from "@/lib/format";
import { getAiCode } from "@/lib/queries/ai-code";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function AiCodePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const range = resolveRange(typeof sp.range === "string" ? sp.range : undefined);
  const data = getAiCode(range);
  const { totals } = data;

  return (
    <>
      <PageHeader
        title="AI code"
        description={`How much committed code came from Tab and Agent over the ${range.label.toLowerCase()}. Source: AI Code Tracking API (Enterprise alpha; multi-root workspaces are not tracked).`}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="AI share of added lines"
          value={totals.aiShare == null ? "—" : formatPercent(totals.aiShare)}
          icon={<Percent className="h-4 w-4" />}
          footer={`${formatCompact(totals.tabLinesAdded + totals.composerLinesAdded)} of ${formatCompact(totals.totalLinesAdded)} lines`}
        />
        <KpiCard
          label="Commits tracked"
          value={formatCompact(totals.commits)}
          icon={<GitCommit className="h-4 w-4" />}
          footer={range.label}
        />
        <KpiCard
          label="Agent (Composer) lines"
          value={formatCompact(totals.composerLinesAdded)}
          icon={<Bot className="h-4 w-4" />}
          footer="Added lines attributed to Agent edits"
        />
        <KpiCard
          label="Tab lines"
          value={formatCompact(totals.tabLinesAdded)}
          icon={<Sparkles className="h-4 w-4" />}
          footer={`${formatCompact(totals.changes)} accepted AI changes`}
        />
      </div>

      <ChartCard
        title="Added lines by attribution"
        description="Lines committed per day: Tab, Agent (Composer), and non-AI"
        isEmpty={data.linesByDay.length === 0}
        emptyMessage="No AI code tracking data yet. This endpoint is Enterprise alpha; the sync records a 401/403 when it is not enabled for your team."
      >
        <SeriesChart
          data={data.linesByDay}
          xKey="date"
          xFormat="date"
          kind="stackedArea"
          valueFormat="compact"
          series={[
            { key: "composer", label: "Agent" },
            { key: "tab", label: "Tab" },
            { key: "nonAi", label: "Non-AI" },
          ]}
        />
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Accepted AI changes"
          description="Per day, by source"
          isEmpty={data.changesByDay.data.length === 0}
        >
          <SeriesChart
            data={data.changesByDay.data}
            xKey="date"
            xFormat="date"
            kind="stackedBar"
            valueFormat="number"
            series={data.changesByDay.keys.map((key) => ({ key, label: key }))}
          />
        </ChartCard>
        <ChartCard
          title="Commits by origin"
          description="IDE, CLI, or cloud agent"
          isEmpty={data.bySource.length === 0}
        >
          <SeriesChart
            data={data.bySource}
            xKey="key"
            kind="donut"
            valueFormat="number"
            series={[{ key: "value", label: "Commits" }]}
          />
        </ChartCard>
        <ChartCard
          title="AI lines by repository"
          description="Tab + Agent lines added, top repositories"
          isEmpty={data.byRepo.length === 0}
        >
          <SeriesChart
            data={data.byRepo}
            xKey="key"
            kind="bar"
            valueFormat="compact"
            series={[{ key: "value", label: "AI lines" }]}
          />
        </ChartCard>
        <ChartCard
          title="AI lines by contributor"
          description="Tab + Agent lines added, top contributors"
          isEmpty={data.byUser.length === 0}
        >
          <SeriesChart
            data={data.byUser}
            xKey="key"
            kind="bar"
            valueFormat="compact"
            series={[{ key: "value", label: "AI lines" }]}
          />
        </ChartCard>
        <ChartCard
          title="Accepted AI lines by file type"
          description="From per-change file metadata (omitted in privacy mode)"
          isEmpty={data.byExtension.length === 0}
        >
          <SeriesChart
            data={data.byExtension}
            xKey="key"
            kind="bar"
            valueFormat="compact"
            series={[{ key: "value", label: "Lines" }]}
          />
        </ChartCard>
        <ChartCard
          title="Agent changes by model"
          description="Accepted Composer changes per model"
          isEmpty={data.byModel.length === 0}
        >
          <SeriesChart
            data={data.byModel}
            xKey="key"
            kind="bar"
            valueFormat="number"
            series={[{ key: "value", label: "Changes" }]}
          />
        </ChartCard>
      </div>

      <ChartCard title="Recent commits" description="Most recent 500 tracked commits in range">
        <QueryTable
          rows={data.commits}
          searchPlaceholder="Search commits, repos, users…"
          csvFilename="ai-code-commits.csv"
          pageSize={25}
          initialSort={{ key: "commitDay", dir: "desc" }}
          emptyMessage="No commits tracked in this range."
          columns={[
            { key: "commitDay", header: "Day", format: "date" },
            { key: "shortHash", header: "Commit" },
            { key: "repo", header: "Repository" },
            { key: "branch", header: "Branch" },
            { key: "user", header: "Author" },
            { key: "source", header: "Origin" },
            { key: "totalLinesAdded", header: "Lines added", format: "compact" },
            { key: "aiLinesAdded", header: "AI lines", format: "compact" },
            { key: "aiShare", header: "AI share", format: "percent" },
            { key: "message", header: "Message" },
          ]}
        />
      </ChartCard>
    </>
  );
}
