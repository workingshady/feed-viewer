import { MarketAnalysis } from "@/components/analytics/MarketAnalysis";
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  BarChart3,
  Bath,
  BedDouble,
  Building2,
  ChartPie,
  CircleDot,
  ClipboardCheck,
  Coins,
  Factory,
  GitCompare,
  Globe2,
  Home,
  Image as ImageIcon,
  Layers,
  LayoutGrid,
  LineChart as LineChartIcon,
  MapPin,
  Navigation,
  ParkingCircle,
  Percent,
  Ruler,
  ScatterChart as ScatterIcon,
  Sofa,
  Tags,
  Users,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Listing } from "@/lib/types";
import { computeListingAnalytics, formatAnalyticsMoney, type ListingAnalytics, type NamedCount } from "@/lib/listingAnalytics";
import { cn } from "@/lib/utils";
import {
  ChartTableActions,
  Columns,
  DataTable,
  Donut,
  HBars,
  Legend,
  ScatterPlot,
  SERIES,
  type TableData,
} from "@/components/charts/ChartKit";
import { priceBands } from "@/lib/sourceInsights";
import { computeFilteredPriceStats } from "@/lib/listingsFilteredStats";

const LISTINGS = [{ key: "count", label: "Listings", color: SERIES[0] }];
const money = (n: number) => (n ? formatAnalyticsMoney(n) : "0");
const countTable = (head: string, rows: NamedCount[]): TableData => ({ columns: [head, "Listings"], rows: rows.map((r) => [r.name, r.count]) });

type Props = {
  listings: Listing[];
  /** Page context for titles */
  contextTitle: string;
  contextSubtitle?: string;
  /** Show agent listing-volume chart (agency pages). */
  showAgentWorkload?: boolean;
  /** Omit the large “Property intelligence” hero when nested (e.g. agent profile Market tab). */
  hideHero?: boolean;
  /** Labels for chart tabs (optional 4th “Quality” tab). */
  sectionLabels?: { overview: string; market: string; inventory: string; quality?: string };
  className?: string;
};

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-primary/12 bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div className="text-xl font-bold tabular-nums text-foreground mt-1">{value}</div>
      {hint ? <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug">{hint}</p> : null}
    </div>
  );
}

/** Chart card with icon, footnote and the shared chart/table toggle + CSV download. */
function ChartShell({
  title,
  description,
  icon: Icon,
  children,
  className,
  footnote,
  table,
  legend,
}: {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  children: ReactNode;
  className?: string;
  /** What the chart measures and how to interpret it (shown below the plot). */
  footnote?: string;
  table?: TableData;
  legend?: { label: string; color: string }[];
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <Card className={cn("dashboard-card shadow-none overflow-hidden border-primary/12", className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
        <div className="min-w-0 space-y-1.5">
          <CardTitle className="text-base flex items-center gap-2 font-heading">
            <Icon className="w-4 h-4 text-primary-text shrink-0" />
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {table ? (
          <div className="flex shrink-0 items-center gap-1">
            <ChartTableActions title={title} table={table} asTable={asTable} onToggle={() => setAsTable((v) => !v)} />
          </div>
        ) : null}
      </CardHeader>
      <CardContent className={cn("space-y-3", footnote ? "pb-3" : "pb-4")}>
        {legend && legend.length > 1 && !asTable ? <Legend series={legend} /> : null}
        {asTable && table ? <DataTable table={table} /> : children}
      </CardContent>
      {footnote ? (
        <div className="px-6 pb-4 pt-0 border-t border-border/50">
          <p className="text-[11px] leading-relaxed text-muted-foreground mt-3">{footnote}</p>
        </div>
      ) : null}
    </Card>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <p className="text-sm text-muted-foreground py-10 text-center border border-dashed border-border rounded-lg">{message}</p>
  );
}

/** Count bars for a categorical breakdown; empty state when there's nothing to draw. */
function CountBars({ rows, empty }: { rows: NamedCount[]; empty: string }) {
  return rows.length === 0 ? <EmptyChart message={empty} /> : <HBars data={rows} labelKey="name" series={LISTINGS} />;
}

const median = (v: number[]) => {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const BED_LABELS = ["Studio", "1", "2", "3", "4", "5+"];

/** Median sale price per group (sale listings with a price only), groups with fewer than `min` listings dropped. */
function medianSaleBy(listings: Listing[], key: (l: Listing) => string | null, min = 1) {
  const groups = new Map<string, number[]>();
  for (const l of listings) {
    if (l.purpose !== "sale" || !(l.price > 0)) continue;
    const k = key(l);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(l.price);
  }
  return [...groups.entries()].filter(([, v]) => v.length >= min).map(([name, v]) => ({ name, median: median(v), count: v.length }));
}

const DEFAULT_SECTION_LABELS = {
  overview: "Overview",
  market: "Market",
  inventory: "Inventory",
  quality: "Quality",
} as const;

export default function ListingAnalyticsDashboard({
  listings,
  contextTitle,
  contextSubtitle,
  showAgentWorkload = false,
  hideHero = false,
  sectionLabels: sectionLabelsProp,
  className,
}: Props) {
  const sectionLabels = { ...DEFAULT_SECTION_LABELS, ...sectionLabelsProp };
  const a = useMemo(() => computeListingAnalytics(listings), [listings]);

  const purpose = useMemo(
    () =>
      [
        { label: "Sale", value: a.purpose.sale, color: SERIES[0] },
        { label: "Rent", value: a.purpose.rent, color: SERIES[1] },
        { label: "Unknown", value: a.purpose.unknown, color: SERIES[2] },
      ].filter((d) => d.value > 0),
    [a.purpose],
  );

  const priceStats = useMemo(() => computeFilteredPriceStats(listings), [listings]);
  const bands = useMemo(() => ({ sale: priceBands(listings, "sale"), rent: priceBands(listings, "rent") }), [listings]);

  const currencies = useMemo(() => a.currencyMix.filter((c) => c.count > 0), [a.currencyMix]);

  const saleByBeds = useMemo(() => {
    const rows = medianSaleBy(listings, (l) =>
      l.beds == null || Number.isNaN(l.beds) ? null : BED_LABELS[Math.min(Math.max(Math.round(l.beds), 0), 5)],
    );
    return BED_LABELS.map((b) => rows.find((r) => r.name === b)).filter((r): r is NonNullable<typeof r> => !!r);
  }, [listings]);

  const saleByType = useMemo(
    () =>
      medianSaleBy(listings, (l) => l.propertyType?.trim() || null, 3)
        .sort((x, y) => y.median - x.median)
        .slice(0, 12),
    [listings],
  );

  const saleScatter = useMemo(
    () => a.scatterPriceArea.filter((p) => p.purpose === "sale").map((p) => ({ area: p.area, price: p.price })),
    [a.scatterPriceArea],
  );

  const coverage = useMemo(() => [...a.fieldCoverage].sort((x, y) => x.pct - y.pct), [a.fieldCoverage]);

  const hasData = a.total > 0;
  const areaUnit = a.area?.unitLabel ?? "area";

  const analyticsBody = !hasData ? (
    <EmptyChart message="No listings to analyze yet. Import a feed or widen your selection." />
  ) : (
    <Tabs defaultValue="overview" className={cn("w-full", hideHero ? "mt-0" : "mt-6")}>
      <TabsList className="dashboard-tabs-list grid w-full max-w-4xl grid-cols-2 sm:grid-cols-4 h-auto sm:h-10 gap-1 p-1">
        <TabsTrigger value="overview" className="text-xs sm:text-sm gap-1.5 rounded-lg data-[state=inactive]:border-transparent">
          <BarChart3 className="w-3.5 h-3.5 hidden sm:inline" />
          {sectionLabels.overview}
        </TabsTrigger>
        <TabsTrigger value="market" className="text-xs sm:text-sm gap-1.5 rounded-lg data-[state=inactive]:border-transparent">
          <LineChartIcon className="w-3.5 h-3.5 hidden sm:inline" />
          {sectionLabels.market}
        </TabsTrigger>
        <TabsTrigger value="inventory" className="text-xs sm:text-sm gap-1.5 rounded-lg data-[state=inactive]:border-transparent">
          <Layers className="w-3.5 h-3.5 hidden sm:inline" />
          {sectionLabels.inventory}
        </TabsTrigger>
        <TabsTrigger value="quality" className="text-xs sm:text-sm gap-1.5 rounded-lg data-[state=inactive]:border-transparent">
          <ClipboardCheck className="w-3.5 h-3.5 hidden sm:inline" />
          {sectionLabels.quality}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="mt-5 space-y-6 outline-none">
        <KpiRow analytics={a} />

        <div className="grid lg:grid-cols-2 gap-5">
          <ChartShell
            title="Sale vs rent mix"
            description="Share of listings by transaction type."
            icon={ChartPie}
            footnote="Each slice counts listings by mapped purpose (sale, rent, or unknown when the feed did not resolve). Use it to see whether the portfolio skews sales, rentals, or needs mapping fixes."
            table={{ columns: ["Purpose", "Listings"], rows: purpose.map((p) => [p.label, p.value]) }}
          >
            {purpose.length === 0 ? <EmptyChart message="No purpose data." /> : <Donut data={purpose} centerLabel="listings" />}
          </ChartShell>

          <ChartShell
            title="Median price by purpose"
            description="Sale prices and yearly rents are summarised separately; they are never comparable as one number."
            icon={Coins}
            footnote="Only listings with a positive price count. Rents quoted monthly or weekly are converted to a yearly amount."
            table={{
              columns: ["Purpose", "Median", "Min", "Max", "Priced listings"],
              rows: (
                [
                  ["For sale", priceStats.sale],
                  ["Rent per year", priceStats.rent],
                ] as const
              ).map(([label, st]) => [label, st?.median ?? "", st?.min ?? "", st?.max ?? "", st?.count ?? 0]),
            }}
          >
            <div className="grid min-h-44 grid-cols-2 content-center gap-4">
              {(
                [
                  ["For sale", priceStats.sale],
                  ["Rent per year", priceStats.rent],
                ] as const
              ).map(([label, st]) => (
                <div key={label} className="space-y-1 rounded-xl border p-4">
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <div className="font-mono text-2xl font-semibold tabular-nums">{st ? formatAnalyticsMoney(st.median) : "—"}</div>
                  <div className="text-xs text-muted-foreground">
                    {st
                      ? `${st.count.toLocaleString()} priced · ${formatAnalyticsMoney(st.min)}–${formatAnalyticsMoney(st.max)}`
                      : "No priced listings"}
                  </div>
                </div>
              ))}
            </div>
          </ChartShell>
        </div>

        <ChartShell
          title="Price distribution"
          description="Listings per price band, with sales and yearly rents on their own scales."
          icon={BarChart3}
          table={{
            columns: ["Purpose", "Band", "Listings"],
            rows: [
              ...bands.sale.map((b) => ["Sale", b.label, b.count] as (string | number)[]),
              ...bands.rent.map((b) => ["Rent per year", b.label, b.count] as (string | number)[]),
            ],
          }}
        >
          <div className="grid gap-6 md:grid-cols-2">
            {(["sale", "rent"] as const).map((p) => (
              <section key={p} aria-label={p === "sale" ? "Sale price bands" : "Rent bands"}>
                <h4 className="mb-2 text-xs font-semibold">{p === "sale" ? "Sale price (AED)" : "Rent per year (AED)"}</h4>
                <Columns data={bands[p]} xKey="label" series={LISTINGS} />
              </section>
            ))}
          </div>
        </ChartShell>

        {currencies.length > 1 ? (
          <ChartShell
            title="Currency mix"
            description="When feeds mix currencies, segmenting averages by currency avoids misleading blends."
            icon={Globe2}
            footnote="Share of listings using each currency code. Appears when more than one currency exists — segment KPIs and price charts by currency for apples-to-apples reads."
            table={countTable("Currency", currencies)}
          >
            {currencies.length <= 5 ? (
              <Donut centerLabel="listings" data={currencies.map((c, i) => ({ label: c.name, value: c.count, color: SERIES[i] }))} />
            ) : (
              <HBars data={currencies} labelKey="name" series={LISTINGS} />
            )}
          </ChartShell>
        ) : null}
      </TabsContent>

      <TabsContent value="market" className="mt-5 space-y-6 outline-none">
        <MarketAnalysis listings={listings} />
        <div className="grid lg:grid-cols-2 gap-5">
          <ChartShell
            title="Median sale price by bedrooms"
            description="Where sale prices sit for each unit size."
            icon={Home}
            footnote="Sale listings with a price only; rents are left out so the scale stays honest. The table adds how many listings each median is based on."
            table={{ columns: ["Bedrooms", "Median sale price", "Listings"], rows: saleByBeds.map((r) => [r.name, r.median, r.count]) }}
          >
            {saleByBeds.length === 0 ? (
              <EmptyChart message="No priced sale listings with bedrooms." />
            ) : (
              <Columns data={saleByBeds} xKey="name" series={[{ key: "median", label: "Median sale price", color: SERIES[0] }]} valueFormat={money} height={260} />
            )}
          </ChartShell>

          <ChartShell
            title="Sale price vs built area"
            description="One dot per sale listing, on log scales. Highlights outliers and luxury clusters."
            icon={ScatterIcon}
            footnote="Dense clusters show typical bundles; lone outliers may be mis-mapped area units or trophy assets. Rentals are left out because yearly rents sit on a different scale."
            table={{
              columns: [`Area (${areaUnit})`, "Sale price"],
              rows: saleScatter.map((p) => [Math.round(p.area), p.price]),
            }}
          >
            {saleScatter.length === 0 ? (
              <EmptyChart message="Need both price and area on sale listings." />
            ) : (
              <ScatterPlot
                data={saleScatter}
                x={{ key: "area", label: `Area (${areaUnit})`, format: (n) => Math.round(n).toLocaleString() }}
                y={{ key: "price", label: "Sale price", format: money }}
              />
            )}
          </ChartShell>
        </div>

        <div className="grid lg:grid-cols-2 gap-5">
          <ChartShell
            title="Built-area distribution"
            description={`Listings per size band in ${areaUnit} — where the bulk of units sit.`}
            icon={Ruler}
            footnote="Sharp peaks mean many listings share similar sizes; wide spreads suggest mixed product lines or mixed unit types in one feed."
            table={{
              columns: [`Band (${areaUnit})`, "Listings"],
              rows: a.areaHistogram.map((b) => [`${Math.round(b.min).toLocaleString()}–${Math.round(b.max).toLocaleString()}`, b.count]),
            }}
          >
            {a.areaHistogram.length === 0 ? (
              <EmptyChart message="No numeric built areas in this set." />
            ) : (
              <Columns data={a.areaHistogram.map((b) => ({ label: b.label, count: b.count }))} xKey="label" series={LISTINGS} height={260} />
            )}
          </ChartShell>

          <ChartShell
            title="Median sale price by property type"
            description="Types with at least 3 priced sale listings, highest first."
            icon={LayoutGrid}
            footnote="Sale listings with a price only. Shows which types drive pricing; the table adds the number of listings behind each median."
            table={{ columns: ["Property type", "Median sale price", "Listings"], rows: saleByType.map((r) => [r.name, r.median, r.count]) }}
          >
            {saleByType.length === 0 ? (
              <EmptyChart message="No property type has 3+ priced sale listings." />
            ) : (
              <HBars data={saleByType} labelKey="name" series={[{ key: "median", label: "Median sale price", color: SERIES[0] }]} valueFormat={money} />
            )}
          </ChartShell>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card className="border-border/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Ruler className="w-4 h-4 text-primary-text" /> Area
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2 text-muted-foreground">
              {a.area ? (
                <>
                  <p>
                    <span className="text-foreground font-medium">{a.area.withArea}</span> listings with area ({a.area.unitLabel})
                  </p>
                  <p>
                    Median{" "}
                    <span className="text-foreground tabular-nums">
                      {Math.round(a.area.median).toLocaleString()} {a.area.unitLabel}
                    </span>
                  </p>
                  <p>
                    Range{" "}
                    <span className="text-foreground tabular-nums">
                      {Math.round(a.area.min).toLocaleString()} – {Math.round(a.area.max).toLocaleString()}
                    </span>
                  </p>
                </>
              ) : (
                <p>No area fields populated.</p>
              )}
            </CardContent>
            <CardFooter className="border-t border-border/50 pt-3">
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Summarizes built-area numeric fields only. Mixed units in one feed will skew medians — align units in mapping first.
              </p>
            </CardFooter>
          </Card>
          <Card className="border-border/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Percent className="w-4 h-4 text-primary-text" /> Sale price / area
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2 text-muted-foreground">
              {a.pricePerArea ? (
                <>
                  <p>
                    Median <span className="text-foreground font-semibold tabular-nums">{formatAnalyticsMoney(a.pricePerArea.median)}</span>{" "}
                    {a.pricePerArea.label}
                  </p>
                  <p>
                    Mean <span className="text-foreground tabular-nums">{formatAnalyticsMoney(a.pricePerArea.mean)}</span>
                  </p>
                </>
              ) : (
                <p>Need overlapping price and area.</p>
              )}
            </CardContent>
            <CardFooter className="border-t border-border/50 pt-3">
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Price per {a.pricePerArea?.label ?? "unit"} uses sale listings that have both price and area. Outliers (tiny area or
                huge price) pull the mean; compare to the median.
              </p>
            </CardFooter>
          </Card>
          <Card className="border-border/80 sm:col-span-2 lg:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <GitCompare className="w-4 h-4 text-primary-text" /> Sale price quartiles
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2 text-muted-foreground">
              {priceStats.sale ? (
                <>
                  <p>
                    Range{" "}
                    <span className="text-foreground tabular-nums">
                      {formatAnalyticsMoney(priceStats.sale.min)} – {formatAnalyticsMoney(priceStats.sale.max)}
                    </span>
                  </p>
                  <p>
                    Median <span className="text-foreground font-semibold">{formatAnalyticsMoney(priceStats.sale.median)}</span>
                  </p>
                </>
              ) : (
                <p>No priced sale listings.</p>
              )}
            </CardContent>
            <CardFooter className="border-t border-border/50 pt-3">
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Sale listings only. The median is less sensitive to extreme asks than the mean.
              </p>
            </CardFooter>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="inventory" className="mt-5 space-y-6 outline-none">
        <div className="grid lg:grid-cols-2 gap-5">
          <ChartShell
            title="Property types"
            description="Inventory composition — villa vs apartment vs land, as labeled in the feed."
            icon={Tags}
            footnote="Counts listings per property-type label. The “Other” bucket appears when there are many rare labels — drill into mapping if types look wrong."
            table={countTable("Property type", a.propertyTypes)}
          >
            <CountBars rows={a.propertyTypes} empty="No property types." />
          </ChartShell>
          <ChartShell
            title="Top communities"
            description="Where volume concentrates — useful for micro-market comparisons."
            icon={MapPin}
            footnote="The busiest community names in the feed. Long tails roll into “Other.” Compare with city and sub-community charts to check geography consistency."
            table={countTable("Community", a.communities)}
          >
            <CountBars rows={a.communities} empty="No community names." />
          </ChartShell>
          <ChartShell
            title="Top developers"
            description="Developer names when mapped — which brands dominate the stock."
            icon={Factory}
            footnote="Aggregates the developer field. A large “—” bar means many listings lack a developer; otherwise use this to see project-brand concentration."
            table={countTable("Developer", a.developers)}
          >
            <CountBars rows={a.developers} empty="No developer labels." />
          </ChartShell>
          <ChartShell
            title="Sub-communities"
            description="Finer location labels under community, when the feed provides them."
            icon={Navigation}
            footnote="Uses the sub-community field. Helpful to verify micro-clusters; sparse data may collapse into “—” or “Other.”"
            table={countTable("Sub-community", a.subCommunities)}
          >
            <CountBars rows={a.subCommunities} empty="No sub-community labels." />
          </ChartShell>
          <ChartShell
            title="Bedrooms"
            description="Bed count distribution across the portfolio."
            icon={BedDouble}
            footnote="Distribution of bedroom counts after rounding. Spikes show your typical unit mix; odd spikes may come from mapping or studio handling."
            table={countTable("Bedrooms", a.beds)}
          >
            <Columns data={a.beds} xKey="name" series={LISTINGS} />
          </ChartShell>
          <ChartShell
            title="Bathrooms"
            description="Bath mix — helps explain unit depth beyond beds."
            icon={Bath}
            footnote="Bath counts are bucketed to half-bath precision. Compare with bedrooms to spot mismatches (e.g. many beds, few baths) that can signal data issues."
            table={countTable("Bathrooms", a.baths)}
          >
            <Columns data={a.baths} xKey="name" series={LISTINGS} />
          </ChartShell>
          <ChartShell
            title="Cities"
            description="City roll-up when present."
            icon={Building2}
            footnote="Volume by city label. Useful when one feed spans multiple cities; pair with community charts for hierarchy checks."
            table={countTable("City", a.cities)}
          >
            <CountBars rows={a.cities} empty="No city labels." />
          </ChartShell>
          <ChartShell
            title="Completion status"
            description="Off-plan vs ready inventory signals."
            icon={CircleDot}
            footnote="Uses completion-status text from the feed (off-plan, ready, etc.). Strong skew can indicate project pipeline vs resale-heavy inventory."
            table={countTable("Completion status", a.completionStatus)}
          >
            <CountBars rows={a.completionStatus} empty="No completion status." />
          </ChartShell>
          <ChartShell
            title="Parking spaces"
            description="Parking count distribution when mapped."
            icon={ParkingCircle}
            footnote="How many parking slots are attached to each listing. Zero or missing may mean the field is absent rather than true zero parking."
            table={countTable("Parking spaces", a.parking)}
          >
            <Columns data={a.parking} xKey="name" series={LISTINGS} />
          </ChartShell>
          <ChartShell
            title="Furnished"
            description="Furnishing labels in the feed — furnished, unfurnished, semi, etc."
            icon={Sofa}
            footnote="Raw furnishing labels from the XML. Inconsistent wording can split one concept across multiple bars — normalization happens in mapping, not here."
            table={countTable("Furnished", a.furnished)}
          >
            <CountBars rows={a.furnished} empty="No furnishing labels." />
          </ChartShell>
        </div>

        {showAgentWorkload && a.agentsByVolume.length > 0 ? (
          <ChartShell
            title="Agents by listing volume"
            description="Relative workload inside this agency — who carries the most listings in the feed."
            icon={Users}
            footnote="Counts listings per agent name when present. Useful for internal workload; not all feeds attribute every listing to an agent."
            table={countTable("Agent", a.agentsByVolume)}
          >
            <HBars data={a.agentsByVolume} labelKey="name" series={LISTINGS} />
          </ChartShell>
        ) : null}
      </TabsContent>

      <TabsContent value="quality" className="mt-5 space-y-6 outline-none">
        <Card className="dashboard-card border-primary/12 shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-heading">Feed quality &amp; completeness</CardTitle>
            <CardDescription>
              These charts do not judge “good” or “bad” listings — they show how completely key fields are populated so you can
              prioritize mapping work and spot blind spots before publishing.
            </CardDescription>
            <p className="text-sm pt-2">
              <Link to="/field-quality" className="text-primary-text font-medium hover:underline">
                Open full field EDA dashboard
              </Link>
              <span className="text-muted-foreground"> — all mapped fields, raw XML paths, segments, and exports.</span>
            </p>
          </CardHeader>
        </Card>

        <div className="grid lg:grid-cols-2 gap-5">
          <ChartShell
            title="Field coverage"
            description="Share of listings where important fields are present (non-empty / valid)."
            icon={ClipboardCheck}
            footnote="Each bar is the percentage of listings in the current scope with that field populated. Low bars highlight gaps (e.g. missing coordinates) that affect search, maps, and trust — not average quality of the homes."
            table={{ columns: ["Field", "% of listings", "Listings"], rows: coverage.map((c) => [c.label, c.pct, c.filled]) }}
          >
            <HBars
              data={coverage}
              labelKey="label"
              series={[{ key: "pct", label: "Coverage %", color: SERIES[0] }]}
              valueFormat={(n) => `${Math.round(n)}%`}
              max={100}
            />
          </ChartShell>
          <ChartShell
            title="Photo depth"
            description="How many listings fall into each photo-count bucket."
            icon={ImageIcon}
            footnote="Buckets group image counts. Heavy “0 photos” suggests media not mapped or stripped; “6+” often indicates rich marketing packages. Compare with your portal requirements."
            table={countTable("Photos", a.imageBuckets)}
          >
            <Columns data={a.imageBuckets} xKey="name" series={LISTINGS} height={260} />
          </ChartShell>
        </div>
      </TabsContent>
    </Tabs>
  );

  return (
    <div className={cn("space-y-6", className)}>
      {hideHero ? (
        <div className="dashboard-card rounded-2xl p-4 md:p-6 shadow-none border-primary/12">
          {contextSubtitle ? <p className="text-sm text-muted-foreground mb-4 max-w-3xl">{contextSubtitle}</p> : null}
          {analyticsBody}
        </div>
      ) : (
        <div className="dashboard-card dashboard-card--accent rounded-2xl p-5 md:p-6 shadow-none">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
            <div>
              <h2 className="text-xl md:text-2xl font-extrabold font-heading text-foreground tracking-tight">Property intelligence</h2>
              <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
                {contextSubtitle ??
                  `Market-style breakdown for ${contextTitle}: pricing, inventory mix, locations, and size — similar to what you would expect from a listing analytics dashboard.`}
              </p>
            </div>
            <div className="text-xs font-medium text-muted-foreground tabular-nums">{a.total} listings in scope</div>
          </div>
          {analyticsBody}
        </div>
      )}
    </div>
  );
}

function KpiRow({ analytics: a }: { analytics: ListingAnalytics }) {
  const photos = a.fieldCoverage.find((x) => x.label === "Photos");
  const geo = a.fieldCoverage.find((x) => x.label === "Map coordinates");
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
      <Kpi label="Total listings" value={a.total.toLocaleString()} hint="Rows in current scope" />
      <Kpi
        label="With price"
        value={`${a.pricedCount.toLocaleString()} (${a.total ? Math.round((a.pricedCount / a.total) * 100) : 0}%)`}
        hint={`${a.missingPriceCount} without numeric price`}
      />
      <Kpi label="Price on application" value={a.priceOnApplicationCount.toLocaleString()} hint="Listed without a price" />
      <Kpi
        label="Median sale price per area"
        value={a.pricePerArea ? formatAnalyticsMoney(a.pricePerArea.median) : "—"}
        hint={a.pricePerArea ? `Sale listings, ${a.pricePerArea.label}` : "Needs price and area"}
      />
      <Kpi label="Sale / rent" value={`${a.purpose.sale} / ${a.purpose.rent}`} hint={`${a.purpose.unknown} unknown purpose`} />
      <Kpi label="Unique communities" value={a.uniqueCommunities.toLocaleString()} hint="Distinct community names in feed" />
      <Kpi label="With photos" value={photos ? `${photos.pct}%` : "—"} hint={photos ? `${photos.filled} listings` : "Coverage from feed"} />
      <Kpi label="Geo-tagged" value={geo ? `${geo.pct}%` : "—"} hint={geo ? `${geo.filled} with lat/lng` : "Map coordinates"} />
    </div>
  );
}
