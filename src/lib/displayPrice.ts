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
  if (purpose === "rent") return "Rent";
  return "Asking Price";
}

/** Label shown under a rent price; feeds without a period are treated as yearly (UAE convention). */
export const RENT_PERIOD_LABEL: Record<string, string> = {
  yearly: "per year",
  monthly: "per month",
  weekly: "per week",
  daily: "per day",
};

const CURRENCY_CODES: Record<string, string> = {
  "uae dirham": "AED",
  "emirati dirham": "AED",
  dirham: "AED",
  "singapore dollar": "SGD",
  "malaysian ringgit": "MYR",
  "pakistani rupee": "PKR",
  "us dollar": "USD",
  "saudi riyal": "SAR",
  "qatari riyal": "QAR",
};

/** ISO code for a currency given by code or name (older versions stored the name). */
export function currencyCode(value: string | undefined | null): string {
  const v = (value ?? "").trim();
  if (/^[A-Za-z]{3}$/.test(v)) return v.toUpperCase();
  return CURRENCY_CODES[v.toLowerCase()] ?? v;
}
