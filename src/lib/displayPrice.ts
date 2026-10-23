import type { Listing } from "@/lib/types";

/** Short form for cards and hero overlays (e.g. 1.25M, 850K). */
export function formatPriceCompact(p: number): string {
  if (!Number.isFinite(p) || p <= 0) return "POA";
  if (p >= 1_000_000_000) return `${(p / 1_000_000_000).toFixed(2)}B`;
  if (p >= 1_000_000) return `${(p / 1_000_000).toFixed(2)}M`;
  if (p >= 100_000) return `${Math.round(p / 1000)}K`;
  return p.toLocaleString();
}

/** Full precision for contracts and detail banners. */
export function formatPriceFull(p: number, locale?: string): string {
  if (!Number.isFinite(p) || p <= 0) return "POA";
  return p.toLocaleString(locale);
}

export function listingPriceEyebrow(purpose: Listing["purpose"]): string {
  if (purpose === "rent") return "Annual Rent";
  return "Asking Price";
}
