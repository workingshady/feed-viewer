import { useMemo, useState } from "react";
import { Line, LineChart, ResponsiveContainer } from "recharts";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { liveVersionOf, type SourceDTO } from "@/lib/sourcesApi";
import type { SourceHealth } from "@/lib/versionStats";
import { HealthDot, ScoreBadge, healthOf } from "./health";
import { timeAgo } from "./format";

type Filter = "all" | SourceHealth;

function Sparkline({ source }: { source: SourceDTO }) {
  const data = [...source.versions].reverse().map((v) => ({ n: v.listingCount }));
  if (data.length < 2) return <div className="h-5 w-16" />;
  return (
    <div className="h-5 w-16" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line type="monotone" dataKey="n" stroke="hsl(var(--chart-line))" strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SourceList({
  sources,
  selectedId,
  onSelect,
}: {
  sources: SourceDTO[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sources
      .map((s) => ({ s, health: healthOf(s), live: liveVersionOf(s) }))
      .filter((r) => (filter === "all" || r.health === filter) && (!q || `${r.s.name} ${r.s.agencyName}`.toLowerCase().includes(q)));
  }, [sources, query, filter]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search sources" className="pl-8" aria-label="Search sources" />
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <SelectTrigger className="w-36" aria-label="Filter by health">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="healthy">Healthy</SelectItem>
            <SelectItem value="attention">Needs attention</SelectItem>
            <SelectItem value="error">No live version</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <ul className="flex flex-col gap-1.5" aria-label="Sources">
        {rows.map(({ s, health, live }) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onSelect(s.id)}
              aria-current={s.id === selectedId ? "true" : undefined}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-muted/60",
                s.id === selectedId ? "border-primary bg-muted/60" : "border-border bg-card",
              )}
            >
              <HealthDot health={health} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-foreground">{s.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {live ? `v${live.number} · ${live.listingCount.toLocaleString()} listings · ${timeAgo(live.createdAt)}` : "No live version"}
                  {` · ${s.versions.length} version${s.versions.length === 1 ? "" : "s"}`}
                </div>
              </div>
              <Sparkline source={s} />
              <ScoreBadge score={live?.stats?.score} />
            </button>
          </li>
        ))}
        {rows.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">No sources match.</li>}
      </ul>
    </div>
  );
}
