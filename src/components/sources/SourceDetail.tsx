import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MarketCard } from "./MarketCard";
import { VersionsTab } from "./VersionsTab";
import { ChangesTab } from "./ChangesTab";
import { IssuesTab } from "./IssuesTab";
import { ChartCard, Lines, SERIES } from "@/components/charts/ChartKit";
import { ExternalLink, RefreshCw, Settings2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { liveVersionOf, type SourceDTO, type VersionDTO } from "@/lib/sourcesApi";
import { QUALITY_CHECKS } from "@/lib/versionStats";
import { formatPriceCompact } from "@/lib/displayPrice";
import { useUpdateSource } from "@/hooks/useSources";
import { BulkDeleteDialog, ReparseDialog, ReportsMenu } from "./BulkDialogs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAppData } from "@/providers/useAppData";
import { HealthDot, ScoreBadge, healthOf, healthReasons } from "./health";
import { ApplyVersionDialog, DeleteSourceDialog, DeleteVersionDialog } from "./VersionDialogs";
import { pct, timeAgo } from "./format";
import { AgencyLogo } from "@/components/AgencyLogo";
import { ShareDialog } from "@/components/ShareDialog";

function SettingsPopover({ source }: { source: SourceDTO }) {
  const update = useUpdateSource();
  const [name, setName] = useState(source.name);
  const [retain, setRetain] = useState(String(source.retainVersions));
  const retainNum = Number(retain);
  const valid = name.trim().length > 0 && Number.isInteger(retainNum) && retainNum >= 1 && retainNum <= 50;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2 className="mr-1.5 h-4 w-4" /> Settings
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-3" align="end">
        <div className="space-y-1.5">
          <Label htmlFor="source-name">Source name</Label>
          <Input id="source-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="retain">Keep last versions</Label>
          <Input id="retain" type="number" min={1} max={50} value={retain} onChange={(e) => setRetain(e.target.value)} />
          <p className="text-xs text-muted-foreground">Older unpinned versions are deleted automatically.</p>
        </div>
        <Button
          size="sm"
          className="w-full"
          disabled={!valid || update.isPending}
          onClick={() => update.mutate({ source, name: name.trim(), retainVersions: retainNum })}
        >
          Save
        </Button>
      </PopoverContent>
    </Popover>
  );
}

function QualityCard({ live }: { live: VersionDTO }) {
  const stats = live.stats;
  if (!stats) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm">
          Listing quality <ScoreBadge score={stats.score} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {QUALITY_CHECKS.map((c) => (
          <div key={c.key} className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">{c.label}</span>
              <span className="font-mono tabular-nums">{pct(stats.checks[c.key] ?? 0)}</span>
            </div>
            <Progress value={(stats.checks[c.key] ?? 0) * 100} className="h-1.5" aria-label={c.label} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function InventoryCard({ live }: { live: VersionDTO }) {
  const stats = live.stats;
  if (!stats) return null;
  const rows: [string, string][] = [
    ["For sale", stats.purpose.sale.toLocaleString()],
    ["For rent", stats.purpose.rent.toLocaleString()],
    ["Median sale price", stats.medianPrice.sale != null ? formatPriceCompact(stats.medianPrice.sale) : "—"],
    ["Median rent", stats.medianPrice.rent != null ? formatPriceCompact(stats.medianPrice.rent) : "—"],
    ["Communities", stats.communities.toLocaleString()],
    ["Agents", stats.agents.toLocaleString()],
  ];
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Inventory</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="text-right font-mono tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        {stats.topPropertyTypes.length > 0 && (
          <div className="text-xs">
            <div className="mb-1 text-muted-foreground">Top property types</div>
            <ul className="space-y-0.5">
              {stats.topPropertyTypes.map(([type, n]) => (
                <li key={type} className="flex justify-between">
                  <span className="truncate">{type}</span>
                  <span className="font-mono tabular-nums">{n.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TrendCard({ source }: { source: SourceDTO }) {
  const data = [...source.versions].reverse().map((v) => ({
    v: `v${v.number}`,
    listings: v.listingCount,
    quality: v.stats?.score ?? null,
  }));
  if (data.length < 2) return null;
  // Two measures on different scales: two charts, never a second y-axis.
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <ChartCard title="Listings per version" table={{ columns: ["Version", "Listings"], rows: data.map((d) => [d.v, d.listings]) }}>
        <Lines data={data} xKey="v" series={[{ key: "listings", label: "Listings", color: SERIES[0] }]} height={160} />
      </ChartCard>
      <ChartCard
        title="Quality score per version"
        table={{ columns: ["Version", "Quality"], rows: data.map((d) => [d.v, d.quality ?? ""]) }}
      >
        <Lines data={data} xKey="v" series={[{ key: "quality", label: "Quality", color: SERIES[0] }]} height={160} domain={[0, 100]} />
      </ChartCard>
    </div>
  );
}

type Target = { source: SourceDTO; version: VersionDTO } | null;

const SOURCE_TABS = ["overview", "versions", "changes", "issues"] as const;
type SourceTab = (typeof SOURCE_TABS)[number];

export function SourceDetail({
  source,
  canEdit,
  onUpload,
  onDeleted,
}: {
  source: SourceDTO;
  canEdit: boolean;
  onUpload: () => void;
  onDeleted: () => void;
}) {
  const { sources, setScope } = useAppData();
  const live = liveVersionOf(source);
  const health = healthOf(source);
  const reasons = healthReasons(source);
  const [reparseOpen, setReparseOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [params, setParams] = useSearchParams();
  const tabParam = params.get("tab") as SourceTab | null;
  const tab: SourceTab = tabParam && SOURCE_TABS.includes(tabParam) ? tabParam : "overview";
  const setTab = (next: SourceTab) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (next === "overview") n.delete("tab");
        else n.set("tab", next);
        return n;
      },
      { replace: true },
    );
  const [applyTarget, setApplyTarget] = useState<Target>(null);
  const [deleteTarget, setDeleteTarget] = useState<Target>(null);
  const [deleteSource, setDeleteSource] = useState<SourceDTO | null>(null);
  const info = source.agencyInfo;

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex items-start gap-3">
          <AgencyLogo src={info?.logo} name={source.name} className="h-11 w-11 shrink-0 border" />
          <div className="min-w-0 flex-1 space-y-1">
            <h2 className="truncate text-xl font-bold leading-tight text-foreground">{source.name}</h2>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <HealthDot health={health} withLabel />
              <span aria-hidden>·</span>
              <span>
                {live
                  ? `Live v${live.number} · ${live.listingCount.toLocaleString()} listings · updated ${timeAgo(live.createdAt)}`
                  : "No live version"}
              </span>
              {source.agencyName && source.agencyName !== source.name && (
                <>
                  <span aria-hidden>·</span>
                  <span>Agency: {source.agencyName}</span>
                </>
              )}
              {info?.website && (
                <>
                  <span aria-hidden>·</span>
                  <a href={info.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
                    Website <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                </>
              )}
              <span aria-hidden>·</span>
              <span>Keeps last {source.retainVersions} versions</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" asChild onClick={() => setScope({ mode: "agency", agencyName: source.name })}>
              <Link to="/listings">View listings</Link>
            </Button>
            {live && <ShareDialog kind="source" sourceId={source.id} label={source.name} />}
            {live && <ReportsMenu source={source} version={live} />}
          </div>
          {canEdit && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={source.versions.length === 0}
                onClick={() => setReparseOpen(true)}
                title="Parse versions again with the current parser and field mapping"
              >
                <RefreshCw className="mr-1.5 h-4 w-4" /> Re-parse
              </Button>
              <SettingsPopover key={source.id + source.updatedAt} source={source} />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" aria-label="Delete" title="Delete">
                    <Trash2 className="h-4 w-4 text-destructive-text" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setBulkDeleteOpen(true)} disabled={source.versions.length < 2}>
                    Delete versions…
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setDeleteSource(source)} className="text-destructive-text focus:text-destructive-text">
                    Delete entire source…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button size="sm" onClick={onUpload}>
                <Upload className="mr-1.5 h-4 w-4" /> Upload version
              </Button>
            </div>
          )}
        </div>
      </div>

      {reasons.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          {reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as SourceTab)}>
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="versions">Versions {source.versions.length}</TabsTrigger>
          <TabsTrigger value="changes">Changes</TabsTrigger>
          <TabsTrigger value="issues">Issues</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {live ? (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <QualityCard live={live} />
                <InventoryCard live={live} />
              </div>
              <MarketCard live={live} />
            </>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">Apply a version to see its insights.</p>
          )}
          <TrendCard source={source} />
        </TabsContent>

        <TabsContent value="versions">
          <VersionsTab
            source={source}
            canEdit={canEdit}
            onApply={(v) => setApplyTarget({ source, version: v })}
            onDelete={(v) => setDeleteTarget({ source, version: v })}
          />
        </TabsContent>

        <TabsContent value="changes">
          <ChangesTab source={source} />
        </TabsContent>

        <TabsContent value="issues">
          <IssuesTab source={source} />
        </TabsContent>
      </Tabs>

      <ApplyVersionDialog target={applyTarget} onClose={() => setApplyTarget(null)} />
      <DeleteVersionDialog target={deleteTarget} onClose={() => setDeleteTarget(null)} />
      <ReparseDialog key={`rp-${source.id}-${source.activeVersionId}`} source={source} open={reparseOpen} onOpenChange={setReparseOpen} />
      <BulkDeleteDialog key={`bd-${source.id}`} source={source} open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen} />
      <DeleteSourceDialog source={deleteSource} onClose={() => setDeleteSource(null)} onDeleted={onDeleted} />
    </div>
  );
}
