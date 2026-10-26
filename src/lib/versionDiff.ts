import { listingChangeSet, type ListingChangeSet } from "@/lib/listingChanges";
import { matchListingSets, type Evidence } from "@/lib/propertyMatch";
import type { Listing } from "@/lib/types";

export type ChangedListing = {
  before: Listing;
  after: Listing;
  /** Fields that changed in substance (noise and filled/cleared values excluded). */
  keys: (keyof Listing)[];
  changes: ListingChangeSet;
};

/** Same property under a new reference number (often re-posted to look fresh). */
export type RelistedListing = ChangedListing & { score: number; signals: string[]; evidence: Evidence[] };

/** Plausibly the same property under a new reference, but not certain enough to merge. */
export type PossibleRelist = { before: Listing; after: Listing; score: number; evidence: Evidence[] };

export type VersionDiff = {
  added: Listing[];
  removed: Listing[];
  /** Matched listings with at least one real change. */
  changed: ChangedListing[];
  /** Matched across a reference change; not counted as added or removed. */
  relisted: RelistedListing[];
  /** Listed under added/removed, with a candidate counterpart worth a look. */
  possibleRelists: PossibleRelist[];
  /** Matched listings whose only differences are values filled in or dropped (data completeness). */
  completenessOnly: ChangedListing[];
  unchangedCount: number;
  /** References that appear more than once within `next` (last occurrence wins). */
  duplicates: string[];
};

/** References compared without case, spaces, dashes or underscores ("BH-S-1 " = "bhs1"). */
export const referenceKey = (l: Pick<Listing, "reference">) => (l.reference || "").toLowerCase().replace(/[\s_-]+/g, "");

function byReference(listings: Listing[], dupes?: Set<string>) {
  const map = new Map<string, Listing>();
  const noRef: Listing[] = [];
  for (const l of listings) {
    const k = referenceKey(l);
    if (!k) {
      noRef.push(l);
      continue;
    }
    if (dupes && map.has(k)) dupes.add(l.reference);
    map.set(k, l);
  }
  return { map, noRef };
}

const keysOf = (c: ListingChangeSet) => [...new Set(c.material.map((m) => m.key))];

/**
 * Listing-level diff between two versions of the same source.
 *
 * 1. Listings with the same reference are the same listing; their fields are compared with
 *    `listingChangeSet`, which ignores formatting noise and separates filled/cleared values from
 *    real changes.
 * 2. Listings left over on either side (new reference, or no reference at all) are matched by
 *    property evidence — permit, photos, description, size, layout, location — so a re-posted
 *    property counts as relisted rather than one removal plus one addition.
 */
export function diffListings(prev: Listing[], next: Listing[]): VersionDiff {
  const dupes = new Set<string>();
  const before = byReference(prev);
  const after = byReference(next, dupes);
  const diff: VersionDiff = {
    added: [],
    removed: [],
    changed: [],
    relisted: [],
    possibleRelists: [],
    completenessOnly: [],
    unchangedCount: 0,
    duplicates: [...dupes],
  };

  const leftoverNext: Listing[] = [...after.noRef];
  for (const [k, l] of after.map) {
    const old = before.map.get(k);
    if (!old) {
      leftoverNext.push(l);
      continue;
    }
    const changes = listingChangeSet(old, l);
    const entry = { before: old, after: l, keys: keysOf(changes), changes };
    if (changes.material.length) diff.changed.push(entry);
    else if (changes.completeness.length) {
      diff.completenessOnly.push(entry);
      diff.unchangedCount++;
    } else diff.unchangedCount++;
  }
  const leftoverPrev: Listing[] = [...before.noRef];
  for (const [k, l] of before.map) if (!after.map.has(k)) leftoverPrev.push(l);

  const { matches, possible } = matchListingSets(leftoverPrev, leftoverNext, "versions");
  const matchedPrev = new Set<Listing>();
  const matchedNext = new Set<Listing>();
  for (const m of matches) {
    matchedPrev.add(m.a);
    matchedNext.add(m.b);
    const changes = listingChangeSet(m.a, m.b);
    const keys = keysOf(changes);
    if (referenceKey(m.a) !== referenceKey(m.b)) keys.unshift("reference");
    const entry = { before: m.a, after: m.b, keys, changes };
    if (referenceKey(m.a) && referenceKey(m.b)) {
      diff.relisted.push({ ...entry, score: m.score, evidence: m.evidence, signals: m.evidence.filter((e) => e.weight > 0).map((e) => e.label) });
    } else if (changes.material.length) diff.changed.push(entry);
    else diff.unchangedCount++;
  }
  diff.added = leftoverNext.filter((l) => !matchedNext.has(l));
  diff.removed = leftoverPrev.filter((l) => !matchedPrev.has(l));
  diff.possibleRelists = possible.map((p) => ({ before: p.a, after: p.b, score: p.score, evidence: p.evidence }));
  return diff;
}

/** Headline counts stored on a version. Relisted listings are the same property, so neither added nor removed. */
export const diffCounts = (d: VersionDiff) => ({
  added: d.added.length,
  removed: d.removed.length,
  changed: d.changed.length + d.relisted.length,
});

/** Listings whose price really moved (same listing or relisted). */
export function priceChanges(d: VersionDiff) {
  return [...d.changed, ...d.relisted].filter((c) => c.changes.price);
}
