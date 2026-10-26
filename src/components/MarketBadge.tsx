import { Globe2 } from "lucide-react";
import { SERIES } from "@/components/charts/ChartKit";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MARKETS, marketCodeOf, type MarketCode } from "@/lib/markets";
import type { MarketFilter } from "@/providers/dataContext";
import { useAppData } from "@/providers/useAppData";
import { cn } from "@/lib/utils";

/** Fixed identity colour per market (never by rank), so a market looks the same on every page. */
const MARKET_COLOR: Record<MarketCode, string> = { AE: SERIES[0], SG: SERIES[1], MY: SERIES[2], PK: SERIES[3] };

/** Small market tag: colour dot + code, full name and currency on hover. */
export function MarketBadge({ code, detected = false, withName = false, className }: { code: string | null | undefined; detected?: boolean; withName?: boolean; className?: string }) {
  const c = marketCodeOf(code);
  if (!c) return null;
  const m = MARKETS[c];
  return (
    <span
      className={cn("inline-flex shrink-0 items-center gap-1 rounded-md border bg-background px-1.5 py-0.5 text-[10px] font-semibold leading-none text-foreground", className)}
      title={`${m.name} · ${m.currency}${detected ? " (detected from the feed)" : ""}`}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: MARKET_COLOR[c] }} aria-hidden />
      {withName ? m.name : c}
      {detected && <span className="font-normal text-muted-foreground">auto</span>}
    </span>
  );
}

/**
 * Global market filter. "All markets" mixes every country; picking one narrows the source list
 * and every page's data to that market.
 */
export function MarketSwitcher({ className }: { className?: string }) {
  const { market, setMarket, marketOptions } = useAppData();
  if (marketOptions.length < 2 && market === "all") return null;
  return (
    <Select value={market} onValueChange={(v) => setMarket(v as MarketFilter)}>
      <SelectTrigger aria-label="Market" className={cn("h-9 gap-1.5 rounded-full border-border bg-background text-xs", className)}>
        <Globe2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <SelectValue>{market === "all" ? "All markets" : MARKETS[market].name}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All markets (mixed)</SelectItem>
        <SelectSeparator />
        {marketOptions.map((o) => (
          <SelectItem key={o.market.code} value={o.market.code}>
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: MARKET_COLOR[o.market.code] }} aria-hidden />
              {o.market.name}
              <span className="text-muted-foreground">
                {o.market.currency} · {o.sources} source{o.sources === 1 ? "" : "s"} · {o.listings.toLocaleString()}
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
