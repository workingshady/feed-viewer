import type { Listing } from "@/lib/types";

/**
 * Market registry, mirroring ZibaAi's `enrichment/markets.py`: one entry per country with its
 * coordinate box, currency and the period rents are quoted in. Each listing resolves its own
 * market (listing <country> → feed <metadata> country → currency), so a workspace can mix markets.
 */
export type MarketCode = "AE" | "MY" | "SG" | "PK";

export type Market = {
  code: MarketCode;
  name: string;
  /** [lat min, lat max, lng min, lng max], padded country-level box. */
  bounds: [number, number, number, number];
  currency: string;
  currencyName: string;
  /** How lettings are quoted locally. The Ziba importer reads a rent without a period as yearly. */
  defaultRentPeriod: "yearly" | "monthly";
  /** International dialling code, digits only. */
  phoneCode: string;
  /** Advertising permits (RERA / DLD) are a UAE requirement only. */
  permitsRequired: boolean;
  /** Below these, a price is probably a typo or a monthly figure filed as yearly. */
  minPrice: { sale: number; yearlyRent: number };
  /** Above these, a price is probably a typo (extra zeros) or the wrong currency. */
  maxPrice: { sale: number; yearlyRent: number };
  /** Band edges for price charts in local currency: sale prices and yearly rents. */
  bands: { sale: number[]; yearlyRent: number[] };
};

export const MARKETS: Record<MarketCode, Market> = {
  AE: { code: "AE", name: "United Arab Emirates", bounds: [22.5, 26.5, 51.0, 56.5], currency: "AED", currencyName: "UAE Dirham", defaultRentPeriod: "yearly", phoneCode: "971", permitsRequired: true, minPrice: { sale: 100_000, yearlyRent: 10_000 }, maxPrice: { sale: 500_000_000, yearlyRent: 10_000_000 }, bands: { sale: [500_000, 1_000_000, 2_000_000, 3_000_000, 5_000_000, 10_000_000], yearlyRent: [50_000, 80_000, 120_000, 180_000, 250_000, 400_000] } },
  MY: { code: "MY", name: "Malaysia", bounds: [0.8, 7.5, 98.8, 119.4], currency: "MYR", currencyName: "Malaysian Ringgit", defaultRentPeriod: "monthly", phoneCode: "60", permitsRequired: false, minPrice: { sale: 50_000, yearlyRent: 3_600 }, maxPrice: { sale: 500_000_000, yearlyRent: 10_000_000 }, bands: { sale: [200_000, 400_000, 600_000, 1_000_000, 2_000_000, 5_000_000], yearlyRent: [12_000, 18_000, 24_000, 36_000, 60_000, 120_000] } },
  SG: { code: "SG", name: "Singapore", bounds: [1.13, 1.48, 103.6, 104.1], currency: "SGD", currencyName: "Singapore Dollar", defaultRentPeriod: "monthly", phoneCode: "65", permitsRequired: false, minPrice: { sale: 100_000, yearlyRent: 6_000 }, maxPrice: { sale: 300_000_000, yearlyRent: 6_000_000 }, bands: { sale: [500_000, 1_000_000, 1_500_000, 2_500_000, 4_000_000, 8_000_000], yearlyRent: [24_000, 36_000, 48_000, 72_000, 120_000, 240_000] } },
  PK: { code: "PK", name: "Pakistan", bounds: [23.5, 37.2, 60.8, 77.9], currency: "PKR", currencyName: "Pakistani Rupee", defaultRentPeriod: "monthly", phoneCode: "92", permitsRequired: false, minPrice: { sale: 500_000, yearlyRent: 60_000 }, maxPrice: { sale: 50_000_000_000, yearlyRent: 600_000_000 }, bands: { sale: [5_000_000, 10_000_000, 20_000_000, 40_000_000, 80_000_000, 200_000_000], yearlyRent: [300_000, 600_000, 1_200_000, 2_400_000, 4_800_000, 12_000_000] } },
};

export const DEFAULT_MARKET: MarketCode = "AE";

const BY_NAME: Record<string, MarketCode> = Object.fromEntries(Object.values(MARKETS).map((m) => [m.name.toLowerCase(), m.code]));
const BY_CURRENCY: Record<string, MarketCode> = Object.fromEntries(Object.values(MARKETS).map((m) => [m.currency, m.code]));
const ALIASES: Record<string, MarketCode> = { uae: "AE", emirates: "AE", dubai: "AE", "abu dhabi": "AE", singapore: "SG", malaysia: "MY", pakistan: "PK" };

/** Market code for an ISO code or country name ("SG", "Singapore", "UAE - United Arab Emirates"), or null. */
export function marketCodeOf(value: string | null | undefined): MarketCode | null {
  const s = (value ?? "").trim();
  if (!s) return null;
  const up = s.toUpperCase();
  if (up in MARKETS) return up as MarketCode;
  const low = s.toLowerCase();
  if (BY_NAME[low]) return BY_NAME[low];
  for (const [name, code] of Object.entries({ ...BY_NAME, ...ALIASES })) if (low.includes(name)) return code;
  return null;
}

/** Market code for a currency code or name ("SGD", "Singapore Dollar"), or null. */
export function marketCodeOfCurrency(currency: string | null | undefined): MarketCode | null {
  const s = (currency ?? "").trim();
  if (!s) return null;
  if (BY_CURRENCY[s.toUpperCase()]) return BY_CURRENCY[s.toUpperCase()];
  const low = s.toLowerCase();
  return Object.values(MARKETS).find((m) => m.currencyName.toLowerCase() === low)?.code ?? null;
}

/** A listing's market: its own country, then its currency, then the default. */
export function marketOf(l: Pick<Listing, "country" | "currency">): Market {
  return MARKETS[marketCodeOf(l.country) ?? marketCodeOfCurrency(l.currency) ?? DEFAULT_MARKET];
}

const PERIOD_FACTOR: Record<string, number> = { yearly: 1, monthly: 12, weekly: 52, daily: 365 };

/**
 * Yearly rent for comparisons. A rent without a stated period is read in its market's usual
 * period (monthly in SG, MY and PK) — what the amount means. The Ziba importer would read it as
 * yearly instead, which the feed checks flag separately.
 */
export function annualRent(l: Pick<Listing, "price" | "rentPeriod" | "country" | "currency">): number {
  return l.price * (PERIOD_FACTOR[l.rentPeriod || marketOf(l).defaultRentPeriod] ?? 1);
}

/** True for a priced rental whose period is missing in a market that quotes rents monthly. */
export function rentPeriodMisread(l: Pick<Listing, "purpose" | "price" | "rentPeriod" | "country" | "currency">): boolean {
  return l.purpose === "rent" && l.price > 0 && !l.rentPeriod && marketOf(l).defaultRentPeriod !== "yearly";
}

export function inMarketBounds(m: Market, lat: number, lng: number): boolean {
  const [la0, la1, ln0, ln1] = m.bounds;
  return lat >= la0 && lat <= la1 && lng >= ln0 && lng <= ln1;
}

/** Markets present in a set of listings, largest first. */
export function marketsIn(listings: Pick<Listing, "country" | "currency">[]): { market: Market; count: number }[] {
  const m = new Map<MarketCode, number>();
  for (const l of listings) {
    const c = marketOf(l).code;
    m.set(c, (m.get(c) ?? 0) + 1);
  }
  return [...m.entries()].map(([c, count]) => ({ market: MARKETS[c], count })).sort((a, b) => b.count - a.count);
}

/** The market most listings belong to (the default market when empty). */
export function dominantMarket(listings: Pick<Listing, "country" | "currency">[]): Market {
  return marketsIn(listings)[0]?.market ?? MARKETS[DEFAULT_MARKET];
}
