import { CATEGORY_LABEL, type ChangeCategory } from "@/lib/listingChanges";
import type { ChangedListing, VersionDiff } from "@/lib/versionDiff";
import type { Listing } from "@/lib/types";

export type CategoryCount = { category: ChangeCategory; label: string; listings: number };

/** Listings with at least one real change in each category, busiest first. */
export function categoryCounts(diff: VersionDiff): CategoryCount[] {
  const m = new Map<ChangeCategory, number>();
  for (const c of [...diff.changed, ...diff.relisted]) {
    for (const cat of new Set(c.changes.material.map((x) => x.category))) m.set(cat, (m.get(cat) ?? 0) + 1);
  }
  return [...m.entries()].map(([category, listings]) => ({ category, label: CATEGORY_LABEL[category], listings })).sort((a, b) => b.listings - a.listings);
}

export type PriceMoveRow = { listing: Listing; before: number; after: number; pct: number; relisted: boolean };

export function priceMoveRows(diff: VersionDiff): PriceMoveRow[] {
  const rows = (list: ChangedListing[], relisted: boolean) =>
    list.filter((c) => c.changes.price).map((c) => ({ listing: c.after, before: c.changes.price!.before, after: c.changes.price!.after, pct: c.changes.price!.pct, relisted }));
  return [...rows(diff.changed, false), ...rows(diff.relisted, true)];
}

const BANDS: [number, number, string][] = [
  [-Infinity, -20, "≤ −20%"],
  [-20, -10, "−20 to −10%"],
  [-10, -5, "−10 to −5%"],
  [-5, 0, "−5 to 0%"],
  [0, 5, "0 to +5%"],
  [5, 10, "+5 to +10%"],
  [10, 20, "+10 to +20%"],
  [20, Infinity, "≥ +20%"],
];

/** How big the price moves were, in % bands from deepest cut to steepest rise. */
export function priceChangeBands(rows: PriceMoveRow[]) {
  return BANDS.map(([lo, hi, label]) => ({ label, count: rows.filter((r) => r.pct > lo && r.pct <= hi).length }));
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Fields that were filled in or dropped between versions, with both directions counted. */
export function completenessByField(diff: VersionDiff) {
  const m = new Map<string, { field: keyof Listing; filled: number; cleared: number }>();
  for (const c of [...diff.changed, ...diff.completenessOnly, ...diff.relisted]) {
    for (const f of c.changes.completeness) {
      const row = m.get(f.key) ?? { field: f.key, filled: 0, cleared: 0 };
      if (f.kind === "filled") row.filled++;
      else row.cleared++;
      m.set(f.key, row);
    }
  }
  return [...m.values()].sort((a, b) => b.filled + b.cleared - (a.filled + a.cleared));
}
