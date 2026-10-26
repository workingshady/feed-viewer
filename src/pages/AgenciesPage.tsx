import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, Calendar, Search, ArrowRight, Link2, Globe, Users, Layers } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { SourceHealth } from "@/lib/versionStats";
import AppHeader from "@/components/AppHeader";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAppData } from "@/providers/DataProvider";
import { AGENCIES_DIRECTORY_SUBTITLE } from "@/lib/agencyDirectoryCopy";
import { AgencyLogo } from "@/components/AgencyLogo";
import { HealthDot, ScoreBadge, healthOf } from "@/components/sources/health";
import { timeAgo } from "@/components/sources/format";
import { liveVersionOf } from "@/lib/sourcesApi";

type AgencyRow = {
  name: string;
  listingsCount: number;
  importsCount: number;
  lastImportedAt: string | null;
  quality: number | null;
  health: ReturnType<typeof healthOf>;
  logo?: string;
  website?: string;
  email?: string;
  phone?: string;
  sale: number;
  rent: number;
  agents: number;
};

type AgencySort = "listings" | "quality" | "updated" | "agents" | "name";

/** "https://www.example.com/en" -> "example.com" — the part people actually recognise. */
const hostOf = (url?: string) => {
  if (!url) return null;
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

const HEALTH_LABEL: Record<SourceHealth, string> = {
  healthy: "Healthy",
  attention: "Needs attention",
  error: "No live version",
};

function QualityMeter({ score }: { score: number | null }) {
  const tone = score == null ? "bg-muted-foreground/30" : score >= 80 ? "bg-success" : score >= 60 ? "bg-warning" : "bg-destructive";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
      <div className={cn("h-full rounded-full", tone)} style={{ width: `${score ?? 0}%` }} />
    </div>
  );
}

const AgenciesPage = () => {
  const { sources, listingsByAgency } = useAppData();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<AgencySort>("listings");
  const [health, setHealth] = useState<"all" | SourceHealth>("all");

  const agencies = useMemo(() => {
    const arr: AgencyRow[] = [];
    for (const s of sources) {
      if (!s.name.trim()) continue;
      const info = s.agencyInfo;
      const rows = listingsByAgency.get(s.name) ?? [];
      let sale = 0;
      let rent = 0;
      const agentNames = new Set<string>();
      for (const l of rows) {
        if (l.purpose === "sale") sale++;
        else if (l.purpose === "rent") rent++;
        const n = l.agent?.name?.trim();
        if (n) agentNames.add(n.toLowerCase());
      }
      arr.push({
        name: s.name,
        listingsCount: rows.length,
        sale,
        rent,
        agents: agentNames.size,
        importsCount: s.versions.length,
        lastImportedAt: s.versions[0]?.createdAt ?? null,
        quality: liveVersionOf(s)?.stats?.score ?? null,
        health: healthOf(s),
        logo: info?.logo || undefined,
        website: info?.website || undefined,
        email: info?.email || undefined,
        phone: info?.phone || undefined,
      });
    }
    const cmp: Record<AgencySort, (x: AgencyRow, y: AgencyRow) => number> = {
      listings: (x, y) => y.listingsCount - x.listingsCount,
      quality: (x, y) => (y.quality ?? -1) - (x.quality ?? -1),
      updated: (x, y) => String(y.lastImportedAt ?? "").localeCompare(String(x.lastImportedAt ?? "")),
      agents: (x, y) => y.agents - x.agents,
      name: (x, y) => x.name.localeCompare(y.name),
    };
    arr.sort(cmp[sort]);
    const query = q.trim().toLowerCase();
    return arr.filter(
      (a) =>
        (health === "all" || a.health === health) &&
        (!query || a.name.toLowerCase().includes(query) || (a.website ?? "").toLowerCase().includes(query)),
    );
  }, [sources, listingsByAgency, q, sort, health]);
  const healthCounts = useMemo(() => {
    const c: Record<SourceHealth, number> = { healthy: 0, attention: 0, error: 0 };
    for (const s of sources) c[healthOf(s)]++;
    return c;
  }, [sources]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="container py-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-extrabold font-heading text-foreground flex items-center gap-2">
              <Building2 className="w-6 h-6 text-primary-text" /> Agencies
            </h1>
            <p className="text-sm text-muted-foreground max-w-2xl">{AGENCIES_DIRECTORY_SUBTITLE}</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row md:w-auto">
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or website…" className="pl-10" />
            </div>
            <Select value={sort} onValueChange={(v) => setSort(v as AgencySort)}>
              <SelectTrigger className="w-full sm:w-48" aria-label="Sort agencies">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="listings">Most listings</SelectItem>
                <SelectItem value="quality">Highest quality</SelectItem>
                <SelectItem value="updated">Recently updated</SelectItem>
                <SelectItem value="agents">Most agents</SelectItem>
                <SelectItem value="name">Name A → Z</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {sources.length > 0 && (
          <div className="mb-5 flex flex-wrap items-center gap-2" role="group" aria-label="Filter by health">
            {(["all", "healthy", "attention", "error"] as const).map((h) => {
              const on = health === h;
              const n = h === "all" ? sources.length : healthCounts[h];
              if (h !== "all" && n === 0) return null;
              return (
                <button
                  key={h}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setHealth(h)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    on
                      ? "border-primary/30 bg-primary/10 text-primary-text"
                      : "border-border bg-card text-muted-foreground hover:border-primary/25 hover:text-foreground",
                  )}
                >
                  {h !== "all" && <HealthDot health={h} />}
                  {h === "all" ? "All" : HEALTH_LABEL[h]}
                  <span className="tabular-nums opacity-70">{n}</span>
                </button>
              );
            })}
          </div>
        )}

        {agencies.length >= 2 && (
          <Card className="mb-6 p-4 border-primary/25 bg-gradient-to-r from-primary/5 to-transparent">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-primary-text" />
                  Cross-agency duplicate check
                </p>
                <p className="text-xs text-muted-foreground mt-1 max-w-xl">
                  You have multiple agencies in import history. Open the matcher to find the same property listed under
                  different brands (permit, map, photos, heuristics).
                </p>
              </div>
              <Button asChild variant="default" size="sm" className="shrink-0">
                <Link to="/cross-agency-dupes">Open matcher</Link>
              </Button>
            </div>
          </Card>
        )}

        {sources.length === 0 ? (
          <Card className="p-10 text-center">
            <div className="text-lg font-bold text-foreground mb-2">No feeds yet</div>
            <div className="text-sm text-muted-foreground mb-5">Add a source and upload a feed to populate agencies.</div>
            <Button asChild>
              <Link to="/sources">Go to Sources</Link>
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {agencies.map((a) => {
              const site = hostOf(a.website && a.website.trim().toLowerCase() !== a.name.trim().toLowerCase() ? a.website : undefined);
              const contact = site ?? a.email ?? a.phone ?? null;
              const salePct = a.listingsCount ? (a.sale / a.listingsCount) * 100 : 0;
              const rentPct = a.listingsCount ? (a.rent / a.listingsCount) * 100 : 0;
              return (
                <Link
                  key={a.name}
                  to={`/agencies/${encodeURIComponent(a.name)}`}
                  className="group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Card className="flex h-full flex-col gap-5 rounded-2xl p-5 shadow-[var(--shadow-card)] transition-[border-color,box-shadow,transform] duration-200 group-hover:-translate-y-0.5 group-hover:border-primary/35 group-hover:shadow-[var(--shadow-card-hover)]">
                    <div className="flex items-start gap-4">
                      <AgencyLogo src={a.logo} name={a.name} className="h-16 w-28 rounded-xl text-base" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <h2 className="truncate font-heading text-lg font-extrabold leading-tight text-foreground" title={a.name}>
                            {a.name}
                          </h2>
                          <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary-text" />
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <HealthDot health={a.health} withLabel />
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="h-3 w-3" aria-hidden />
                            {a.lastImportedAt ? timeAgo(a.lastImportedAt) : "never"}
                          </span>
                        </div>
                        {contact && (
                          <div className="mt-1 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                            <Globe className="h-3 w-3 shrink-0" aria-hidden />
                            <span className="truncate">{contact}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          ["Listings", a.listingsCount.toLocaleString(), null],
                          ["Agents", a.agents.toLocaleString(), Users],
                          ["Versions", String(a.importsCount), Layers],
                        ] as const
                      ).map(([label, value, Icon]) => (
                        <div key={label} className="rounded-xl bg-muted/60 p-3 ring-1 ring-inset ring-border/60">
                          <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {Icon && <Icon className="h-3 w-3" aria-hidden />} {label}
                          </div>
                          <div className="font-heading text-lg font-bold tabular-nums text-foreground">{value}</div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-auto space-y-3">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-muted-foreground">Quality</span>
                          <ScoreBadge score={a.quality} />
                        </div>
                        <QualityMeter score={a.quality} />
                      </div>
                      {a.listingsCount > 0 && (
                        <div className="space-y-1.5">
                          <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
                            <div className="h-full bg-primary-text" style={{ width: `${salePct}%` }} />
                            <div className="h-full bg-secondary" style={{ width: `${rentPct}%` }} />
                          </div>
                          <div className="flex items-center justify-between text-[11px] tabular-nums text-muted-foreground">
                            <span className="inline-flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full bg-primary-text" aria-hidden /> Sale {a.sale.toLocaleString()}
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full bg-secondary" aria-hidden /> Rent {a.rent.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </Card>
                </Link>
              );
            })}
            {agencies.length === 0 && (
              <p className="col-span-full py-10 text-center text-sm text-muted-foreground">No agencies match these filters.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AgenciesPage;
