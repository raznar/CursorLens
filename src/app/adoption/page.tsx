import { UserCheck, UserMinus, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { ChartCard } from "@/components/dashboard/chart-card";
import { SeriesChart } from "@/components/dashboard/series-chart";
import { resolveRange } from "@/lib/date-range";
import { formatNumber } from "@/lib/format";
import { getAdoption } from "@/lib/queries/adoption";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function AdoptionPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const range = resolveRange(typeof sp.range === "string" ? sp.range : undefined);
  const { dau, peakDau, avgDau, clientVersions, members } = getAdoption(range);

  return (
    <>
      <PageHeader
        title="Adoption"
        description={`Active users, surfaces, and client versions over the ${range.label.toLowerCase()}.`}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Active members"
          value={formatNumber(members.active)}
          icon={<UserCheck className="h-4 w-4" />}
          footer={`${formatNumber(members.total)} total`}
        />
        <KpiCard
          label="Removed members"
          value={formatNumber(members.removed)}
          icon={<UserMinus className="h-4 w-4" />}
        />
        <KpiCard
          label="Peak DAU"
          value={formatNumber(peakDau)}
          icon={<Users className="h-4 w-4" />}
          footer={range.label}
        />
        <KpiCard
          label="Average DAU"
          value={formatNumber(avgDau)}
          icon={<Users className="h-4 w-4" />}
          footer={range.label}
        />
      </div>

      <ChartCard
        title="Daily active users by surface"
        description="Editor, CLI, Cloud Agent, and BugBot active users per day"
        isEmpty={dau.length === 0}
      >
        <SeriesChart
          data={dau}
          xKey="date"
          xFormat="date"
          kind="area"
          valueFormat="number"
          series={[
            { key: "dau", label: "Editor" },
            { key: "cliDau", label: "CLI" },
            { key: "cloudAgentDau", label: "Cloud Agent" },
            { key: "bugbotDau", label: "BugBot" },
          ]}
        />
      </ChartCard>

      <ChartCard
        title="Client versions"
        description="Distribution of Cursor client versions in use per day"
        isEmpty={clientVersions.keys.length === 0}
      >
        <SeriesChart
          data={clientVersions.data}
          xKey="date"
          xFormat="date"
          kind="stackedBar"
          valueFormat="number"
          series={clientVersions.keys.map((key) => ({ key, label: key }))}
        />
      </ChartCard>
    </>
  );
}
