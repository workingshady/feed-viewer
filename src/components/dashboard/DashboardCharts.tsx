import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ChartCard, Columns, HBars, Lines, SERIES, type SeriesDef } from "@/components/charts/ChartKit";
import { bedroomMix, priceBands, topValues, type Bucket } from "@/lib/sourceInsights";
import { QUALITY_CHECKS, listingQuality } from "@/lib/versionStats";
import type { SourceDTO } from "@/lib/sourcesApi";
import type { Listing } from "@/lib/types";

type Purpose = "all" | "sale" | "rent";

const SALE_RENT: SeriesDef[] = [
  { key: "sale", label: "Sale", color: SERIES[0] },
  { key: "rent", label: "Rent", color: SERIES[1] },
];
const DIFF: SeriesDef[] = [
  { key: "added", label: "Added", color: SERIES[2] },
  { key: "changed", label: "Changed", color: SERIES[0] },
  { key: "removed", label: "Removed", color: SERIES[1] },
];
const COUNT = (label: string): SeriesDef[] => [{ key: "count", label, color: SERIES[0] }];
const bucketTable = (head: string, b: Bucket[]) => ({ columns: [head, "Listings"], rows: b.map((x) => [x.label, x.count]) });
const stamp = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const pct = (n: number) => `${Math.round(n)}%`;

/** Sources keep their colour across every chart: slot by creation order, capped at 8. */
function sourceColors(sources: SourceDTO[]): Map<string, string> {
  const ordered = [...sources].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return new Map(ordered.slice(0, SERIES.length).map((s, i) => [s.id, SERIES[i]]));
}

/** Inventory and change history per source, driven by version metadata (no listing download). */
export function SourceCharts({ sources }: { sources: SourceDTO[] }) {
  const navigate = useNavigate();
  const colors = useMemo(() => sourceColors(sources), [sources]);
  const tracked = sources.filter((s) => colors.has(s.id));

  const history = useMemo(() => {
    const points = tracked
      .flatMap((s) => s.versions.filter((v) => v.status === "ready").map((v) => ({ s, v })))
      .sort((a, b) => a.v.createdAt.localeCompare(b.v.createdAt));
    // One point per upload; each line carries forward its source's last known count.
    const last: Record<string, number> = {};
    const rows: Record<string, string | number | null>[] = [];
    for (const { s, v } of points) {
      last[s.id] = v.listingCount;
      rows.push({ day: stamp(v.createdAt), ...last });
    }
    return rows;
  }, [tracked]);

  const recent = useMemo(
    () =>
      sources
        .flatMap((s) => s.versions.map((v) => ({ s, v })))
        .sort((a, b) => b.v.createdAt.localeCompare(a.v.createdAt))
        .slice(0, 14)
        .reverse()
        .map(({ s, v }) => ({
          label: `${s.name.split(/\s+/)[0]} v${v.number}`,
          added: v.added,
          changed: v.changed,
          removed: v.removed,
        })),
    [sources],
  );

  const lineSeries = tracked.map((s) => ({ key: s.id, label: s.name, color: colors.get(s.id)! }));

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ChartCard
        title="Listings per version"
        description={`Listing count after each upload, by source.${sources.length > SERIES.length ? ` Showing the first ${SERIES.length} sources.` : ""}`}
        legend={lineSeries}
        table={{
          columns: ["Upload", ...lineSeries.map((s) => s.label)],
          rows: history.map((r) => [String(r.day), ...lineSeries.map((s) => (r[s.key] as number | undefined) ?? "")]),
        }}
      >
        <Lines data={history} xKey="day" series={lineSeries} />
      </ChartCard>
      <ChartCard
        title="Recent changes"
        description="Listings added, changed and removed by the last uploads, oldest to newest."
        legend={DIFF}
        table={{ columns: ["Upload", "Added", "Changed", "Removed"], rows: recent.map((r) => [r.label, r.added, r.changed, r.removed]) }}
      >
        <Columns data={recent} xKey="label" series={DIFF} />
      </ChartCard>
      <ChartCard
        title="Live inventory by source"
        description="Sale and rent listings in each source's live version. Click a bar to open the agency."
        legend={SALE_RENT}
        className="lg:col-span-2"
        table={{
          columns: ["Source", "Sale", "Rent", "Total"],
          rows: sources.map((s) => {
            const live = s.versions.find((v) => v.id === s.activeVersionId);
            const p = live?.stats?.purpose;
            return [s.name, p?.sale ?? 0, p?.rent ?? 0, live?.listingCount ?? 0];
          }),
        }}
      >
        <HBars
          data={sources
            .map((s) => {
              const p = s.versions.find((v) => v.id === s.activeVersionId)?.stats?.purpose;
              return { name: s.name, sale: p?.sale ?? 0, rent: p?.rent ?? 0 };
            })
            .sort((a, b) => b.sale + b.rent - (a.sale + a.rent))}
          labelKey="name"
          series={SALE_RENT}
          onSelect={(r) => navigate(`/agencies/${encodeURIComponent(String(r.name))}`)}
        />
      </ChartCard>
    </div>
  );
}

/** Market and quality breakdown of the listings in scope, with a purpose filter. */
export function ListingCharts({ listings }: { listings: Listing[] }) {
  const [purpose, setPurpose] = useState<Purpose>("all");
  const scoped = useMemo(() => (purpose === "all" ? listings : listings.filter((l) => l.purpose === purpose)), [listings, purpose]);

  const data = useMemo(() => {
    const scoreBands = Array.from({ length: 10 }, (_, i) => ({ label: `${i * 10}–${i * 10 + 9}`, count: 0 }));
    scoreBands[9].label = "90–100";
    const pass = new Map<string, number>(QUALITY_CHECKS.map((c) => [c.key, 0]));
    for (const l of scoped) {
      const q = listingQuality(l);
      scoreBands[Math.min(9, Math.floor(q.score / 10))].count++;
      for (const c of QUALITY_CHECKS) if (!q.failed.includes(c.key)) pass.set(c.key, pass.get(c.key)! + 1);
    }
    return {
      scoreBands,
      checks: QUALITY_CHECKS.map((c) => ({ label: c.label, count: scoped.length ? (pass.get(c.key)! / scoped.length) * 100 : 0 })),
      types: topValues(scoped, (l) => l.propertyType, 8),
      communities: topValues(scoped, (l) => l.community, 10),
      beds: bedroomMix(scoped),
      prices: priceBands(scoped, purpose === "rent" ? "rent" : "sale"),
    };
  }, [scoped, purpose]);

  const priceTitle = purpose === "rent" ? "Rent per year (AED)" : "Sale price (AED)";

  return (
    <section className="space-y-4" aria-label="Market and quality charts">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-lg font-semibold">
          Market &amp; quality <span className="text-sm font-normal text-muted-foreground">· {scoped.length.toLocaleString()} listings</span>
        </h2>
        <ToggleGroup type="single" size="sm" value={purpose} onValueChange={(v) => v && setPurpose(v as Purpose)} aria-label="Purpose">
          <ToggleGroupItem value="all" className="h-8 px-3 text-xs">
            All
          </ToggleGroupItem>
          <ToggleGroupItem value="sale" className="h-8 px-3 text-xs">
            Sale
          </ToggleGroupItem>
          <ToggleGroupItem value="rent" className="h-8 px-3 text-xs">
            Rent
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <ChartCard
          title={priceTitle}
          description={purpose === "all" ? "Sale listings only; switch to Rent for annual rents." : undefined}
          table={bucketTable("Band", data.prices)}
        >
          <Columns data={data.prices} xKey="label" series={COUNT("Listings")} />
        </ChartCard>
        <ChartCard title="Bedrooms" table={bucketTable("Bedrooms", data.beds)}>
          <Columns data={data.beds} xKey="label" series={COUNT("Listings")} />
        </ChartCard>
        <ChartCard title="Quality score" description="Listings per score band (0–100)." table={bucketTable("Score", data.scoreBands)}>
          <Columns data={data.scoreBands} xKey="label" series={COUNT("Listings")} />
        </ChartCard>
        <ChartCard title="Property types" table={bucketTable("Type", data.types)}>
          <HBars data={data.types} labelKey="label" series={COUNT("Listings")} />
        </ChartCard>
        <ChartCard title="Top communities" table={bucketTable("Community", data.communities)}>
          <HBars data={data.communities} labelKey="label" series={COUNT("Listings")} />
        </ChartCard>
        <ChartCard
          title="Quality checks passed"
          description="Share of listings passing each check."
          table={{ columns: ["Check", "% passing"], rows: data.checks.map((c) => [c.label, Math.round(c.count)]) }}
        >
          <HBars data={data.checks} labelKey="label" series={COUNT("% passing")} valueFormat={pct} max={100} />
        </ChartCard>
      </div>
    </section>
  );
}
