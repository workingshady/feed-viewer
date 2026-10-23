import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Database,
  FileStack,
  Gauge,
  Home as HomeIcon,
  KeyRound,
  Loader2,
  Upload,
  Users,
} from "lucide-react";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SourceComparisonTable } from "@/components/SourceComparisonTable";
import { SourcePicker } from "@/components/SourcePicker";
import { ListingCharts, SourceCharts } from "./DashboardCharts";
import { DiffBadges } from "@/components/sources/VersionRow";
import { HealthDot, healthOf, healthReasons } from "@/components/sources/health";
import { timeAgo } from "@/components/sources/format";
import { GateBadge } from "@/components/sources/FeedChecks";
import { useAppData } from "@/providers/useAppData";
import { useAuth } from "@/providers/AuthProvider";
import { hasRole } from "@/lib/roles";
import { computeVersionStats } from "@/lib/versionStats";
import { formatPriceCompact } from "@/lib/displayPrice";
import type { SourceDTO, VersionDTO } from "@/lib/sourcesApi";
import type { Listing } from "@/lib/types";

function Kpi({ icon: Icon, label, value, hint, to }: { icon: typeof Database; label: string; value: string; hint?: string; to?: string }) {
  const body = (
    <Card className="h-full transition-colors hover:border-primary/40">
      <CardContent className="flex items-start gap-3 p-4">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary-text" aria-hidden />
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="font-mono text-xl font-semibold tabular-nums">{value}</div>
          {hint && <div className="truncate text-xs text-muted-foreground">{hint}</div>}
        </div>
      </CardContent>
    </Card>
  );
  return to ? (
    <Link to={to} className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {body}
    </Link>
  ) : (
    body
  );
}

type Upload = { source: SourceDTO; version: VersionDTO };

function RecentUploads({ uploads }: { uploads: Upload[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Recent uploads</CardTitle>
        <CardDescription>Newest versions across all sources.</CardDescription>
      </CardHeader>
      <CardContent>
        {uploads.length === 0 ? (
          <p className="text-sm text-muted-foreground">No uploads yet.</p>
        ) : (
          <ol className="space-y-2">
            {uploads.map(({ source, version }) => {
              const live = version.id === source.activeVersionId;
              const gate = version.warnings?.checks?.gate;
              return (
                <li key={version.id}>
                  <Link
                    to={`/sources?source=${source.id}&tab=versions`}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-sm hover:bg-muted/50"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {source.name} <span className="font-mono text-muted-foreground">v{version.number}</span>
                    </span>
                    <DiffBadges added={version.added} removed={version.removed} changed={version.changed} />
                    {gate && <GateBadge gate={gate} />}
                    <span className={`text-xs ${live ? "text-success" : "text-muted-foreground"}`}>{live ? "live" : "not live"}</span>
                    <span className="w-28 text-right text-xs text-muted-foreground">{timeAgo(version.createdAt)}</span>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function NeedsAttention({ sources }: { sources: SourceDTO[] }) {
  const items = sources
    .map((s) => ({ s, health: healthOf(s), reasons: healthReasons(s) }))
    .filter((x) => x.health !== "healthy" || (x.s.versions[0]?.warnings?.checks?.gate ?? "pass") !== "pass");
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          {items.length ? <AlertTriangle className="h-4 w-4 text-warning" aria-hidden /> : <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />}
          Needs attention
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Every source is live, current and passing its checks.</p>
        ) : (
          <ul className="space-y-2">
            {items.map(({ s, health, reasons }) => {
              const newest = s.versions[0];
              const gate = newest?.warnings?.checks?.gate;
              const lines = [...reasons];
              if (gate && gate !== "pass") lines.push(`v${newest.number} ${gate === "fail" ? "fails" : "has warnings in"} its feed checks.`);
              return (
                <li key={s.id}>
                  <Link to={`/sources?source=${s.id}&tab=issues`} className="block rounded-lg border px-3 py-2 hover:bg-muted/50">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <HealthDot health={health} /> {s.name}
                    </span>
                    <ul className="mt-1 space-y-0.5 pl-5 text-xs text-muted-foreground">
                      {lines.map((l) => (
                        <li key={l}>{l}</li>
                      ))}
                    </ul>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function NewestListings({ listings }: { listings: Listing[] }) {
  const newest = useMemo(
    () => [...listings].sort((a, b) => (b.lastUpdate || "").localeCompare(a.lastUpdate || "")).slice(0, 8),
    [listings],
  );
  if (newest.length === 0) return null;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base">Recently updated listings</CardTitle>
        <Button asChild variant="ghost" size="sm">
          <Link to="/listings">
            All listings <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {newest.map((l) => (
            <li key={l.id}>
              <Link to={`/listing/${encodeURIComponent(l.id)}`} className="block overflow-hidden rounded-lg border hover:shadow-md">
                {l.images?.[0] ? (
                  <img src={l.images[0]} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" />
                ) : (
                  <div className="aspect-[4/3] bg-muted" />
                )}
                <div className="space-y-0.5 p-2.5">
                  <p className="font-mono text-sm font-semibold">{l.price > 0 ? formatPriceCompact(l.price) : "POA"}</p>
                  <p className="line-clamp-1 text-sm">{l.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {l.sourceAgency} · {l.community}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** Signed-in home: what's live, what changed, what needs attention. */
export function Dashboard() {
  const { user } = useAuth();
  const { sources, listings, isLoading, selectedSource } = useAppData();
  const canEdit = hasRole(user?.role, "editor");

  const stats = useMemo(() => (listings.length ? computeVersionStats(listings) : null), [listings]);
  const uploads = useMemo(
    () =>
      sources
        .flatMap((s) => s.versions.map((v) => ({ source: s, version: v })))
        .sort((a, b) => b.version.createdAt.localeCompare(a.version.createdAt))
        .slice(0, 8),
    [sources],
  );
  const healthy = sources.filter((s) => healthOf(s) === "healthy").length;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main id="main-content" className="container space-y-6 py-8">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <h1 className="font-heading text-2xl font-extrabold">Welcome back, {user?.username}</h1>
            <p className="text-sm text-muted-foreground">
              {selectedSource ? `Showing ${selectedSource.name}.` : `Live listings across ${sources.length} source${sources.length === 1 ? "" : "s"}.`}{" "}
              Everything here follows each source's live version.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SourcePicker />
            {canEdit && (
              <Button asChild>
                <Link to="/sources">
                  <Upload className="mr-1.5 h-4 w-4" /> Upload feeds
                </Link>
              </Button>
            )}
          </div>
        </div>

        {isLoading && listings.length === 0 ? (
          <p className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Loading live listings…
          </p>
        ) : sources.length === 0 ? (
          <Card>
            <CardContent className="space-y-3 py-16 text-center">
              <FileStack className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden />
              <h2 className="text-lg font-semibold">No feeds yet</h2>
              <p className="text-sm text-muted-foreground">
                {canEdit ? "Upload an agency XML feed to start." : "Ask an editor to upload a feed."}
              </p>
              {canEdit && (
                <Button asChild>
                  <Link to="/sources">Go to Sources</Link>
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <Kpi
                icon={Database}
                label="Live listings"
                value={listings.length.toLocaleString()}
                hint={stats ? `${stats.purpose.sale.toLocaleString()} sale · ${stats.purpose.rent.toLocaleString()} rent` : undefined}
                to="/listings"
              />
              <Kpi icon={FileStack} label="Sources" value={`${healthy}/${sources.length}`} hint="healthy" to="/sources" />
              <Kpi icon={Gauge} label="Average quality" value={stats ? `${stats.score}/100` : "—"} hint="across live listings" to="/field-quality" />
              <Kpi icon={Users} label="Agents" value={stats ? stats.agents.toLocaleString() : "—"} hint={stats ? `${stats.communities} communities` : undefined} to="/agents" />
              <Kpi icon={HomeIcon} label="Median sale price" value={stats?.medianPrice.sale ? formatPriceCompact(stats.medianPrice.sale) : "—"} />
              <Kpi icon={KeyRound} label="Median rent / year" value={stats?.medianPrice.rent ? formatPriceCompact(stats.medianPrice.rent) : "—"} />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <NeedsAttention sources={sources} />
              <RecentUploads uploads={uploads} />
            </div>

            <SourceCharts sources={sources} />
            <ListingCharts listings={listings} sources={sources} />
            <SourceComparisonTable sources={sources} />
            <NewestListings listings={listings} />

            <div className="flex flex-wrap gap-2 text-sm">
              <Button asChild variant="outline" size="sm">
                <Link to="/agencies">
                  <Building2 className="mr-1.5 h-4 w-4" /> Agencies
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to="/workspace-insights">Insights</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to="/feed-compare">Compare versions</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to="/cross-agency-dupes">Duplicates across agencies</Link>
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
