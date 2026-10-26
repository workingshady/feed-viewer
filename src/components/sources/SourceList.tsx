import { MarketBadge } from "@/components/MarketBadge";
import { useAppData } from "@/providers/useAppData";
import { useEffect, useMemo, useRef, useState } from "react";
import { Line, LineChart, ResponsiveContainer } from "recharts";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { liveVersionOf, type SourceDTO } from "@/lib/sourcesApi";
import type { SourceHealth } from "@/lib/versionStats";
import { HealthDot, ScoreBadge, healthOf } from "./health";
import { timeAgo } from "./format";

export type HealthFilter = "all" | SourceHealth;
type Sort = "name" | "listings" | "quality" | "updated";

const SORTS: Record<Sort, string> = {
  updated: "Newest",
  name: "A–Z",
  listings: "Largest",
  quality: "Lowest quality",
};

const FILTER_LABELS: Record<HealthFilter, string> = {
  all: "All",
  healthy: "Healthy",
  attention: "Needs attention",
  error: "Not live",
};

function Sparkline({ source }: { source: SourceDTO }) {
  const data = [...source.versions].reverse().map((v) => ({ n: v.listingCount }));
  if (data.length < 2) return <div className="h-5 w-14 shrink-0" />;
  return (
    <div className="h-5 w-14 shrink-0" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line type="monotone" dataKey="n" stroke="var(--series-1)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SourceList({
  sources,
  selectedId,
  onSelect,
  filter,
  onFilterChange,
}: {
  sources: SourceDTO[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  filter: HealthFilter;
  onFilterChange: (f: HealthFilter) => void;
}) {
  const { sourceMarket } = useAppData();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("updated");
  const listRef = useRef<HTMLUListElement>(null);
  // Keep the selected source visible inside the scroll area (e.g. when opened from a link).
  useEffect(() => {
    listRef.current?.querySelector("[data-selected]")?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  const all = useMemo(
    () =>
      sources.map((s) => {
        const live = liveVersionOf(s);
        const prev = live ? s.versions.find((v) => v.number < live.number) : undefined;
        return {
          s,
          live,
          health: healthOf(s),
          delta: live && prev ? live.listingCount - prev.listingCount : null,
          updated: s.versions[0]?.createdAt ?? s.createdAt,
        };
      }),
    [sources],
  );

  const counts = useMemo(() => {
    const c: Record<HealthFilter, number> = { all: all.length, healthy: 0, attention: 0, error: 0 };
    for (const r of all) c[r.health]++;
    return c;
  }, [all]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = all.filter(
      (r) => (filter === "all" || r.health === filter) && (!q || `${r.s.name} ${r.s.agencyName}`.toLowerCase().includes(q)),
    );
    const by: Record<Sort, (a: (typeof all)[number], b: (typeof all)[number]) => number> = {
      name: (a, b) => a.s.name.localeCompare(b.s.name),
      listings: (a, b) => (b.live?.listingCount ?? -1) - (a.live?.listingCount ?? -1),
      quality: (a, b) => (a.live?.stats?.score ?? 101) - (b.live?.stats?.score ?? 101),
      updated: (a, b) => b.updated.localeCompare(a.updated),
    };
    return filtered.sort(by[sort]);
  }, [all, query, filter, sort]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search sources" className="pl-8" aria-label="Search sources" />
        </div>
        <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
          <SelectTrigger className="w-[8.5rem] shrink-0" aria-label="Sort sources">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SORTS) as Sort[]).map((k) => (
              <SelectItem key={k} value={k}>
                {SORTS[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by health">
        {(Object.keys(FILTER_LABELS) as HealthFilter[])
          .filter((f) => f === "all" || counts[f] > 0)
          .map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => onFilterChange(f)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                filter === f ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted",
              )}
            >
              {f !== "all" && <HealthDot health={f} />}
              {FILTER_LABELS[f]} <span className="font-mono tabular-nums opacity-80">{counts[f]}</span>
            </button>
          ))}
      </div>

      <p className="text-xs text-muted-foreground">
        {rows.length === sources.length ? `${sources.length} sources` : `${rows.length} of ${sources.length} sources`}
      </p>
      {/* Own scroll area so a long list never pushes the details down the page. */}
      <ul
        ref={listRef}
        className="-mr-1 flex max-h-80 flex-col gap-1.5 overflow-y-auto overscroll-contain pr-1 md:max-h-[calc(100dvh-15rem)]"
        aria-label="Sources"
      >
        {rows.map(({ s, health, live, delta }) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onSelect(s.id)}
              aria-current={s.id === selectedId ? "true" : undefined}
              data-selected={s.id === selectedId || undefined}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-muted/60",
                s.id === selectedId ? "border-primary bg-muted/60" : "border-border bg-card",
              )}
            >
              <HealthDot health={health} />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-sm font-semibold text-foreground">{s.name}</span>
                  <MarketBadge code={sourceMarket(s)} detected={!s.market && !!sourceMarket(s)} />
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {live ? (
                    <>
                      v{live.number} · {live.listingCount.toLocaleString()}
                      {delta ? (
                        <span className={delta > 0 ? "text-success" : "text-destructive-text"}>
                          {" "}
                          ({delta > 0 ? "+" : ""}
                          {delta.toLocaleString()})
                        </span>
                      ) : null}{" "}
                      listings · {timeAgo(live.createdAt)}
                    </>
                  ) : (
                    "No live version"
                  )}
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
