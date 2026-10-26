import { Button } from "@/components/ui/button";
import { formatPriceCompact } from "@/lib/displayPrice";
import { cn } from "@/lib/utils";
import type { Listing } from "@/lib/types";
import { Focus, Loader2 } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

const LazyGeoPointsMap = lazy(async () => {
  const mod = await import("@/components/GeoPointsMap");
  return { default: mod.GeoPointsMap };
});

function previewPriceLine(l: Listing) {
  if (!Number.isFinite(l.price) || l.price <= 0) return "POA";
  return `${l.currency || ""} ${formatPriceCompact(l.price)}`.trim();
}

type Props = {
  listings: Listing[];
  heightClassName?: string;
};

/**
 * Map tab on `/listings` — matches `/listings/map` performance (canvas CircleMarkers, pin cap, lazy chunk)
 * without applying CSS zoom to the map (which makes Leaflet lag).
 */
export function ListingsPageMapPanel({ listings, heightClassName = "h-[min(70vh,560px)]" }: Props) {
  const navigate = useNavigate();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const [fitBoundsSignal, setFitBoundsSignal] = useState(0);
  const skipRefitOnFirstListings = useRef(true);

  const hoveredListing = useMemo(
    () => (hoveredId ? (listings.find((l) => l.id === hoveredId) ?? null) : null),
    [hoveredId, listings],
  );

  /** When filters/sort change the memoized `listings` array, refit like the old ListingsMap FitBounds. */
  useEffect(() => {
    if (listings.length === 0) return;
    if (skipRefitOnFirstListings.current) {
      skipRefitOnFirstListings.current = false;
      return;
    }
    setFitBoundsSignal((x) => x + 1);
  }, [listings]);

  return (
    <div className="relative w-full">
      <Suspense
        fallback={
          <div
            className={cn(
              "flex flex-col items-center justify-center gap-3 rounded-b-2xl border-x border-b border-border bg-muted/25 text-muted-foreground",
              heightClassName,
            )}
          >
            <Loader2 className="h-7 w-7 animate-spin text-primary-text" aria-hidden />
            <p className="text-sm">Loading map…</p>
          </div>
        }
      >
        <LazyGeoPointsMap
          listings={listings}
          heightClassName={heightClassName}
          embedded
          defaultBaseLayer="satellite"
          onHoverListingIdChange={setHoveredId}
          onHoverListingPosChange={setHoverPos}
          onSelectListingId={(id) => navigate(`/listing/${id}`)}
          fitBoundsSignal={fitBoundsSignal}
        />
      </Suspense>

      <div className="pointer-events-none absolute left-3 top-3 z-[500] flex flex-wrap items-center gap-2 [&_button]:pointer-events-auto">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-9 rounded-xl shadow-sm"
          onClick={() => setFitBoundsSignal((x) => x + 1)}
        >
          <Focus className="mr-2 h-4 w-4" aria-hidden />
          Fit to results
        </Button>
      </div>

      {hoveredListing && hoverPos ? (
        <div
          className="pointer-events-auto absolute z-[500] max-w-[min(calc(100vw-3rem),280px)] rounded-xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur-sm"
          style={{
            left: Math.max(12, hoverPos.x + 14),
            top: Math.max(12, hoverPos.y),
            transform: "translateY(-50%)",
          }}
        >
          <div className="line-clamp-2 text-sm font-semibold text-foreground">
            {hoveredListing.title || "Untitled"}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{previewPriceLine(hoveredListing)}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" className="h-8 rounded-lg" asChild>
              <Link to={`/listing/${hoveredListing.id}`}>View listing</Link>
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
