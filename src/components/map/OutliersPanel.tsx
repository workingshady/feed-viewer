import { useMemo, useState } from "react";
import { Download, ExternalLink, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChartCard, HBars, SERIES } from "@/components/charts/ChartKit";
import { MarketBadge } from "@/components/MarketBadge";
import { OUTLIER_KINDS, geoOutliersCsv, type GeoOutlier, type GeoOutlierResult, type OutlierKind } from "@/lib/geoOutliers";
import { MARKETS } from "@/lib/markets";
import { googleMapsQueryUrl } from "@/lib/mapExternalLinks";
import { downloadText } from "@/components/sources/format";
import { cn } from "@/lib/utils";

const SEVERITY_CLS = {
  high: "border-destructive/40 bg-destructive/10 text-destructive",
  medium: "border-warning/40 bg-warning/10 text-warning",
  low: "border-border bg-muted text-muted-foreground",
};

type Sort = "score" | "distance" | "price";

/**
 * Outlier review: what kinds were found, where (per market), and every flagged listing with its
 * reasons. Kind chips filter both this list and the map.
 */
export function OutliersPanel({
  geo,
  pins,
  kinds,
  onKindsChange,
  onShowOnMap,
}: {
  geo: GeoOutlierResult;
  pins: number;
  kinds: Set<OutlierKind>;
  onKindsChange: (k: Set<OutlierKind>) => void;
  onShowOnMap: (id?: string) => void;
}) {
  const [sort, setSort] = useState<Sort>("score");
  const [shown, setShown] = useState(50);
  const all = useMemo(() => [...geo.byId.values()], [geo]);
  const rows = useMemo(() => {
    const list = all.filter((o) => o.flags.some((f) => kinds.has(f.kind)));
    const by: Record<Sort, (a: GeoOutlier, b: GeoOutlier) => number> = {
      score: (a, b) => b.score - a.score,
      distance: (a, b) => (b.kmFromCommunityCentre ?? b.kmFromMarketCentre ?? 0) - (a.kmFromCommunityCentre ?? a.kmFromMarketCentre ?? 0),
      price: (a, b) => Math.abs(Math.log(b.ppsfRatio ?? 1)) - Math.abs(Math.log(a.ppsfRatio ?? 1)),
    };
    return list.sort(by[sort]);
  }, [all, kinds, sort]);
  const serious = rows.filter((o) => o.flags.some((f) => f.severity === "high")).length;
  const kindKeys = Object.keys(OUTLIER_KINDS) as OutlierKind[];
  const byKind = kindKeys.map((k) => ({ type: OUTLIER_KINDS[k].label, listings: geo.counts[k] })).filter((r) => r.listings > 0);
  const toggle = (k: OutlierKind) => {
    const next = new Set(kinds);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    onKindsChange(next);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Location and price outliers</CardTitle>
              <CardDescription className="text-xs">
                Every check runs within each listing's own market: a Singapore listing is compared with Singapore listings only. Pick the kinds to review; the map follows.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => onShowOnMap()} disabled={!rows.length}>
                <MapPin className="mr-1.5 h-4 w-4" /> Show on map
              </Button>
              <Button size="sm" onClick={() => downloadText(`outliers-${new Date().toISOString().slice(0, 10)}.csv`, geoOutliersCsv(rows, location.origin), "text/csv")} disabled={!rows.length}>
                <Download className="mr-1.5 h-4 w-4" /> Download report ({rows.length.toLocaleString()})
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {[
              { label: "outliers in view", value: rows.length.toLocaleString(), tone: rows.length ? "text-warning" : undefined },
              { label: "share of pins", value: pins ? `${((rows.length / pins) * 100).toFixed(1)}%` : "–" },
              { label: "serious (wrong place)", value: serious.toLocaleString(), tone: serious ? "text-destructive" : undefined },
              { label: "markets checked", value: geo.clusters.length.toLocaleString() },
            ].map((t) => (
              <div key={t.label} className="rounded-lg border bg-card px-3 py-2.5">
                <div className={cn("font-mono text-lg font-semibold tabular-nums", t.tone)}>{t.value}</div>
                <div className="text-[11px] text-muted-foreground">{t.label}</div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {kindKeys.map((k) => {
              const on = kinds.has(k);
              const info = OUTLIER_KINDS[k];
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => toggle(k)}
                  title={info.description}
                  aria-pressed={on}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
                    on ? SEVERITY_CLS[info.severity] : "border-dashed text-muted-foreground opacity-60 hover:opacity-100",
                  )}
                >
                  {info.label}
                  <span className="font-mono tabular-nums">{geo.counts[k].toLocaleString()}</span>
                </button>
              );
            })}
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onKindsChange(new Set(kindKeys))}>
              All kinds
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Outliers by kind" description="Listings flagged per check (a listing can have several)." table={{ columns: ["Kind", "Listings"], rows: byKind.map((r) => [r.type, r.listings]) }}>
          <HBars data={byKind} labelKey="type" series={[{ key: "listings", label: "Listings", color: SERIES[0] }]} />
        </ChartCard>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Per market</CardTitle>
            <CardDescription className="text-xs">Each market's own centre and spread. The dashed ring on the map is the 95% distance.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="border-y bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Market</th>
                  <th className="px-2 py-2 text-right font-medium">Pins</th>
                  <th className="px-2 py-2 text-right font-medium">Outliers</th>
                  <th className="px-2 py-2 text-right font-medium">Typical</th>
                  <th className="px-3 py-2 text-right font-medium">95% within</th>
                </tr>
              </thead>
              <tbody>
                {geo.clusters.map((c) => (
                  <tr key={c.code} className="border-b">
                    <td className="px-3 py-2">
                      <MarketBadge code={c.code} withName />
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-xs tabular-nums">{c.listings.toLocaleString()}</td>
                    <td className="px-2 py-2 text-right font-mono text-xs tabular-nums">
                      {c.outliers.toLocaleString()} <span className="text-muted-foreground">({c.listings ? ((c.outliers / c.listings) * 100).toFixed(1) : 0}%)</span>
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-xs tabular-nums">{c.typicalKm.toFixed(1)} km</td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">{c.ringKm.toFixed(1)} km</td>
                  </tr>
                ))}
                {!geo.clusters.length && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-xs text-muted-foreground">
                      No listings with coordinates.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
          <CardTitle className="text-sm">Flagged listings ({rows.length.toLocaleString()})</CardTitle>
          <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
            <SelectTrigger className="h-8 w-[200px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="score">Most serious first</SelectItem>
              <SelectItem value="distance">Farthest out first</SelectItem>
              <SelectItem value="price">Biggest price gap first</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="space-y-2">
          {rows.slice(0, shown).map((o) => {
            const l = o.listing;
            return (
              <div key={l.id} className="rounded-lg border bg-card p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <MarketBadge code={o.market} />
                      <span className="font-mono text-xs">{l.reference}</span>
                      <span className="truncate text-sm font-medium">{l.title || "Untitled"}</span>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {[l.community, l.city, l.sourceAgency].filter(Boolean).join(" · ")}
                      {l.latitude != null ? ` · ${l.latitude.toFixed(5)}, ${l.longitude?.toFixed(5)}` : ""}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onShowOnMap(l.id)}>
                      <MapPin className="mr-1 h-3.5 w-3.5" /> Map
                    </Button>
                    {l.latitude != null && l.longitude != null && (
                      <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
                        <a href={googleMapsQueryUrl(l.latitude, l.longitude)} target="_blank" rel="noopener noreferrer">
                          Google <ExternalLink className="ml-1 h-3 w-3" />
                        </a>
                      </Button>
                    )}
                    <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
                      <a href={`/listing/${encodeURIComponent(l.id)}`}>Open</a>
                    </Button>
                  </div>
                </div>
                <ul className="mt-2 space-y-1">
                  {o.flags.map((f) => (
                    <li key={f.kind} className="flex flex-wrap items-center gap-2 text-xs">
                      <span className={cn("rounded-md border px-1.5 py-0.5 text-[11px] font-medium", SEVERITY_CLS[f.severity])}>{OUTLIER_KINDS[f.kind].label}</span>
                      <span className="text-muted-foreground">{f.detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {rows.length > shown && (
            <Button variant="outline" size="sm" className="w-full" onClick={() => setShown((n) => n + 200)}>
              Show {Math.min(200, rows.length - shown)} more of {(rows.length - shown).toLocaleString()}
            </Button>
          )}
          {!rows.length && <p className="py-8 text-center text-sm text-muted-foreground">No outliers of the selected kinds in this filter.</p>}
          <p className="pt-2 text-[11px] text-muted-foreground">
            Methods: market box check ({Object.values(MARKETS).map((m) => m.code).join(", ")}); robust distance from the market and community medians (median + 6–7 MAD); points reused by 3+
            communities; price per sq ft against the median of the 10 nearest similar listings within 3 km (flagged when 3× off).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
