import { useMemo, useState } from "react";
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
  Users,
} from "lucide-react";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SourceComparisonTable } from "@/components/SourceComparisonTable";
import { ListingCharts, SourceCharts } from "./DashboardCharts";
import { ImportReadiness } from "./ImportReadiness";
import { MarketAnalysis } from "@/components/analytics/MarketAnalysis";
import { DashboardHero } from "./DashboardHero";
import { UploadDialog } from "@/components/sources/UploadDialog";
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
    <Card className="min-w-0">
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
                    className="block space-y-1 rounded-lg border px-3 py-2 text-sm hover:bg-muted/50"
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate font-medium" title={source.name}>
                        {source.name} <span className="font-mono text-muted-foreground">v{version.number}</span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(version.createdAt)}</span>
                    </span>
                    <span className="flex flex-wrap items-center gap-2">
                      <DiffBadges added={version.added} removed={version.removed} changed={version.changed} />
                      {gate && <GateBadge gate={gate} />}
                      <span className={`text-xs ${live ? "text-success" : "text-muted-foreground"}`}>{live ? "live" : "not live"}</span>
                    </span>
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
  const [expanded, setExpanded] = useState(false);
  const LIMIT = 5;
  // Most urgent first: unhealthy sources, then failing feed checks, then warnings.
  const items = sources
    .map((s) => {
      const gate = s.versions[0]?.warnings?.checks?.gate ?? "pass";
      const health = healthOf(s);
      const rank = (health !== "healthy" ? 0 : 3) + (gate === "fail" ? 0 : gate === "warn" ? 1 : 2);
      return { s, health, gate, reasons: healthReasons(s), rank };
    })
    .filter((x) => x.health !== "healthy" || x.gate !== "pass")
    .sort((a, b) => a.rank - b.rank || a.s.name.localeCompare(b.s.name));
  const urgent = items.filter((x) => x.health !== "healthy" || x.gate === "fail").length;
  const warnOnly = items.length - urgent;
  const visible = expanded ? items : items.slice(0, LIMIT);
  return (
    <Card className="min-w-0">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          {items.length ? <AlertTriangle className="h-4 w-4 text-warning" aria-hidden /> : <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />}
          Needs attention
        </CardTitle>
        {items.length > 0 && (
          <CardDescription>
            {urgent ? `${urgent} need action` : "Nothing urgent"}
            {warnOnly ? ` · ${warnOnly} with feed-check warnings` : ""}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Every source is live, current and passing its checks.</p>
        ) : (
          <>
            <ul className="max-h-[26rem] space-y-1.5 overflow-y-auto overscroll-contain pr-1">
              {visible.map(({ s, health, gate, reasons }) => {
                const newest = s.versions[0];
                const lines = [...reasons];
                if (gate !== "pass") lines.push(`v${newest.number} ${gate === "fail" ? "fails" : "has warnings in"} its feed checks.`);
                return (
                  <li key={s.id}>
                    <Link to={`/sources?source=${s.id}&tab=issues`} className="flex items-start gap-2 rounded-lg border px-3 py-2 hover:bg-muted/50">
                      <HealthDot health={health} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{s.name}</span>
                        <span className="block truncate text-xs text-muted-foreground" title={lines.join(" ")}>
                          {lines.join(" ")}
                        </span>
                      </span>
                      {gate !== "pass" && <GateBadge gate={gate} className="shrink-0" />}
                    </Link>
                  </li>
                );
              })}
            </ul>
            {items.length > LIMIT && (
              <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={() => setExpanded((v) => !v)}>
                {expanded ? `Show top ${LIMIT}` : `Show all ${items.length}`}
              </Button>
            )}
          </>
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
  const { sources, allSources, listings, isLoading } = useAppData();
  const canEdit = hasRole(user?.role, "editor");
  const [uploadOpen, setUploadOpen] = useState(false);

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
        <DashboardHero
          username={user?.username}
          sources={sources}
          listings={listings}
          canEdit={canEdit}
          onUpload={() => setUploadOpen(true)}
        />
        <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} sources={allSources} />

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

            <ImportReadiness sources={sources} listings={listings} />

            <SourceCharts sources={sources} />
            <ListingCharts listings={listings} sources={sources} />
            {listings.length > 0 && <MarketAnalysis listings={listings} title="Market analysis (all live listings)" />}
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
