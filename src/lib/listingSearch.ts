import type { Listing } from "@/lib/types";

/**
 * Free-text search over the client-side listing set.
 *
 * Search reads eight text fields per listing. Lowercasing them inside the filter callback meant
 * allocating eight strings per listing on every keystroke — `description` among them, the longest
 * field on the record. Folding each listing into a single lowercase haystack once per listing set
 * turns each keystroke into one `includes` per row.
 *
 * Extracted from ListingsPage so the matching semantics are unit-testable: a silent mismatch here
 * shows up as "search returns nothing", which is easy to miss and hard to diagnose in the UI.
 */

/** Fields folded into the haystack, in the order the previous inline filter checked them. */
export function buildListingHaystack(l: Listing): string {
  return [
    l.title,
    l.description,
    l.city,
    l.community,
    l.reference,
    l.id,
    l.propertyName,
    l.agent?.name ?? "",
  ]
    .map((v) => (typeof v === "string" ? v : ""))
    .join(" ")
    .toLowerCase();
}

export function buildListingHaystacks(listings: Listing[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const l of listings) map.set(l.id, buildListingHaystack(l));
  return map;
}

/**
 * True when the listing matches `query`.
 *
 * A listing missing from `haystacks` matches nothing rather than matching everything — an absent
 * entry means the map is out of step with the list, and silently passing rows through would hide
 * that. Callers must rebuild the map from the same array they filter.
 */
export function listingMatchesQuery(
  haystacks: Map<string, string>,
  listing: Listing,
  loweredQuery: string,
): boolean {
  if (!loweredQuery) return true;
  const hay = haystacks.get(listing.id);
  if (hay === undefined) return false;
  return hay.includes(loweredQuery);
}
