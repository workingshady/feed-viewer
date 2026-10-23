import { useId, useMemo, type SVGProps } from "react";
import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  ComposedChart,
  Pie,
  PieChart,
  Scatter,
  ScatterChart,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import {
  BarChart3,
  Building2,
  ChartPie,
  CircleDot,
  ClipboardCheck,
  Factory,
  Sofa,
  Coins,
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
  Tags,
  Users,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Listing } from "@/lib/types";
import { computeListingAnalytics, formatAnalyticsMoney, type ListingAnalytics } from "@/lib/listingAnalytics";
import { RECHARTS_BAR_CURSOR, RECHARTS_LINE_CURSOR, RECHARTS_TOOLTIP_PROPS } from "@/lib/chartTheme";
import { cn } from "@/lib/utils";
import { Columns, SERIES } from "@/components/charts/ChartKit";
import { priceBands } from "@/lib/sourceInsights";
import { computeFilteredPriceStats } from "@/lib/listingsFilteredStats";

/** Bar / histogram hover band */
const CHART_TOOLTIP_BAR = { ...RECHARTS_TOOLTIP_PROPS, cursor: RECHARTS_BAR_CURSOR as unknown as SVGProps<SVGElement> };
/** Line, area, composed (vertical crosshair) */
const CHART_TOOLTIP_LINE = { ...RECHARTS_TOOLTIP_PROPS, cursor: RECHARTS_LINE_CURSOR };
/** Pie — no rectangular cursor overlay */
const CHART_TOOLTIP_PIE = { ...RECHARTS_TOOLTIP_PROPS, cursor: false as const };

const CHART_COLORS = SERIES;
/** Legend labels stay in text ink; the swatch carries the series colour. */
const legendText = (v: string) => <span className="text-xs text-muted-foreground">{v}</span>;

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

function Kpi({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-primary/12 bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div className="text-xl font-bold tabular-nums text-foreground mt-1">{value}</div>
      {hint ? <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug">{hint}</p> : null}
    </div>
  );
}

function ChartShell({
  title,
  description,
  icon: Icon,
  children,
  className,
  footnote,
}: {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  className?: string;
  /** What the chart measures and how to interpret it (shown below the plot). */
  footnote?: string;
}) {
  return (
    <Card className={cn("dashboard-card shadow-none overflow-hidden border-primary/12", className)}>
      <CardHeader className="pb-2 space-y-0">
        <CardTitle className="text-base flex items-center gap-2 font-heading">
          <Icon className="w-4 h-4 text-primary-text shrink-0" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className={footnote ? "pb-3" : "pb-4"}>{children}</CardContent>
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
  const chartUid = useId().replace(/:/g, "");
  const sectionLabels = { ...DEFAULT_SECTION_LABELS, ...sectionLabelsProp };
  const a = useMemo(() => computeListingAnalytics(listings), [listings]);

  const purposePie = useMemo(() => {
    const rows: { name: string; value: number }[] = [];
    if (a.purpose.sale) rows.push({ name: "Sale", value: a.purpose.sale });
    if (a.purpose.rent) rows.push({ name: "Rent", value: a.purpose.rent });
    if (a.purpose.unknown) rows.push({ name: "Unknown", value: a.purpose.unknown });
    return rows;
  }, [a.purpose]);

  const priceStats = useMemo(() => computeFilteredPriceStats(listings), [listings]);

  const currencyPie = useMemo(() => a.currencyMix.filter((c) => c.count > 0).map((c) => ({ name: c.name, value: c.count })), [a.currencyMix]);

  const coverageChartData = useMemo(
    () => [...a.fieldCoverage].sort((x, y) => x.pct - y.pct),
    [a.fieldCoverage],
  );

  const hasData = a.total > 0;

  const analyticsBody =
    !hasData ? (
      <EmptyChart message="No listings to analyze yet. Import a feed or widen your selection." />
    ) : (
      <Tabs defaultValue="overview" className={cn("w-full", hideHero ? "mt-0" : "mt-6")}>
        <TabsList className="dashboard-tabs-list grid w-full max-w-4xl grid-cols-2 sm:grid-cols-4 h-auto sm:h-10 gap-1 p-1">
          <TabsTrigger
            value="overview"
            className="text-xs sm:text-sm gap-1.5 rounded-lg data-[state=inactive]:border-transparent"
          >
            <BarChart3 className="w-3.5 h-3.5 hidden sm:inline" />
            {sectionLabels.overview}
          </TabsTrigger>
          <TabsTrigger
            value="market"
            className="text-xs sm:text-sm gap-1.5 rounded-lg data-[state=inactive]:border-transparent"
          >
            <LineChartIcon className="w-3.5 h-3.5 hidden sm:inline" />
            {sectionLabels.market}
          </TabsTrigger>
          <TabsTrigger
            value="inventory"
            className="text-xs sm:text-sm gap-1.5 rounded-lg data-[state=inactive]:border-transparent"
          >
            <Layers className="w-3.5 h-3.5 hidden sm:inline" />
            {sectionLabels.inventory}
          </TabsTrigger>
          <TabsTrigger
            value="quality"
            className="text-xs sm:text-sm gap-1.5 rounded-lg data-[state=inactive]:border-transparent"
          >
            <ClipboardCheck className="w-3.5 h-3.5 hidden sm:inline" />
            {sectionLabels.quality}
          </TabsTrigger>
        </TabsList>

            <TabsContent value="overview" className="mt-5 space-y-6 outline-none">
              <KpiRow analytics={a} />

              <div className="grid lg:grid-cols-2 gap-5">
                <ChartShell
                  title="Sale vs rent mix"
                  description="Share of rows by transaction type — the backbone of any agency or agent pipeline view."
                  icon={ChartPie}
                  footnote="Each slice counts listings by mapped purpose (sale, rent, or unknown when the feed did not resolve). Use it to see whether the portfolio skews sales, rentals, or needs mapping fixes."
                >
                  {purposePie.length === 0 ? (
                    <EmptyChart message="No purpose data." />
                  ) : (
                    <div className="h-64 w-full min-w-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={purposePie}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={48}
                            outerRadius={82}
                            paddingAngle={2}
                          >
                            {purposePie.map((_, i) => (
                              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={0} />
                            ))}
                          </Pie>
                          <RechartsTooltip {...CHART_TOOLTIP_PIE}
                            formatter={(v: number) => [v, "Listings"]}
                          />
                          <Legend formatter={legendText} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </ChartShell>

                <ChartShell
                  title="Median price by purpose"
                  description="Sale prices and yearly rents are summarised separately; they are never comparable as one number."
                  icon={Coins}
                  footnote="Only listings with a positive price count. Rents quoted monthly or weekly are converted to a yearly amount."
                >
                  <div className="grid h-64 grid-cols-2 content-center gap-4">
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
              >
                <div className="grid gap-6 md:grid-cols-2">
                  {(["sale", "rent"] as const).map((p) => (
                    <section key={p} aria-label={p === "sale" ? "Sale price bands" : "Rent bands"}>
                      <h4 className="mb-2 text-xs font-semibold">{p === "sale" ? "Sale price (AED)" : "Rent per year (AED)"}</h4>
                      <Columns data={priceBands(listings, p)} xKey="label" series={[{ key: "count", label: "Listings", color: SERIES[0] }]} />
                    </section>
                  ))}
                </div>
              </ChartShell>

              {currencyPie.length > 1 ? (
                <ChartShell
                  title="Currency mix"
                  description="When feeds mix currencies, segmenting averages by currency avoids misleading blends."
                  icon={Globe2}
                  footnote="Each slice is the share of rows using that currency code. Appears when more than one currency exists — reminder to segment KPIs and price charts by currency for apples-to-apples reads."
                >
                  <div className="h-56 w-full min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={currencyPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={78}>
                          {currencyPie.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={0} />
                          ))}
                        </Pie>
                        <RechartsTooltip {...CHART_TOOLTIP_PIE} formatter={(v: number) => [v, "Listings"]} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </ChartShell>
              ) : null}
            </TabsContent>

            <TabsContent value="market" className="mt-5 space-y-6 outline-none">
              <div className="grid lg:grid-cols-2 gap-5">
                <ChartShell
                  title="Average price by bedrooms"
                  description="Mean price per bedroom bucket — quick read on where inventory sits in the stack."
                  icon={Home}
                  footnote="Gray bars are how many priced listings sit in each bedroom bucket; the line is the average ask in that bucket. Mismatched bar height vs line often means a few expensive units pulling the average up."
                >
                  {a.avgPriceByBeds.length === 0 ? (
                    <EmptyChart message="No bed + price pairs." />
                  ) : (
                    <div className="h-72 w-full min-w-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={a.avgPriceByBeds} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                          <XAxis dataKey="beds" tick={{ fontSize: 10 }} />
                          <YAxis
                            yAxisId="left"
                            tickFormatter={(v) => formatAnalyticsMoney(v)}
                            tick={{ fontSize: 10 }}
                            width={52}
                          />
                          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} width={36} />
                          <RechartsTooltip {...CHART_TOOLTIP_LINE}
                            formatter={(v: number, name: string) =>
                              name === "avgPrice" ? [formatAnalyticsMoney(v), "Avg price"] : [v, "Count"]
                            }
                          />
                          <Legend formatter={legendText} />
                          <Bar yAxisId="right" dataKey="count" name="Count" fill="hsl(var(--muted))" radius={[4, 4, 0, 0]} opacity={0.85} />
                          <Line
                            yAxisId="left"
                            type="monotone"
                            dataKey="avgPrice"
                            name="Avg price"
                            stroke="hsl(var(--secondary))"
                            strokeWidth={2}
                            dot={{ r: 3, fill: "hsl(var(--secondary))" }}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </ChartShell>

                <ChartShell
                  title="Price vs built area"
                  description="Scatter of price against area (when both exist). Highlights outliers and luxury clusters."
                  icon={ScatterIcon}
                  footnote="Each point is one listing with price and area. Sale (primary) vs rent (secondary) coloring separates tenures. Dense clusters show typical bundles; lone outliers may be mis-mapped area units or trophy assets."
                >
                  {a.scatterPriceArea.length === 0 ? (
                    <EmptyChart message="Need both price and area on listings." />
                  ) : (
                    <div className="h-72 w-full min-w-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                          <XAxis
                            type="number"
                            dataKey="area"
                            name="Area"
                            tick={{ fontSize: 10 }}
                            label={{ value: a.area?.unitLabel ?? "Area", position: "bottom", offset: 0, fontSize: 11 }}
                          />
                          <YAxis
                            type="number"
                            dataKey="price"
                            name="Price"
                            tickFormatter={(v) => formatAnalyticsMoney(v)}
                            tick={{ fontSize: 10 }}
                            width={56}
                          />
                          <RechartsTooltip {...CHART_TOOLTIP_LINE}
                            cursor={{ strokeDasharray: "3 3", stroke: "hsl(var(--primary) / 0.45)" }}
                            formatter={(v: number, name: string) =>
                              name === "price" ? [formatAnalyticsMoney(v), "Price"] : [v, "Area"]
                            }
                          />
                          {a.scatterPriceArea.some((p) => p.purpose === "sale") ? (
                            <Scatter
                              name="Sale"
                              data={a.scatterPriceArea.filter((p) => p.purpose === "sale")}
                              fill="hsl(var(--primary))"
                              opacity={0.55}
                            />
                          ) : null}
                          {a.scatterPriceArea.some((p) => p.purpose === "rent") ? (
                            <Scatter
                              name="Rent"
                              data={a.scatterPriceArea.filter((p) => p.purpose === "rent")}
                              fill="hsl(var(--secondary))"
                              opacity={0.55}
                            />
                          ) : null}
                          <Legend formatter={legendText} />
                        </ScatterChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </ChartShell>
              </div>

              <div className="grid lg:grid-cols-2 gap-5">
                <ChartShell
                  title="Built-area distribution"
                  description={`Histogram of sizes in ${a.area?.unitLabel ?? "area"} — where the bulk of units sit.`}
                  icon={Ruler}
                  footnote="Mirrors the price histogram but for built area. Sharp peaks mean many listings share similar sizes; wide spreads suggest mixed product lines or mixed unit types in one feed."
                >
                  {a.areaHistogram.length === 0 ? (
                    <EmptyChart message="No numeric built areas in this set." />
                  ) : (
                    <div className="h-72 w-full min-w-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={a.areaHistogram} margin={{ top: 8, right: 12, left: 4, bottom: 24 }}>
                          <defs>
                            <linearGradient id={`areaHistFill-${chartUid}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="hsl(var(--secondary))" stopOpacity={0.35} />
                              <stop offset="100%" stopColor="hsl(var(--secondary))" stopOpacity={0.02} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                          <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={0} angle={-22} textAnchor="end" height={56} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={36} />
                          <RechartsTooltip
                            {...CHART_TOOLTIP_LINE}
                            formatter={(v: number) => [v, "Listings"]}
                            labelFormatter={(_, p) => {
                              const row = p?.[0]?.payload as ListingAnalytics["areaHistogram"][0] | undefined;
                              return row
                                ? `Range ${Math.round(row.min).toLocaleString()} – ${Math.round(row.max).toLocaleString()} ${a.area?.unitLabel ?? ""}`
                                : "";
                            }}
                          />
                          <Area
                            type="monotone"
                            dataKey="count"
                            name="Listings"
                            stroke="hsl(var(--secondary))"
                            fill={`url(#areaHistFill-${chartUid})`}
                            strokeWidth={2}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </ChartShell>

                <ChartShell
                  title="Average price by property type"
                  description="Mean ask among priced listings, grouped by the property type label from the feed."
                  icon={LayoutGrid}
                  footnote="Uses only rows with a positive price. Long tail labels are often collapsed into “Other” in the inventory chart — here you see which types drive average pricing."
                >
                  {a.avgPriceByPropertyType.length === 0 ? (
                    <EmptyChart message="No priced listings with a property type." />
                  ) : (
                    <div className="h-72 w-full min-w-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={a.avgPriceByPropertyType}
                          margin={{ top: 8, right: 12, left: 4, bottom: 48 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" vertical={false} />
                          <XAxis
                            dataKey="name"
                            tick={{ fontSize: 9 }}
                            interval={0}
                            angle={-28}
                            textAnchor="end"
                            height={72}
                          />
                          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatAnalyticsMoney(v)} width={56} />
                          <RechartsTooltip
                            {...CHART_TOOLTIP_BAR}
                            formatter={(v: number, _name: string, item: { payload?: { count?: number } }) => {
                              const n = item?.payload?.count;
                              return [formatAnalyticsMoney(v), n != null ? `Avg (${n} priced)` : "Avg price"];
                            }}
                          />
                          <Bar dataKey="avgPrice" radius={[6, 6, 0, 0]} fill="hsl(var(--primary))" name="Avg price" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
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
                          <span className="text-foreground font-medium">{a.area.withArea}</span> listings with area (
                          {a.area.unitLabel})
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
                      Summarizes built-area numeric fields only. Mixed units in one feed will skew medians — align units in
                      mapping first.
                    </p>
                  </CardFooter>
                </Card>
                <Card className="border-border/80">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Percent className="w-4 h-4 text-primary-text" /> Price / area
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm space-y-2 text-muted-foreground">
                    {a.pricePerArea ? (
                      <>
                        <p>
                          Median{" "}
                          <span className="text-foreground font-semibold tabular-nums">
                            {formatAnalyticsMoney(a.pricePerArea.median)}
                          </span>{" "}
                          {a.pricePerArea.label}
                        </p>
                        <p>
                          Mean{" "}
                          <span className="text-foreground tabular-nums">{formatAnalyticsMoney(a.pricePerArea.mean)}</span>
                        </p>
                      </>
                    ) : (
                      <p>Need overlapping price and area.</p>
                    )}
                  </CardContent>
                  <CardFooter className="border-t border-border/50 pt-3">
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      Price per {a.pricePerArea?.label ?? "unit"} uses listings that have both price and area. Outliers
                      (tiny area or huge price) will pull the mean; compare to the median.
                    </p>
                  </CardFooter>
                </Card>
                <Card className="border-border/80 sm:col-span-2 lg:col-span-1">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <GitCompare className="w-4 h-4 text-primary-text" /> Price quartiles
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm space-y-2 text-muted-foreground">
                    {a.price ? (
                      <>
                        <p>
                          IQR:{" "}
                          <span className="text-foreground tabular-nums">
                            {formatAnalyticsMoney(a.price.p25)} – {formatAnalyticsMoney(a.price.p75)}
                          </span>
                        </p>
                        <p>
                          Median{" "}
                          <span className="text-foreground font-semibold">{formatAnalyticsMoney(a.price.median)}</span>
                        </p>
                      </>
                    ) : (
                      <p>No priced rows.</p>
                    )}
                  </CardContent>
                  <CardFooter className="border-t border-border/50 pt-3">
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      Quartiles split priced listings into four equal-count bands. The IQR (middle 50%) is less sensitive
                      to extreme asks than the mean alone.
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
                >
                  {a.propertyTypes.length === 0 ? (
                    <EmptyChart message="No property types." />
                  ) : (
                    <div className="h-72 w-full min-w-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          layout="vertical"
                          data={a.propertyTypes}
                          margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
                        >
                          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                          <YAxis
                            type="category"
                            dataKey="name"
                            width={100}
                            tick={{ fontSize: 10 }}
                            interval={0}
                          />
                          <RechartsTooltip {...CHART_TOOLTIP_BAR} formatter={(v: number) => [v, "Listings"]} />
                          <Bar dataKey="count" radius={[0, 4, 4, 0]} fill="hsl(var(--primary))" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </ChartShell>

                <ChartShell
                  title="Top communities"
                  description="Where volume concentrates — useful for micro-market comparisons."
                  icon={MapPin}
                  footnote="Shows the busiest community names in the feed. Long tails roll into “Other.” Compare with city and sub-community charts to see geography consistency."
                >
                  {a.communities.length === 0 ? (
                    <EmptyChart message="No community names." />
                  ) : (
                    <div className="h-72 w-full min-w-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          layout="vertical"
                          data={a.communities}
                          margin={{ top: 4, right: 12, left: 8, bottom: 4 }}
                        >
                          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                          <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 9 }} interval={0} />
                          <RechartsTooltip {...CHART_TOOLTIP_BAR} formatter={(v: number) => [v, "Listings"]} />
                          <Bar dataKey="count" radius={[0, 4, 4, 0]} fill="hsl(195 17% 55%)" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </ChartShell>
              </div>

              <div className="grid lg:grid-cols-2 gap-5">
                <ChartShell
                  title="Top developers"
                  description="Developer names when mapped — which brands dominate the stock."
                  icon={Factory}
                  footnote="Aggregates the developer field. A large “—” slice means many rows lack a developer; otherwise use this to see project-brand concentration."
                >
                  {a.developers.length === 0 ? (
                    <EmptyChart message="No developer labels." />
                  ) : (
                    <div className="h-64 w-full min-w-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          layout="vertical"
                          data={a.developers}
                          margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
                        >
                          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                          <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 9 }} interval={0} />
                          <RechartsTooltip {...CHART_TOOLTIP_BAR} formatter={(v: number) => [v, "Listings"]} />
                          <Bar dataKey="count" radius={[0, 4, 4, 0]} fill="hsl(var(--secondary))" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </ChartShell>

                <ChartShell
                  title="Sub-communities"
                  description="Finer location labels under community, when the feed provides them."
                  icon={Navigation}
                  footnote="Uses the sub-community field. Helpful to verify micro-clusters; sparse data may collapse into “—” or “Other” depending on cardinality."
                >
                  {a.subCommunities.length === 0 ? (
                    <EmptyChart message="No sub-community labels." />
                  ) : (
                    <div className="h-64 w-full min-w-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          layout="vertical"
                          data={a.subCommunities}
                          margin={{ top: 4, right: 12, left: 8, bottom: 4 }}
                        >
                          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                          <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 9 }} interval={0} />
                          <RechartsTooltip {...CHART_TOOLTIP_BAR} formatter={(v: number) => [v, "Listings"]} />
                          <Bar dataKey="count" radius={[0, 4, 4, 0]} fill="hsl(var(--primary))" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </ChartShell>
              </div>

              <div className="grid lg:grid-cols-2 gap-5">
                <ChartShell
                  title="Bedrooms"
                  description="Bed count distribution across the portfolio."
                  icon={Building2}
                  footnote="Distribution of bedroom counts after rounding. Spikes show your typical unit mix; odd spikes may come from mapping or studio handling."
                >
                  <div className="h-56 w-full min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={a.beds} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={32} />
                        <RechartsTooltip {...CHART_TOOLTIP_BAR} formatter={(v: number) => [v, "Listings"]} />
                        <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </ChartShell>

                <ChartShell
                  title="Bathrooms"
                  description="Bath mix — helps explain unit depth beyond beds."
                  icon={CircleDot}
                  footnote="Bath counts are bucketed to half-bath precision. Compare with bedrooms to spot mismatches (e.g. many beds, few baths) that can signal data issues."
                >
                  <div className="h-56 w-full min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={a.baths} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={32} />
                        <RechartsTooltip {...CHART_TOOLTIP_BAR} formatter={(v: number) => [v, "Listings"]} />
                        <Bar dataKey="count" fill="hsl(var(--secondary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </ChartShell>
              </div>

              <div className="grid lg:grid-cols-2 gap-5">
                <ChartShell
                  title="Cities"
                  description="City roll-up when present."
                  icon={Globe2}
                  footnote="Volume by city label. Useful when one feed spans multiple municipalities; pair with community charts for hierarchy checks."
                >
                  <div className="h-52 w-full min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={a.cities} margin={{ top: 4, right: 8, left: 4, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} angle={-18} textAnchor="end" height={48} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
                        <RechartsTooltip {...CHART_TOOLTIP_BAR} formatter={(v: number) => [v, "Listings"]} />
                        <Bar dataKey="count" fill="hsl(152 45% 42%)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </ChartShell>

                <ChartShell
                  title="Completion status"
                  description="Off-plan vs ready inventory signals."
                  icon={Layers}
                  footnote="Uses completion-status text from the feed (off-plan, ready, etc.). Strong skew can indicate project pipeline vs resale-heavy inventory."
                >
                  <div className="h-52 w-full min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart layout="vertical" data={a.completionStatus} margin={{ top: 4, right: 8, left: 4, bottom: 4 }}>
                        <XAxis type="number" allowDecimals={false} />
                        <YAxis type="category" dataKey="name" width={88} tick={{ fontSize: 9 }} />
                        <RechartsTooltip {...CHART_TOOLTIP_BAR} formatter={(v: number) => [v, "Listings"]} />
                        <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </ChartShell>

                <ChartShell
                  title="Parking spaces"
                  description="Parking count distribution when mapped."
                  icon={ParkingCircle}
                  footnote="Shows how many parking slots are attached to each listing bucket. Zero or missing may mean the field is absent rather than true zero parking."
                >
                  <div className="h-52 w-full min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={a.parking} margin={{ top: 4, right: 8, left: 4, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis allowDecimals={false} width={28} />
                        <RechartsTooltip {...CHART_TOOLTIP_BAR} formatter={(v: number) => [v, "Listings"]} />
                        <Bar dataKey="count" fill="hsl(280 35% 55%)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </ChartShell>

                <ChartShell
                  title="Furnished"
                  description="Furnishing labels in the feed — furnished, unfurnished, semi, etc."
                  icon={Sofa}
                  footnote="Raw furnishing labels from the XML. Inconsistent wording can split one concept across multiple bars — normalization happens in mapping, not here."
                >
                  <div className="h-52 w-full min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart layout="vertical" data={a.furnished} margin={{ top: 4, right: 8, left: 4, bottom: 4 }}>
                        <XAxis type="number" allowDecimals={false} />
                        <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 9 }} />
                        <RechartsTooltip {...CHART_TOOLTIP_BAR} formatter={(v: number) => [v, "Listings"]} />
                        <Bar dataKey="count" fill="hsl(38 85% 52%)" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </ChartShell>
              </div>

              {showAgentWorkload && a.agentsByVolume.length > 0 ? (
                <ChartShell
                  title="Agents by listing volume"
                  description="Relative workload inside this agency — who carries the most rows in the feed."
                  icon={Users}
                  footnote="Counts listings per agent name when present. Useful for internal workload; not all feeds attribute every row to an agent."
                >
                  <div className="h-[min(28rem,60vh)] w-full min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        layout="vertical"
                        data={a.agentsByVolume}
                        margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
                      >
                        <XAxis type="number" allowDecimals={false} />
                        <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10 }} interval={0} />
                        <RechartsTooltip {...CHART_TOOLTIP_BAR} formatter={(v: number) => [v, "Listings"]} />
                        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                          {a.agentsByVolume.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </ChartShell>
              ) : null}
            </TabsContent>

            <TabsContent value="quality" className="mt-5 space-y-6 outline-none">
              <Card className="dashboard-card border-primary/12 shadow-none">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-heading">Feed quality &amp; completeness</CardTitle>
                  <CardDescription>
                    These charts do not judge “good” or “bad” listings — they show how completely key fields are populated
                    so you can prioritize mapping work and spot blind spots before publishing.
                  </CardDescription>
                  <p className="text-sm pt-2">
                    <Link
                      to="/field-quality"
                      className="text-primary-text font-medium hover:underline"
                    >
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
                  footnote="Each bar is the percentage of rows in the current scope with that field populated. Low bars highlight gaps (e.g. missing coordinates) that affect search, maps, and trust — not average quality of the homes."
                >
                  <div className="h-[min(22rem,55vh)] w-full min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        layout="vertical"
                        data={coverageChartData}
                        margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" horizontal={false} />
                        <XAxis
                          type="number"
                          domain={[0, 100]}
                          tickFormatter={(v) => `${v}%`}
                          tick={{ fontSize: 10 }}
                        />
                        <YAxis type="category" dataKey="label" width={108} tick={{ fontSize: 10 }} interval={0} />
                        <RechartsTooltip
                          {...CHART_TOOLTIP_BAR}
                          formatter={(v: number, _n: string, item: { payload?: { filled?: number } }) => {
                            const f = item?.payload?.filled;
                            return [`${v}%${f != null ? ` · ${f} listings` : ""}`, "Coverage"];
                          }}
                        />
                        <Bar dataKey="pct" name="Coverage %" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </ChartShell>

                <ChartShell
                  title="Photo depth"
                  description="How many listings fall into each photo-count bucket."
                  icon={ImageIcon}
                  footnote="Buckets group image array lengths. Heavy “0 photos” suggests media not mapped or stripped; “6+” often indicates rich marketing packages. Compare with your portal requirements."
                >
                  <div className="h-[min(22rem,55vh)] w-full min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={a.imageBuckets} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={36} />
                        <RechartsTooltip {...CHART_TOOLTIP_BAR} formatter={(v: number) => [v, "Listings"]} />
                        <Bar dataKey="count" fill="hsl(var(--sb-amber))" radius={[6, 6, 0, 0]} name="Listings" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
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
              <h2 className="text-xl md:text-2xl font-extrabold font-heading text-foreground tracking-tight">
                Property intelligence
              </h2>
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
      <Kpi
        label="Price on application"
        value={a.priceOnApplicationCount.toLocaleString()}
        hint="Listed without a price"
      />
      <Kpi
        label="Median sale price per area"
        value={a.pricePerArea ? formatAnalyticsMoney(a.pricePerArea.median) : "—"}
        hint={a.pricePerArea ? `Sale listings, ${a.pricePerArea.label}` : "Needs price and area"}
      />
      <Kpi
        label="Sale / rent"
        value={`${a.purpose.sale} / ${a.purpose.rent}`}
        hint={`${a.purpose.unknown} unknown purpose`}
      />
      <Kpi
        label="Unique communities"
        value={a.uniqueCommunities.toLocaleString()}
        hint="Distinct community names in feed"
      />
      <Kpi
        label="With photos"
        value={photos ? `${photos.pct}%` : "—"}
        hint={photos ? `${photos.filled} listings` : "Coverage from feed"}
      />
      <Kpi
        label="Geo-tagged"
        value={geo ? `${geo.pct}%` : "—"}
        hint={geo ? `${geo.filled} with lat/lng` : "Map coordinates"}
      />
    </div>
  );
}
