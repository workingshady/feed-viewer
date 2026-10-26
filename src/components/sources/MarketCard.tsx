import { dominantMarket } from "@/lib/markets";
import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useVersionListings } from "@/hooks/useSources";
import type { VersionDTO } from "@/lib/sourcesApi";
import type { Listing } from "@/lib/types";
import { bedroomMix, priceBands, topValues } from "@/lib/sourceInsights";
import { BarList } from "./BarList";

/** Market breakdown of the live version: price bands by purpose, bedroom mix, top communities. */
export function MarketCard({ live }: { live: VersionDTO }) {
  const { data: listings, isLoading } = useVersionListings(live);
  return <MarketBreakdown listings={listings} isLoading={isLoading} />;
}

/** Price bands by purpose, bedroom mix and top communities for any set of listings. */
export function MarketBreakdown({
  listings,
  isLoading = false,
  title = "Market",
}: {
  listings: Listing[] | undefined;
  isLoading?: boolean;
  title?: string;
}) {
  const [purpose, setPurpose] = useState<"sale" | "rent">("sale");

  const insights = useMemo(() => {
    if (!listings) return null;
    const scoped = listings.filter((l) => l.purpose === purpose);
    return {
      bands: priceBands(listings, purpose),
      beds: bedroomMix(scoped),
      communities: topValues(scoped, (l) => l.community),
      count: scoped.length,
    };
  }, [listings, purpose]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
        <ToggleGroup
          type="single"
          size="sm"
          value={purpose}
          onValueChange={(v) => v && setPurpose(v as "sale" | "rent")}
          aria-label="Purpose"
        >
          <ToggleGroupItem value="sale" className="h-7 px-2.5 text-xs">
            For sale
          </ToggleGroupItem>
          <ToggleGroupItem value="rent" className="h-7 px-2.5 text-xs">
            For rent
          </ToggleGroupItem>
        </ToggleGroup>
      </CardHeader>
      <CardContent>
        {isLoading || !insights ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading listings…
          </p>
        ) : (
          <div className="grid gap-6 md:grid-cols-3">
            <section aria-label="Price bands">
              <h4 className="mb-2 text-xs font-semibold text-foreground">
                {purpose === "sale" ? `Sale price (${dominantMarket(listings).currency})` : `Rent per year (${dominantMarket(listings).currency})`}
              </h4>
              <BarList buckets={insights.bands} emptyText={`No ${purpose === "sale" ? "sale" : "rental"} listings`} />
            </section>
            <section aria-label="Bedrooms">
              <h4 className="mb-2 text-xs font-semibold text-foreground">Bedrooms</h4>
              <BarList buckets={insights.beds} />
            </section>
            <section aria-label="Top communities">
              <h4 className="mb-2 text-xs font-semibold text-foreground">Top communities</h4>
              <BarList buckets={insights.communities} />
            </section>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
