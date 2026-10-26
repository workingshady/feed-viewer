import { amenityLabel } from "@/lib/amenityCodes";
import { currencyCode } from "@/lib/displayPrice";
import { importListingDiffKey } from "@/lib/importAnalysis";
import type { SourceDTO } from "@/lib/sourcesApi";
import type { Listing } from "@/lib/types";

/**
 * Listing ids are made unique across sources and stable across versions ("<source id>:<reference>"),
 * so favorites, compare selections, links and review verdicts survive switching versions.
 */
export function withSourceIds(source: Pick<SourceDTO, "id" | "name">, listings: Listing[]): Listing[] {
  return listings.map((l) => ({
    ...l,
    id: `${source.id}:${importListingDiffKey(l)}`,
    sourceAgency: source.name,
    currency: currencyCode(l.currency),
    amenities: (l.amenities ?? []).map(amenityLabel),
  }));
}
