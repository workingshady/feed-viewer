import { MarketSwitch, useMarketScope } from "@/components/analytics/MarketScope";
import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartCard, Columns, EmptyChart, HBars, SERIES } from "@/components/charts/ChartKit";
import { completionGroup, concentration, freshness, grossYieldByCommunity, ppsfBy, ppsfByBeds, ppsfByCommunity, quantile, type Concentration } from "@/lib/marketAnalysis";
import type { Listing } from "@/lib/types";
import { cn } from "@/lib/utils";

const pct = (n: number, d = 1) => `${n.toFixed(d)}%`;
const LEVEL_TEXT: Record<Concentration["level"], string> = { low: "spread out", moderate: "moderately concentrated", high: "highly concentrated" };

/**
 * Market analysis of the listings in scope: price per sq ft, gross asking yield, freshness and
 * concentration. Every listing is used; groups with too few listings are left out, not guessed.
 */
export function MarketAnalysis({ listings: allListings, title = "Market analysis" }: { listings: Listing[]; title?: string }) {
  const scope = useMarketScope(allListings);
  const listings = scope.scoped;
  const cur = scope.market.currency;
  const aed = (n: number) => `${cur} ${Math.round(n).toLocaleString()}`;
  const a = useMemo(() => {
    const byCommunity = ppsfByCommunity(listings);
    const yields = grossYieldByCommunity(listings);
    const allPpsf = ppsfBy(listings, () => "all", 1)[0] ?? null;
    const stage = ppsfBy(listings, completionGroup, 5).sort((x, y) => x.name.localeCompare(y.name));
    const fresh = freshness(listings);
    const agents = concentration(listings, (l) => l.agent?.name ?? "");
    const communities = concentration(listings, (l) => l.community ?? "");
    return {
      byCommunity,
      yields,
      allPpsf,
      beds: ppsfByBeds(listings),
      stage,
      fresh,
      agents,
      communities,
      medianYield: yields.length ? quantile(yields.map((y) => y.yieldPct).sort((x, y) => x - y), 0.5) : null,
    };
  }, [listings]);

  const offplan = a.stage.find((s) => s.name === "Off-plan");
  const ready = a.stage.find((s) => s.name === "Ready");
  const premium = offplan && ready ? (offplan.median / ready.median - 1) * 100 : null;
  const recent = a.fresh.buckets.slice(0, 2).reduce((s, b) => s + b.count, 0);
  const dated = listings.length - a.fresh.unknown;

  const tiles = [
    { label: "median sale price / sq ft", value: a.allPpsf ? aed(a.allPpsf.median) : "–", hint: a.allPpsf ? `IQR ${aed(a.allPpsf.p25)}–${Math.round(a.allPpsf.p75).toLocaleString()} · ${a.allPpsf.n.toLocaleString()} sales` : "needs sale price and size" },
    { label: "median gross asking yield", value: a.medianYield == null ? "–" : pct(a.medianYield), hint: `${a.yields.length} communities with like-for-like rent and sale` },
    { label: "updated in last 30 days", value: dated ? pct((recent / dated) * 100, 0) : "–", hint: a.fresh.medianDays == null ? "no update dates" : `median age ${Math.round(a.fresh.medianDays)} days` },
    { label: "off-plan premium / sq ft", value: premium == null ? "–" : `${premium > 0 ? "+" : ""}${pct(premium)}`, hint: premium == null ? "needs both off-plan and ready sales" : `off-plan ${aed(offplan!.median)} vs ready ${aed(ready!.median)}` },
    { label: "top 5 agents' share", value: pct(a.agents.top5Share, 0), hint: `${a.agents.groups} agents · ${LEVEL_TEXT[a.agents.level]}` },
    { label: "top 5 communities' share", value: pct(a.communities.top5Share, 0), hint: `${a.communities.groups} communities · HHI ${Math.round(a.communities.hhi).toLocaleString()}` },
  ];

  const findings: string[] = [];
  if (a.byCommunity.length >= 2) {
    const hi = a.byCommunity[0];
    const lo = a.byCommunity[a.byCommunity.length - 1];
    findings.push(`${hi.name} is the priciest community at ${aed(hi.median)}/sq ft, ${(hi.median / lo.median).toFixed(1)}× ${lo.name} (${aed(lo.median)}).`);
  }
  if (a.yields.length) findings.push(`Highest gross asking yield: ${a.yields[0].community} at ${pct(a.yields[0].yieldPct)} (${a.yields[0].saleN} sales vs ${a.yields[0].rentN} rentals compared).`);
  if (a.fresh.stalePct > 30) findings.push(`${pct(a.fresh.stalePct, 0)} of listings have not been updated in 6 months; they may be sold or let already.`);
  if (a.agents.top1 && a.agents.top1.share > 15) findings.push(`${a.agents.top1.name} alone holds ${pct(a.agents.top1.share, 0)} of listings.`);
  if (premium != null && Math.abs(premium) >= 5) findings.push(`Off-plan asks ${premium > 0 ? "a premium" : "a discount"} of ${pct(Math.abs(premium))} per sq ft over ready property.`);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm">{title}{scope.markets.length > 1 ? ` · ${scope.market.name}` : ""}</CardTitle>
            <MarketSwitch scope={scope} />
          </div>
          <CardDescription className="text-xs">
            Based on all {listings.length.toLocaleString()} listings in scope and their <strong>asking</strong> prices (not registered transactions). Groups with fewer than 5 listings, or 3 per side for yields, are left out
            rather than estimated.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {tiles.map((t) => (
              <div key={t.label} className="rounded-lg border bg-card px-3 py-2.5">
                <div className="font-mono text-lg font-semibold tabular-nums">{t.value}</div>
                <div className="text-[11px] font-medium">{t.label}</div>
                <div className="truncate text-[11px] text-muted-foreground" title={t.hint}>
                  {t.hint}
                </div>
              </div>
            ))}
          </div>
          {findings.length > 0 && (
            <ul className="space-y-1 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
              {findings.map((f) => (
                <li key={f}>• {f}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Sale price per sq ft by community"
          description={`Median asking ${cur} per sq ft (sales with a size). Hover for sample size; the table shows the interquartile range.`}
          table={{ columns: ["Community", `Median ${cur}/sqft`, "P25", "P75", "Listings"], rows: a.byCommunity.map((g) => [g.name, Math.round(g.median), Math.round(g.p25), Math.round(g.p75), g.n]) }}
        >
          {a.byCommunity.length ? <HBars data={a.byCommunity.map((g) => ({ community: `${g.name} (${g.n})`, median: Math.round(g.median) }))} labelKey="community" series={[{ key: "median", label: `${cur} / sq ft`, color: SERIES[0] }]} valueFormat={(n) => n.toLocaleString()} limit={15} /> : <EmptyChart text="Not enough sales with a size" />}
        </ChartCard>
        <ChartCard
          title="Gross asking yield by community"
          description="Median annual rent ÷ median sale price for the same community, type and bedrooms (rents without a period read in the market's usual period). Gross: before service charges and fees (net is typically 1.5–2.5 points lower)."
          table={{ columns: ["Community", "Gross yield %", "Sale listings", "Rent listings", "Segments"], rows: a.yields.map((y) => [y.community, y.yieldPct.toFixed(2), y.saleN, y.rentN, y.segments]) }}
        >
          {a.yields.length ? <HBars data={a.yields.map((y) => ({ community: y.community, yield: Math.round(y.yieldPct * 10) / 10 }))} labelKey="community" series={[{ key: "yield", label: "Gross yield %", color: SERIES[2] }]} valueFormat={(n) => `${n.toFixed(1)}%`} limit={15} /> : <EmptyChart text="Needs both sale and rent listings in the same communities" />}
        </ChartCard>
        <ChartCard
          title="Sale price per sq ft by bedrooms"
          description="Smaller units usually cost more per sq ft; a flat or inverted curve hints at size errors."
          table={{ columns: ["Bedrooms", `Median ${cur}/sqft`, "Listings"], rows: a.beds.map((g) => [g.name, Math.round(g.median), g.n]) }}
        >
          {a.beds.length ? <Columns data={a.beds.map((g) => ({ beds: g.name, median: Math.round(g.median) }))} xKey="beds" series={[{ key: "median", label: `${cur} / sq ft`, color: SERIES[0] }]} valueFormat={(n) => n.toLocaleString()} /> : <EmptyChart />}
        </ChartCard>
        <ChartCard
          title="Listing freshness"
          description={`Days since each listing was last updated${a.fresh.unknown ? ` (${a.fresh.unknown.toLocaleString()} without a date)` : ""}. Old listings are often already sold or let.`}
          table={{ columns: ["Last updated", "Listings"], rows: a.fresh.buckets.map((b) => [b.label, b.count]) }}
        >
          {dated ? <Columns data={a.fresh.buckets} xKey="label" series={[{ key: "count", label: "Listings", color: SERIES[0] }]} colorFor={(r) => (r.label.includes("6–12") || r.label.includes("year") ? SERIES[1] : SERIES[0])} /> : <EmptyChart text="No update dates in this feed" />}
        </ChartCard>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ConcentrationCard title="Agent concentration" c={a.agents} what="agents" />
        <ConcentrationCard title="Community concentration" c={a.communities} what="communities" />
      </div>
    </div>
  );
}

function ConcentrationCard({ title, c, what }: { title: string; c: Concentration; what: string }) {
  const hhiPos = Math.min(100, (c.hhi / 4000) * 100);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
        <CardDescription className="text-xs">
          Herfindahl–Hirschman index of listing shares: under 1,500 is spread out, over 2,500 is highly concentrated. Inventory behaves like {c.effective.toFixed(0)} equal-sized {what}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative h-2 rounded-full bg-gradient-to-r from-muted via-muted-foreground/30 to-muted-foreground/60">
          <div className="absolute -top-1 h-4 w-1 rounded bg-foreground" style={{ left: `calc(${hhiPos}% - 2px)` }} title={`HHI ${Math.round(c.hhi)}`} />
          <div className="absolute top-0 h-2 w-px bg-card" style={{ left: "37.5%" }} />
          <div className="absolute top-0 h-2 w-px bg-card" style={{ left: "62.5%" }} />
        </div>
        <div className="flex justify-between text-[11px] text-muted-foreground">
          <span>0</span>
          <span>1,500</span>
          <span>2,500</span>
          <span>4,000+</span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <div className={cn("font-mono text-base tabular-nums", c.level === "high" && "text-warning")}>{Math.round(c.hhi).toLocaleString()}</div>
            <div className="text-muted-foreground">HHI · {LEVEL_TEXT[c.level]}</div>
          </div>
          <div>
            <div className="font-mono text-base tabular-nums">{pct(c.top5Share, 0)}</div>
            <div className="text-muted-foreground">held by the top 5</div>
          </div>
          <div className="min-w-0">
            <div className="font-mono text-base tabular-nums">{c.top1 ? pct(c.top1.share, 0) : "–"}</div>
            <div className="truncate text-muted-foreground" title={c.top1?.name}>
              largest: {c.top1?.name ?? "–"}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
