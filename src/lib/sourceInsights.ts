import type { Listing } from "@/lib/types";
import type { VersionDiff } from "@/lib/versionDiff";
import { annualizedPrice } from "@/lib/feedValidation";

export type Bucket = { label: string; count: number };

/** Price bands in AED, tuned separately for sale prices and annual rents. */
const SALE_BANDS = [500_000, 1_000_000, 2_000_000, 3_000_000, 5_000_000, 10_000_000];
const RENT_BANDS = [50_000, 80_000, 120_000, 180_000, 250_000, 400_000];

const compact = (n: number) => (n >= 1_000_000 ? `${n / 1_000_000}M` : `${n / 1_000}K`);

export function priceBands(listings: Listing[], purpose: "sale" | "rent"): Bucket[] {
  const edges = purpose === "sale" ? SALE_BANDS : RENT_BANDS;
  const buckets: Bucket[] = [
    { label: `< ${compact(edges[0])}`, count: 0 },
    ...edges.slice(1).map((e, i) => ({ label: `${compact(edges[i])}–${compact(e)}`, count: 0 })),
    { label: `${compact(edges[edges.length - 1])}+`, count: 0 },
  ];
  for (const l of listings) {
    if (l.purpose !== purpose || !(l.price > 0)) continue;
    // Rents are compared per year whatever period the feed used.
    const price = annualizedPrice(l);
    const i = edges.findIndex((e) => price < e);
    buckets[i === -1 ? buckets.length - 1 : i].count++;
  }
  return buckets;
}

export function bedroomMix(listings: Listing[]): Bucket[] {
  const labels = ["Studio", "1", "2", "3", "4", "5+"];
  const counts = new Array(labels.length).fill(0);
  for (const l of listings) {
    if (l.beds == null || Number.isNaN(l.beds)) continue;
    counts[Math.min(Math.max(Math.round(l.beds), 0), 5)]++;
  }
  return labels.map((label, i) => ({ label, count: counts[i] }));
}

export function topValues(listings: Listing[], pick: (l: Listing) => string | undefined, limit = 8): Bucket[] {
  const map = new Map<string, number>();
  for (const l of listings) {
    const v = pick(l)?.trim();
    if (v) map.set(v, (map.get(v) ?? 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

export type PriceMove = { listing: Listing; before: number; after: number; pct: number };

/** Listings whose price changed between two versions, biggest moves first. */
export function priceMoves(diff: VersionDiff): { up: PriceMove[]; down: PriceMove[]; medianPct: number | null } {
  // Relisted properties count too: a re-post at a new price is still a price move.
  const moves: PriceMove[] = [...diff.changed, ...diff.relisted]
    .filter((c) => c.changes.price)
    .map((c) => ({
      listing: c.after,
      before: c.changes.price!.before,
      after: c.changes.price!.after,
      pct: c.changes.price!.pct / 100,
    }));
  const sorted = [...moves].map((m) => m.pct).sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return {
    up: moves.filter((m) => m.pct > 0).sort((a, b) => b.pct - a.pct),
    down: moves.filter((m) => m.pct < 0).sort((a, b) => a.pct - b.pct),
    medianPct: sorted.length ? (sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2) : null,
  };
}

/** How often each field changed across changed listings, most frequent first. */
export function changedFieldCounts(diff: VersionDiff): Bucket[] {
  const map = new Map<string, number>();
  for (const c of [...diff.changed, ...diff.relisted]) for (const k of c.keys) if (k !== "reference") map.set(String(k), (map.get(String(k)) ?? 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, count }));
}
