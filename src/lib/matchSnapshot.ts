import type { ListingSnapshot } from "@/lib/matchingApi";
import type { Listing } from "@/lib/types";

/** What gets stored with a verdict, so the review log still reads after listings leave the feed. */
export function snapshotOf(l: Listing): ListingSnapshot {
  return {
    id: l.id,
    agency: l.sourceAgency,
    reference: l.reference || undefined,
    title: (l.title || "").slice(0, 300) || undefined,
    price: l.price > 0 ? l.price : undefined,
    currency: l.currency || undefined,
    image: l.images?.[0]?.slice(0, 1000),
    community: l.community || undefined,
    beds: Number.isFinite(l.beds) ? l.beds : undefined,
    area: l.area > 0 ? Math.round(l.area) : undefined,
    permit: l.permitNumber || undefined,
  };
}
