import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ChartCard, Columns, HBars, SERIES, type SeriesDef } from "@/components/charts/ChartKit";
import { fetchAdminActivity, type AdminUser } from "@/lib/adminApi";
import { roleLabel } from "@/lib/roles";
import type { SourceDTO } from "@/lib/sourcesApi";

const ACTIVITY: SeriesDef[] = [
  { key: "version", label: "Versions", color: SERIES[0] },
  { key: "source", label: "Sources", color: SERIES[1] },
  { key: "user", label: "Users & access", color: SERIES[2] },
  { key: "share", label: "Sharing", color: SERIES[3] },
  { key: "client", label: "Browser errors", color: SERIES[4] },
];
const SIGN_INS: SeriesDef[] = [
  { key: "signIns", label: "Successful", color: SERIES[0] },
  { key: "failedSignIns", label: "Failed", color: SERIES[1] },
];
const MB = (n: number) => `${n.toFixed(n < 10 ? 1 : 0)} MB`;

/** Admin overview charts: audit activity and sign-ins over time, storage per source, users by role. */
export function AdminCharts({ sources, users }: { sources: SourceDTO[]; users: AdminUser[] }) {
  const [days, setDays] = useState("30");
  const activity = useQuery({ queryKey: ["admin-activity", days], queryFn: () => fetchAdminActivity(Number(days)) });
  const rows = (activity.data ?? []).map((d) => ({
    ...d,
    label: new Date(`${d.day}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" }),
  }));

  const storage = sources
    .map((s) => ({ name: s.name, mb: s.versions.reduce((n, v) => n + v.fileBytes, 0) / 1_048_576, versions: s.versions.length }))
    .sort((a, b) => b.mb - a.mb);
  const roles = (["admin", "editor", "viewer"] as const).map((r) => ({ label: roleLabel(r), count: users.filter((u) => u.role === r).length }));

  const range = (
    <ToggleGroup type="single" size="sm" value={days} onValueChange={(v) => v && setDays(v)} aria-label="Time range">
      {["7", "30", "90"].map((d) => (
        <ToggleGroupItem key={d} value={d} className="h-7 px-2 text-xs">
          {d}d
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <ChartCard
        title="Activity"
        description={`Audit events per day, last ${days} days.`}
        legend={ACTIVITY}
        actions={range}
        className="lg:col-span-3"
        table={{
          columns: ["Day", ...ACTIVITY.map((s) => s.label)],
          rows: rows.map((r) => [r.day, ...ACTIVITY.map((s) => r[s.key as keyof typeof r] as number)]),
        }}
      >
        {activity.isError ? (
          <p className="text-xs text-destructive-text">Could not load activity.</p>
        ) : (
          <Columns data={rows} xKey="label" series={ACTIVITY} height={240} />
        )}
      </ChartCard>
      <ChartCard
        title="Sign-ins"
        description="Successful and failed sign-in attempts per day."
        legend={SIGN_INS}
        table={{ columns: ["Day", "Successful", "Failed"], rows: rows.map((r) => [r.day, r.signIns, r.failedSignIns]) }}
      >
        <Columns data={rows} xKey="label" series={SIGN_INS} height={200} />
      </ChartCard>
      <ChartCard
        title="Stored uploads by source"
        description="Original XML size of every kept version."
        table={{ columns: ["Source", "MB", "Versions"], rows: storage.map((s) => [s.name, Number(s.mb.toFixed(2)), s.versions]) }}
      >
        <HBars data={storage} labelKey="name" series={[{ key: "mb", label: "MB", color: SERIES[0] }]} valueFormat={MB} />
      </ChartCard>
      <ChartCard title="Users by role" table={{ columns: ["Role", "Users"], rows: roles.map((r) => [r.label, r.count]) }}>
        <HBars data={roles} labelKey="label" series={[{ key: "count", label: "Users", color: SERIES[0] }]} />
      </ChartCard>
    </div>
  );
}
