import { useState } from "react";
import { Link } from "react-router-dom";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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
import { RECHARTS_TOOLTIP_CONTENT, RECHARTS_TOOLTIP_ITEM, RECHARTS_TOOLTIP_LABEL } from "@/lib/chartTheme";
import { useReparseLiveVersion, useUpdateSource } from "@/hooks/useSources";
import { useAppData } from "@/providers/useAppData";
import { HealthDot, ScoreBadge, healthOf, healthReasons } from "./health";
import { VersionRow } from "./VersionRow";
import { ApplyVersionDialog, DeleteSourceDialog, DeleteVersionDialog } from "./VersionDialogs";
import { pct } from "./format";
import { AgencyLogo } from "@/components/AgencyLogo";

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
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Trend across versions</CardTitle>
      </CardHeader>
      <CardContent className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: -16, right: 4, top: 4, bottom: 0 }}>
            <CartesianGrid stroke="hsl(var(--chart-grid))" strokeDasharray="3 3" />
            <XAxis dataKey="v" tick={{ fontSize: 11, fill: "hsl(var(--chart-axis))" }} />
            <YAxis yAxisId="l" tick={{ fontSize: 11, fill: "hsl(var(--chart-axis))" }} />
            <YAxis yAxisId="q" orientation="right" domain={[0, 100]} hide />
            <Tooltip contentStyle={RECHARTS_TOOLTIP_CONTENT} labelStyle={RECHARTS_TOOLTIP_LABEL} itemStyle={RECHARTS_TOOLTIP_ITEM} />
            <Line yAxisId="l" dataKey="listings" name="Listings" stroke="hsl(var(--chart-line))" strokeWidth={2} dot={{ r: 2 }} />
            <Line yAxisId="q" dataKey="quality" name="Quality" stroke="hsl(var(--chart-severity-warning))" strokeWidth={2} dot={{ r: 2 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

type Target = { source: SourceDTO; version: VersionDTO } | null;

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
  const reparse = useReparseLiveVersion();
  const [applyTarget, setApplyTarget] = useState<Target>(null);
  const [deleteTarget, setDeleteTarget] = useState<Target>(null);
  const [deleteSource, setDeleteSource] = useState<SourceDTO | null>(null);
  const info = source.agencyInfo;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <AgencyLogo src={info?.logo} name={source.name} className="h-10 w-10 border" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-bold text-foreground">{source.name}</h2>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <HealthDot health={health} withLabel />
            {source.agencyName && source.agencyName !== source.name && <span>Agency: {source.agencyName}</span>}
            {info?.website && (
              <a href={info.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
                Website <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            )}
            <span>Keeps last {source.retainVersions} versions</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            asChild
            onClick={() => setScope({ mode: "agency", agencyName: source.name })}
          >
            <Link to="/listings">View listings</Link>
          </Button>
          {canEdit && (
            <>
              <Button size="sm" onClick={onUpload}>
                <Upload className="mr-1.5 h-4 w-4" /> Upload version
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!live || reparse.isPending}
                onClick={() => reparse.mutate({ source, sources })}
                title="Parse the live file again with this source's current field mapping"
              >
                <RefreshCw className={`mr-1.5 h-4 w-4 ${reparse.isPending ? "animate-spin" : ""}`} /> Re-parse
              </Button>
              <SettingsPopover key={source.id + source.updatedAt} source={source} />
              <Button variant="outline" size="sm" onClick={() => setDeleteSource(source)} aria-label="Delete source">
                <Trash2 className="h-4 w-4 text-destructive-text" />
              </Button>
            </>
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

      {live && (
        <div className="grid gap-4 lg:grid-cols-2">
          <QualityCard live={live} />
          <InventoryCard live={live} />
        </div>
      )}
      <TrendCard source={source} />

      <section aria-labelledby="versions-heading" className="space-y-2">
        <h3 id="versions-heading" className="text-sm font-semibold text-foreground">
          Versions
        </h3>
        <ol className="space-y-2">
          {source.versions.map((v) => (
            <VersionRow
              key={v.id + (v.note ?? "")}
              source={source}
              version={v}
              isLive={v.id === source.activeVersionId}
              canEdit={canEdit}
              onApply={() => setApplyTarget({ source, version: v })}
              onDelete={() => setDeleteTarget({ source, version: v })}
            />
          ))}
        </ol>
      </section>

      <ApplyVersionDialog target={applyTarget} onClose={() => setApplyTarget(null)} />
      <DeleteVersionDialog target={deleteTarget} onClose={() => setDeleteTarget(null)} />
      <DeleteSourceDialog source={deleteSource} onClose={() => setDeleteSource(null)} onDeleted={onDeleted} />
    </div>
  );
}
