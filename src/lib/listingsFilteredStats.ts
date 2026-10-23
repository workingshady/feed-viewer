import type { Listing } from "@/lib/types";

export type FilteredPriceStats = {
  count: number;
  pricedCount: number;
  avg: number | null;
  min: number | null;
  max: number | null;
  /** Representative currency from priced rows (first match). */
  currency: string;
};

/** Aggregates numeric `price` for the current filtered listing set (search + filters). */
export function computeFilteredPriceStats(listings: Listing[]): FilteredPriceStats {
  const count = listings.length;
  const priced = listings.filter((l) => typeof l.price === "number" && Number.isFinite(l.price) && l.price > 0);
  const pricedCount = priced.length;
  const currency = priced[0]?.currency?.trim() || listings[0]?.currency?.trim() || "AED";

  if (pricedCount === 0) {
    return { count, pricedCount: 0, avg: null, min: null, max: null, currency };
  }

  const values = priced.map((l) => l.price);
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    count,
    pricedCount,
    avg: sum / pricedCount,
    min: Math.min(...values),
    max: Math.max(...values),
    currency,
  };
}
