import type { Listing } from "@/lib/types";
import { annualizedPrice } from "@/lib/feedValidation";

export type PurposePriceStats = { count: number; median: number; min: number; max: number } | null;

function purposeStats(values: number[]): PurposePriceStats {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return { count: s.length, median: s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2, min: s[0], max: s[s.length - 1] };
}

export type FilteredPriceStats = {
  count: number;
  pricedCount: number;
  avg: number | null;
  min: number | null;
  max: number | null;
  /** Representative currency from priced rows (first match). */
  currency: string;
  /** Sale prices and yearly rents summarised separately — mixing them makes averages meaningless. */
  sale: PurposePriceStats;
  rent: PurposePriceStats;
};

/** Aggregates numeric `price` for the current filtered listing set (search + filters). */
export function computeFilteredPriceStats(listings: Listing[]): FilteredPriceStats {
  const count = listings.length;
  const priced = listings.filter((l) => typeof l.price === "number" && Number.isFinite(l.price) && l.price > 0);
  const pricedCount = priced.length;
  const currency = priced[0]?.currency?.trim() || listings[0]?.currency?.trim() || "AED";

  const sale = purposeStats(priced.filter((l) => l.purpose === "sale").map((l) => l.price));
  const rent = purposeStats(priced.filter((l) => l.purpose === "rent").map(annualizedPrice));
  if (pricedCount === 0) {
    return { count, pricedCount: 0, avg: null, min: null, max: null, currency, sale, rent };
  }

  const values = priced.map((l) => l.price);
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    count,
    pricedCount,
    avg: sum / pricedCount,
    // reduce, not Math.min(...values): spreading 100k+ prices can overflow the call stack.
    min: values.reduce((a, b) => (b < a ? b : a), Infinity),
    max: values.reduce((a, b) => (b > a ? b : a), -Infinity),
    currency,
    sale,
    rent,
  };
}
