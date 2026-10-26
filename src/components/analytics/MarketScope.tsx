import { useMemo, useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { marketOf, marketsIn, type Market, type MarketCode } from "@/lib/markets";
import type { Listing } from "@/lib/types";

export type MarketScope<T> = { markets: { market: Market; count: number }[]; market: Market; scoped: T[]; setMarket: (c: MarketCode) => void };

/**
 * Prices in different currencies can't share a chart, so price analytics run on one market at a
 * time: the largest by default, switchable when the workspace mixes markets.
 */
export function useMarketScope<T extends Pick<Listing, "country" | "currency">>(listings: T[]): MarketScope<T> {
  const markets = useMemo(() => marketsIn(listings), [listings]);
  const [picked, setMarket] = useState<MarketCode | null>(null);
  const market = markets.find((m) => m.market.code === picked)?.market ?? markets[0]?.market ?? marketOf({ country: "", currency: "" });
  const scoped = useMemo(() => (markets.length > 1 ? listings.filter((l) => marketOf(l).code === market.code) : listings), [listings, markets.length, market.code]);
  return { markets, market, scoped, setMarket };
}

/** Market picker, shown only when the listings span several markets. */
export function MarketSwitch({ scope, className }: { scope: MarketScope<unknown>; className?: string }) {
  if (scope.markets.length < 2) return null;
  return (
    <ToggleGroup type="single" size="sm" value={scope.market.code} onValueChange={(v) => v && scope.setMarket(v as MarketCode)} aria-label="Market" className={className}>
      {scope.markets.map(({ market, count }) => (
        <ToggleGroupItem key={market.code} value={market.code} className="h-8 gap-1.5 px-3 text-xs" title={`${market.name}: prices in ${market.currency}`}>
          {market.name} <span className="tabular-nums text-muted-foreground">{count.toLocaleString()}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
