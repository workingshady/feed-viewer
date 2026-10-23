import { importListingDiffKey, listingChangedKeysFull } from "@/lib/importAnalysis";
import type { Listing } from "@/lib/types";

export type ChangedListing = { before: Listing; after: Listing; keys: (keyof Listing)[] };

export type VersionDiff = {
  added: Listing[];
  removed: Listing[];
  changed: ChangedListing[];
  unchangedCount: number;
  /** Keys that appear more than once within `next` (last occurrence wins). */
  duplicates: string[];
};

function byKey(listings: Listing[], dupes?: Set<string>): Map<string, Listing> {
  const map = new Map<string, Listing>();
  for (const l of listings) {
    const k = importListingDiffKey(l);
    if (dupes && map.has(k)) dupes.add(k);
    map.set(k, l);
  }
  return map;
}

/** Listing-level diff between two versions of the same source, matched by id/reference. */
export function diffListings(prev: Listing[], next: Listing[]): VersionDiff {
  const dupes = new Set<string>();
  const before = byKey(prev);
  const after = byKey(next, dupes);
  const diff: VersionDiff = { added: [], removed: [], changed: [], unchangedCount: 0, duplicates: [...dupes] };
  for (const [k, l] of after) {
    const old = before.get(k);
    if (!old) {
      diff.added.push(l);
      continue;
    }
    const keys = listingChangedKeysFull(old, l);
    if (keys.length) diff.changed.push({ before: old, after: l, keys });
    else diff.unchangedCount++;
  }
  for (const [k, l] of before) if (!after.has(k)) diff.removed.push(l);
  return diff;
}

export const diffCounts = (d: VersionDiff) => ({
  added: d.added.length,
  removed: d.removed.length,
  changed: d.changed.length,
});
