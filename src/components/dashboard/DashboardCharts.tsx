import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ChartCard, Columns, Donut, EmptyChart, HBars, Heatmap, Lines, ScatterPlot, SERIES, type SeriesDef } from "@/components/charts/ChartKit";
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

const TOP_SOURCES = 15;
const liveOf = (s: SourceDTO) => s.versions.find((v) => v.id === s.activeVersionId);

/** Inventory and change history per source, driven by version metadata (no listing download). */
export function SourceCharts({ sources }: { sources: SourceDTO[] }) {
  const navigate = useNavigate();

  // Only sources with history make a trend; the largest 8 keep a stable colour each.
  const trend = useMemo(() => {
    const withHistory = sources
      .map((s) => ({ s, versions: s.versions.filter((v) => v.status === "ready").sort((a, b) => a.number - b.number) }))
      .filter((x) => x.versions.length >= 2)
      .sort((a, b) => (liveOf(b.s)?.listingCount ?? 0) - (liveOf(a.s)?.listingCount ?? 0))
      .slice(0, SERIES.length);
    const ordered = [...withHistory].sort((a, b) => a.s.createdAt.localeCompare(b.s.createdAt));
    const series = ordered.map((x, i) => ({ key: x.s.id, label: x.s.name, color: SERIES[i] }));
    const depth = Math.max(0, ...withHistory.map((x) => x.versions.length));
    // Row i = each source's (i+1)-th kept version, so sources line up by version, not by clock time.
    const rows = Array.from({ length: depth }, (_, i) => {
      const row: Record<string, string | number | null> = { v: `#${i + 1}` };
      for (const x of withHistory) row[x.s.id] = x.versions[i]?.listingCount ?? null;
      return row;
    });
    return { series, rows, skipped: sources.filter((s) => s.versions.length >= 2).length - withHistory.length };
  }, [sources]);

  const recent = useMemo(
    () =>
      sources
        .flatMap((s) => s.versions.map((v) => ({ s, v })))
        .sort((a, b) => b.v.createdAt.localeCompare(a.v.createdAt))
        .slice(0, 14)
        .reverse()
        .map(({ s, v }) => ({
          label: `${s.name} v${v.number}`,
          name: `${s.name} v${v.number}`,
          added: v.added,
          changed: v.changed,
          // Diverging: removals plot below the zero line.
          removed: -v.removed,
        })),
    [sources],
  );

  const inventory = useMemo(
    () =>
      sources
        .map((s) => {
          const live = liveOf(s);
          const p = live?.stats?.purpose;
          return { name: s.name, sale: p?.sale ?? 0, rent: p?.rent ?? 0, total: live?.listingCount ?? 0 };
        })
        .sort((a, b) => b.total - a.total),
    [sources],
  );

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ChartCard
        title="Listings per version"
        description={
          trend.series.length
            ? `Listing count of each kept version (#1 = oldest), for sources with history.${trend.skipped > 0 ? ` Largest ${SERIES.length} shown.` : ""}`
            : undefined
        }
        legend={trend.series}
        table={{
          columns: ["Version", ...trend.series.map((s) => s.label)],
          rows: trend.rows.map((r) => [String(r.v), ...trend.series.map((s) => (r[s.key] as number | null) ?? "")]),
        }}
      >
        {trend.series.length ? (
          <Lines data={trend.rows} xKey="v" series={trend.series} />
        ) : (
          <EmptyChart text="Appears once a source has two or more versions." />
        )}
      </ChartCard>
      <ChartCard
        title="Recent changes"
        description="Added and changed above the line, removed below, for the last uploads (oldest first)."
        legend={DIFF}
        table={{ columns: ["Upload", "Added", "Changed", "Removed"], rows: recent.map((r) => [r.name, r.added, r.changed, -r.removed]) }}
      >
        <Columns data={recent} xKey="label" series={DIFF} />
      </ChartCard>
      <ChartCard
        title="Live inventory by source"
        description="Sale and rent listings in each source's live version, largest first. Click a bar to open the agency."
        legend={SALE_RENT}
        className="lg:col-span-2"
        table={{ columns: ["Source", "Sale", "Rent", "Total"], rows: inventory.map((r) => [r.name, r.sale, r.rent, r.total]) }}
      >
        <HBars
          data={inventory.map(({ name, sale, rent }) => ({ name, sale, rent }))}
          limit={TOP_SOURCES}
          labelKey="name"
          series={SALE_RENT}
          onSelect={(r) => navigate(`/agencies/${encodeURIComponent(String(r.name))}`)}
        />
      </ChartCard>
    </div>
  );
}

/** Market and quality breakdown of the listings in scope, with a purpose filter. */
export function ListingCharts({ listings, sources }: { listings: Listing[]; sources: SourceDTO[] }) {
  const navigate = useNavigate();
  const [purpose, setPurpose] = useState<Purpose>("all");
  const scoped = useMemo(() => (purpose === "all" ? listings : listings.filter((l) => l.purpose === purpose)), [listings, purpose]);

  const data = useMemo(() => {
    const scoreBands = Array.from({ length: 10 }, (_, i) => ({ label: `${i * 10}–${i * 10 + 9}`, count: 0 }));
    scoreBands[9].label = "90–100";
    // Pass counts per source × check for the quality heatmap.
    const perSource = new Map<string, { n: number; pass: Map<string, number> }>();
    for (const l of scoped) {
      const q = listingQuality(l);
      scoreBands[Math.min(9, Math.floor(q.score / 10))].count++;
      const key = l.sourceAgency ?? "";
      let s = perSource.get(key);
      if (!s) perSource.set(key, (s = { n: 0, pass: new Map(QUALITY_CHECKS.map((c) => [c.key, 0])) }));
      s.n++;
      for (const c of QUALITY_CHECKS) if (!q.failed.includes(c.key)) s.pass.set(c.key, s.pass.get(c.key)! + 1);
    }

    const bedsBy = (p: "sale" | "rent") => bedroomMix(scoped.filter((l) => l.purpose === p));
    const bedSale = bedsBy("sale");
    const bedRent = bedsBy("rent");

    const typeNames = topValues(scoped, (l) => l.propertyType, 8).map((b) => b.label);
    const types = typeNames.map((t) => ({
      label: t,
      sale: scoped.filter((l) => l.propertyType === t && l.purpose === "sale").length,
      rent: scoped.filter((l) => l.propertyType === t && l.purpose === "rent").length,
    }));

    // Median sale price per sqft for the busiest communities: price level, not just volume.
    const ppsf = new Map<string, number[]>();
    for (const l of scoped) {
      if (l.purpose !== "sale" || !(l.price > 0) || !(l.area > 0) || !l.community) continue;
      const k = l.community.trim();
      if (!ppsf.has(k)) ppsf.set(k, []);
      ppsf.get(k)!.push(l.price / l.area);
    }
    const ladder = [...ppsf.entries()]
      .filter(([, v]) => v.length >= 5)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 12)
      .map(([label, v]) => ({ label, median: Math.round(median(v)), count: v.length }))
      .sort((a, b) => b.median - a.median);

    // Size vs price, sale listings only; evenly sampled so big feeds stay fast.
    const sales = scoped.filter((l) => l.purpose === "sale" && l.price > 0 && l.area > 0);
    const step = Math.max(1, Math.ceil(sales.length / 1200));
    const scatter = sales
      .filter((_, i) => i % step === 0)
      .map((l) => ({ id: l.id, title: l.title, area: Math.round(l.area), price: l.price }));

    return {
      purposeMix: [
        { label: "Sale", value: scoped.filter((l) => l.purpose === "sale").length, color: SERIES[0] },
        { label: "Rent", value: scoped.filter((l) => l.purpose === "rent").length, color: SERIES[1] },
        { label: "Unknown", value: scoped.filter((l) => l.purpose !== "sale" && l.purpose !== "rent").length, color: SERIES[2] },
      ].filter((d) => d.value > 0),
      scoreBands,
      perSource,
      beds: bedSale.map((b, i) => ({ label: b.label, sale: b.count, rent: bedRent[i].count })),
      types,
      communities: topValues(scoped, (l) => l.community, 10),
      prices: priceBands(scoped, purpose === "rent" ? "rent" : "sale"),
      ladder,
      scatter,
      sampled: step > 1 ? sales.length : 0,
    };
  }, [scoped, purpose]);

  const bedSeries = purpose === "all" ? SALE_RENT : SALE_RENT.filter((s) => s.key === purpose);
  const priceTitle = purpose === "rent" ? "Rent per year (AED)" : "Sale price (AED)";
  const sourceRows = sources.map((s) => s.name).filter((n) => data.perSource.has(n));
  const checkCols = QUALITY_CHECKS.map((c) => ({ key: c.key, label: c.label }));

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
        <ChartCard title="Purpose mix" table={{ columns: ["Purpose", "Listings"], rows: data.purposeMix.map((d) => [d.label, d.value]) }}>
          <Donut data={data.purposeMix} centerLabel="listings" />
        </ChartCard>
        <ChartCard
          title={priceTitle}
          description={purpose === "all" ? "Sale listings only; switch to Rent for annual rents." : "Listings per price band."}
          table={bucketTable("Band", data.prices)}
        >
          <Columns data={data.prices} xKey="label" series={COUNT("Listings")} />
        </ChartCard>
        <ChartCard
          title="Bedrooms"
          legend={bedSeries}
          table={{ columns: ["Bedrooms", "Sale", "Rent"], rows: data.beds.map((b) => [b.label, b.sale, b.rent]) }}
        >
          <Columns data={data.beds} xKey="label" series={bedSeries} grouped />
        </ChartCard>
        <ChartCard
          title="Size vs sale price"
          description={`Each dot is a sale listing (log scales).${data.sampled ? ` Sample of ${data.sampled.toLocaleString()}.` : ""} Click to open.`}
          className="md:col-span-2"
          table={{ columns: ["Listing", "Area (sqft)", "Price (AED)"], rows: data.scatter.map((d) => [d.title, d.area, d.price]) }}
        >
          <ScatterPlot
            data={data.scatter}
            x={{ key: "area", label: "Area (sqft)" }}
            y={{ key: "price", label: "Price", format: compactMoney }}
            tooltipLabel={(r) => String(r.title)}
            onSelect={(r) => navigate(`/listing/${encodeURIComponent(String(r.id))}`)}
          />
        </ChartCard>
        <ChartCard title="Quality score" description="Listings per score band (0–100)." table={bucketTable("Score", data.scoreBands)}>
          <Columns data={data.scoreBands} xKey="label" series={COUNT("Listings")} />
        </ChartCard>
        <ChartCard
          title="Property types"
          legend={bedSeries}
          table={{ columns: ["Type", "Sale", "Rent"], rows: data.types.map((t) => [t.label, t.sale, t.rent]) }}
        >
          <HBars data={data.types} labelKey="label" series={bedSeries} />
        </ChartCard>
        <ChartCard title="Top communities" table={bucketTable("Community", data.communities)}>
          <HBars data={data.communities} labelKey="label" series={COUNT("Listings")} />
        </ChartCard>
        <ChartCard
          title="Sale price per sqft"
          description="Median for the busiest communities (5+ priced sales with an area)."
          table={{ columns: ["Community", "Median AED/sqft", "Sales"], rows: data.ladder.map((d) => [d.label, d.median, d.count]) }}
        >
          <HBars data={data.ladder} labelKey="label" series={[{ key: "median", label: "AED / sqft", color: SERIES[0] }]} />
        </ChartCard>
        <ChartCard
          title="Quality checks by source"
          description="Share of each source's listings passing each check. Click a source to fix its issues."
          className="md:col-span-2 xl:col-span-3"
          table={{
            columns: ["Source", ...checkCols.map((c) => c.label)],
            rows: sourceRows.map((r) => {
              const s = data.perSource.get(r)!;
              return [r, ...checkCols.map((c) => Math.round((s.pass.get(c.key)! / s.n) * 100))];
            }),
          }}
        >
          <Heatmap
            rows={sourceRows}
            columns={checkCols}
            value={(row, col) => {
              const s = data.perSource.get(row);
              return s && s.n ? s.pass.get(col)! / s.n : null;
            }}
            onRow={(name) => {
              const id = sources.find((s) => s.name === name)?.id;
              if (id) navigate(`/sources?source=${id}&tab=issues`);
            }}
          />
        </ChartCard>
      </div>
    </section>
  );
}

function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const compactMoney = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M` : n >= 1000 ? `${Math.round(n / 1000)}K` : String(n);
