import { importListingDiffKey, listingChangedKeysFull } from "@/lib/importAnalysis";
import type { Listing } from "@/lib/types";

export type ChangedListing = { before: Listing; after: Listing; keys: (keyof Listing)[] };

/** Same property under a new reference number (often re-posted to look fresh). */
export type RelistedListing = ChangedListing & { score: number; signals: string[] };

export type VersionDiff = {
  added: Listing[];
  removed: Listing[];
  changed: ChangedListing[];
  /** Matched across a reference change; not counted as added or removed. */
  relisted: RelistedListing[];
  unchangedCount: number;
  /** Keys that appear more than once within `next` (last occurrence wins). */
  duplicates: string[];
};

/** References compared without case or surrounding/inner whitespace differences. */
const matchKey = (l: Listing) => importListingDiffKey(l).replace(/\s+/g, "").toLowerCase();

function byKey(listings: Listing[], dupes?: Set<string>): Map<string, Listing> {
  const map = new Map<string, Listing>();
  for (const l of listings) {
    const k = matchKey(l);
    if (dupes && map.has(k)) dupes.add(importListingDiffKey(l));
    map.set(k, l);
  }
  return map;
}

const words = (s: string) => new Set((s || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2));
function jaccard(a: string, b: string): number {
  const x = words(a);
  const y = words(b);
  if (!x.size || !y.size) return 0;
  let inter = 0;
  for (const w of x) if (y.has(w)) inter++;
  return inter / (x.size + y.size - inter);
}
const near = (a: number, b: number, tolerance: number) => a > 0 && b > 0 && Math.abs(a - b) / Math.max(a, b) <= tolerance;
const firstPhoto = (l: Listing) => (l.images?.[0] ?? "").replace(/[?#].*$/, "");
const phoneDigits = (l: Listing) => (l.agent?.phone ?? "").replace(/\D+/g, "");

/**
 * How likely `a` and `b` are the same property. Requires the same purpose, type and community,
 * then scores supporting evidence. 0 when they can't be the same.
 */
export function relistScore(a: Listing, b: Listing): { score: number; signals: string[] } {
  if (a.purpose !== b.purpose || a.propertyType !== b.propertyType) return { score: 0, signals: [] };
  if ((a.community || "").trim().toLowerCase() !== (b.community || "").trim().toLowerCase()) return { score: 0, signals: [] };
  if ((a.beds ?? -1) !== (b.beds ?? -1)) return { score: 0, signals: [] };
  const signals: string[] = [];
  let score = 0;
  if (firstPhoto(a) && firstPhoto(a) === firstPhoto(b)) {
    score += 3;
    signals.push("same main photo");
  }
  if (near(a.area, b.area, 0.02)) {
    score += 2;
    signals.push("same size");
  }
  if (near(a.price, b.price, 0.1)) {
    score += 1;
    signals.push("similar price");
  }
  if (phoneDigits(a) && phoneDigits(a) === phoneDigits(b)) {
    score += 1;
    signals.push("same agent");
  }
  if (jaccard(a.title, b.title) >= 0.6) {
    score += 1;
    signals.push("similar title");
  }
  if (a.latitude != null && b.latitude != null && Math.abs(a.latitude - b.latitude) < 1e-4 && Math.abs((a.longitude ?? 0) - (b.longitude ?? 0)) < 1e-4) {
    score += 1;
    signals.push("same map point");
  }
  return { score, signals };
}

/** Pairs need the photo or size match plus at least one more signal. */
const RELIST_MIN_SCORE = 4;

/** Listing-level diff between two versions of the same source, matched by id/reference. */
export function diffListings(prev: Listing[], next: Listing[], opts: { detectRelists?: boolean } = {}): VersionDiff {
  const dupes = new Set<string>();
  const before = byKey(prev);
  const after = byKey(next, dupes);
  const diff: VersionDiff = { added: [], removed: [], changed: [], relisted: [], unchangedCount: 0, duplicates: [...dupes] };
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

  // Second pass: pair removed and added listings that look like the same property.
  if (opts.detectRelists !== false && diff.added.length && diff.removed.length && diff.added.length * diff.removed.length <= 4_000_000) {
    const candidates: { r: number; a: number; score: number; signals: string[] }[] = [];
    // Bucket by purpose/type/community/beds so the comparison stays near-linear.
    const bucket = (l: Listing) => `${l.purpose}|${l.propertyType}|${(l.community || "").trim().toLowerCase()}|${l.beds ?? -1}`;
    const removedBy = new Map<string, number[]>();
    diff.removed.forEach((l, i) => removedBy.set(bucket(l), [...(removedBy.get(bucket(l)) ?? []), i]));
    diff.added.forEach((l, a) => {
      for (const r of removedBy.get(bucket(l)) ?? []) {
        const { score, signals } = relistScore(diff.removed[r], l);
        if (score >= RELIST_MIN_SCORE) candidates.push({ r, a, score, signals });
      }
    });
    candidates.sort((x, y) => y.score - x.score);
    const usedR = new Set<number>();
    const usedA = new Set<number>();
    for (const c of candidates) {
      if (usedR.has(c.r) || usedA.has(c.a)) continue;
      usedR.add(c.r);
      usedA.add(c.a);
      const b = diff.removed[c.r];
      const a = diff.added[c.a];
      diff.relisted.push({ before: b, after: a, keys: listingChangedKeysFull(b, a), score: c.score, signals: c.signals });
    }
    diff.removed = diff.removed.filter((_, i) => !usedR.has(i));
    diff.added = diff.added.filter((_, i) => !usedA.has(i));
  }
  return diff;
}

export const diffCounts = (d: VersionDiff) => ({
  added: d.added.length,
  removed: d.removed.length,
  changed: d.changed.length,
});
