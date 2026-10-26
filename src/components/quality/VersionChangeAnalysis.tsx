import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChartCard, Columns, DivergingBars, HBars, SERIES } from "@/components/charts/ChartKit";
import { completenessDelta } from "@/lib/feedValidation";
import { UI_FIELDS, type Listing } from "@/lib/types";
import type { VersionDiff } from "@/lib/versionDiff";
import { categoryCounts, completenessByField, median, priceChangeBands, priceMoveRows } from "@/lib/versionInsights";
import { cn } from "@/lib/utils";

const label = (k: string) => UI_FIELDS.find((f) => f.key === k)?.label ?? k;
const pct1 = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;

/** What changed between two versions: churn, change categories, price moves and fill drift — all listings. */
export function VersionChangeAnalysis({ diff, before, after, versionLabel, compareHref }: { diff: VersionDiff; before: Listing[]; after: Listing[]; versionLabel: string; compareHref: string }) {
  const a = useMemo(() => {
    const moves = priceMoveRows(diff);
    const cuts = moves.filter((m) => m.pct < 0);
    const rises = moves.filter((m) => m.pct > 0);
    const fieldCounts = new Map<string, number>();
    for (const c of diff.changed) for (const k of c.keys) fieldCounts.set(k, (fieldCounts.get(k) ?? 0) + 1);
    return {
      moves,
      cuts,
      rises,
      medianMove: median(moves.map((m) => m.pct)),
      categories: categoryCounts(diff),
      bands: priceChangeBands(moves),
      fields: [...fieldCounts.entries()].map(([k, n]) => ({ field: label(k), listings: n })).sort((x, y) => y.listings - x.listings),
      fill: completenessByField(diff).map((r) => ({ field: label(r.field), filled: r.filled, cleared: r.cleared })),
      share: completenessDelta(before, after).filter((r) => Math.abs(r.delta) >= 0.005).sort((x, y) => x.delta - y.delta),
    };
  }, [diff, before, after]);

  const prevN = before.length;
  const net = diff.added.length - diff.removed.length;
  const churn = prevN ? ((diff.added.length + diff.removed.length) / prevN) * 100 : 0;
  const changedPct = after.length ? (diff.changed.length / after.length) * 100 : 0;
  const tiles = [
    { label: "net listings", value: `${net > 0 ? "+" : ""}${net.toLocaleString()}`, hint: `${diff.added.length.toLocaleString()} new, ${diff.removed.length.toLocaleString()} removed`, tone: net < 0 ? "text-destructive" : net > 0 ? "text-success" : undefined },
    { label: "turnover", value: `${churn.toFixed(1)}%`, hint: "(new + removed) ÷ previous size", tone: churn > 25 ? "text-warning" : undefined },
    { label: "listings edited", value: `${changedPct.toFixed(1)}%`, hint: `${diff.changed.length.toLocaleString()} with a real change` },
    { label: "price changes", value: a.moves.length.toLocaleString(), hint: `${a.cuts.length} cuts · ${a.rises.length} rises` },
    { label: "median price move", value: a.medianMove == null ? "–" : pct1(a.medianMove), hint: "across listings whose price changed", tone: a.medianMove != null && a.medianMove < 0 ? "text-destructive" : undefined },
    { label: "relisted", value: diff.relisted.length.toLocaleString(), hint: "same property under a new reference" },
  ];
  const findings: string[] = [];
  if (a.share.length && a.share[0].delta <= -0.1) findings.push(`${a.share[0].field} fill dropped ${Math.round(-a.share[0].delta * 100)} points: check the export or the mapping.`);
  if (churn > 25) findings.push(`${churn.toFixed(0)}% of the inventory turned over; a large refresh or a partial feed.`);
  if (a.cuts.length > a.rises.length * 2 && a.cuts.length >= 5) findings.push(`Price cuts outnumber rises ${a.cuts.length} to ${a.rises.length}: a softening signal.`);
  if (a.rises.length > a.cuts.length * 2 && a.rises.length >= 5) findings.push(`Price rises outnumber cuts ${a.rises.length} to ${a.cuts.length}.`);
  if (diff.possibleRelists.length) findings.push(`${diff.possibleRelists.length} new listings look like removed ones re-posted; review them in Compare versions.`);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold font-heading">What changed in {versionLabel}</h2>
          <p className="text-xs text-muted-foreground">Every listing of both versions matched by reference (and by content for re-posts).</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to={compareHref}>
            Open in Compare versions <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-lg border bg-card px-3 py-2.5">
            <div className={cn("font-mono text-lg font-semibold tabular-nums", t.tone)}>{t.value}</div>
            <div className="text-[11px] font-medium">{t.label}</div>
            <div className="text-[11px] text-muted-foreground">{t.hint}</div>
          </div>
        ))}
      </div>
      {findings.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-sm">
          {findings.map((f) => (
            <li key={f}>• {f}</li>
          ))}
        </ul>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="What kind of changes"
          description="Listings with at least one real change in each area (one listing can count in several)."
          table={{ columns: ["Area", "Listings"], rows: a.categories.map((c) => [c.label, c.listings]) }}
        >
          <HBars data={a.categories.map((c) => ({ area: c.label, listings: c.listings }))} labelKey="area" series={[{ key: "listings", label: "Listings", color: SERIES[0] }]} />
        </ChartCard>
        <ChartCard title="Fields edited most" description="Updated listings per field." table={{ columns: ["Field", "Listings"], rows: a.fields.map((f) => [f.field, f.listings]) }}>
          <HBars data={a.fields} labelKey="field" series={[{ key: "listings", label: "Listings", color: SERIES[0] }]} limit={10} />
        </ChartCard>
        <ChartCard
          title="Size of price moves"
          description={`${a.moves.length.toLocaleString()} listings changed price; cuts on the left, rises on the right.`}
          table={{ columns: ["Change", "Listings"], rows: a.bands.map((b) => [b.label, b.count]) }}
        >
          <Columns data={a.bands} xKey="label" series={[{ key: "count", label: "Listings", color: SERIES[0] }]} colorFor={(r) => (r.label.startsWith("−") || r.label.startsWith("≤") ? SERIES[1] : SERIES[0])} />
        </ChartCard>
        <ChartCard
          title="Values filled in vs dropped"
          description="Matched listings where a field went from empty to filled (right) or was cleared (left)."
          legend={[
            { label: "Filled in", color: SERIES[0] },
            { label: "Cleared", color: SERIES[1] },
          ]}
          table={{ columns: ["Field", "Filled in", "Cleared"], rows: a.fill.map((r) => [r.field, r.filled, r.cleared]) }}
        >
          <DivergingBars data={a.fill.slice(0, 12)} labelKey="field" positive={[{ key: "filled", label: "Filled in", color: SERIES[0] }]} negative={[{ key: "cleared", label: "Cleared", color: SERIES[1] }]} />
        </ChartCard>
      </div>
      {a.share.length > 0 && (
        <ChartCard
          title="Field fill rate vs previous version"
          description="Change in the share of listings with each field filled, in percentage points. Drops of 10+ points usually mean an export or mapping problem."
          table={{ columns: ["Field", "Before %", "After %", "Change (pts)"], rows: a.share.map((r) => [r.field, (r.before * 100).toFixed(1), (r.after * 100).toFixed(1), ((r.after - r.before) * 100).toFixed(1)]) }}
        >
          <DivergingBars
            data={a.share.map((r) => ({ field: r.field, up: Math.max(0, r.delta * 100), down: Math.max(0, -r.delta * 100) }))}
            labelKey="field"
            positive={[{ key: "up", label: "Gained", color: SERIES[0] }]}
            negative={[{ key: "down", label: "Lost", color: SERIES[1] }]}
            valueFormat={(n) => `${Math.abs(n).toFixed(1)} pts`}
          />
        </ChartCard>
      )}
    </div>
  );
}
