import type { Listing } from "@/lib/types";

export type NamedCount = { name: string; count: number };

export type PriceStats = {
  min: number;
  max: number;
  mean: number;
  median: number;
  p25: number;
  p75: number;
};

export type HistogramBin = { label: string; count: number; min: number; max: number };

export type ListingAnalytics = {
  total: number;
  uniqueCommunities: number;
  pricedCount: number;
  missingPriceCount: number;
  priceOnApplicationCount: number;
  currencyMix: NamedCount[];
  price: PriceStats | null;
  purpose: { sale: number; rent: number; unknown: number };
  propertyTypes: NamedCount[];
  communities: NamedCount[];
  cities: NamedCount[];
  beds: NamedCount[];
  baths: NamedCount[];
  area: {
    withArea: number;
    min: number;
    max: number;
    mean: number;
    median: number;
    unitLabel: string;
  } | null;
  pricePerArea: { mean: number; median: number; label: string } | null;
  completionStatus: NamedCount[];
  furnished: NamedCount[];
  parking: NamedCount[];
  scatterPriceArea: { price: number; area: number; purpose: Listing["purpose"] }[];
  agentsByVolume: NamedCount[];
  /** Built-area histogram (same shape as price bands). */
  areaHistogram: HistogramBin[];
  /** Mean asking price per property-type label (priced rows only). */
  /** Share of listings where key fields are populated (feed quality). */
  fieldCoverage: { label: string; filled: number; pct: number }[];
  /** Listing count by photo bucket. */
  imageBuckets: NamedCount[];
  /** Top developer names by volume. */
  developers: NamedCount[];
  /** Sub-community roll-up when present. */
  subCommunities: NamedCount[];
};

function safeNum(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

function sortedNums(arr: number[]): number[] {
  return [...arr].sort((a, b) => a - b);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function bucketMap(
  listings: Listing[],
  getter: (l: Listing) => string,
  limit: number,
): NamedCount[] {
  const map = new Map<string, number>();
  for (const l of listings) {
    const raw = getter(l);
    const key = (raw || "").trim() || "—";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  const entries = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  if (entries.length <= limit) return entries.map(([name, count]) => ({ name, count }));
  const head = entries.slice(0, limit - 1);
  const rest = entries.slice(limit - 1).reduce((s, [, c]) => s + c, 0);
  return [...head.map(([name, count]) => ({ name, count })), { name: "Other", count: rest }];
}

function bucketNumeric(
  listings: Listing[],
  getter: (l: Listing) => number,
  formatLabel: (n: number) => string,
): NamedCount[] {
  const map = new Map<string, number>();
  for (const l of listings) {
    const n = getter(l);
    const key = Number.isFinite(n) && n > 0 ? formatLabel(n) : "—";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  const order = (label: string): number => {
    if (label === "—") return 9999;
    const m = label.match(/^(\d+)/);
    return m ? parseInt(m[1], 10) : 8888;
  };
  return Array.from(map.entries())
    .sort((a, b) => order(a[0]) - order(b[0]))
    .map(([name, count]) => ({ name, count }));
}

/** Full statistical profile of a listing set (agency, agent, or filtered subset). */
export function computeListingAnalytics(listings: Listing[]): ListingAnalytics {
  const total = listings.length;
  const communitySet = new Set<string>();
  for (const l of listings) {
    const c = (l.community || "").trim();
    if (c) communitySet.add(c);
  }
  const uniqueCommunities = communitySet.size;
  const prices: number[] = [];
  let missingPrice = 0;
  let poa = 0;
  const currencyMap = new Map<string, number>();

  let sale = 0;
  let rent = 0;
  let unknownPurpose = 0;

  const areas: number[] = [];
  const areaUnits = new Map<string, number>();
  const ppa: number[] = [];

  const agentMap = new Map<string, number>();

  for (const l of listings) {
    const cur = (l.currency || "—").trim() || "—";
    currencyMap.set(cur, (currencyMap.get(cur) ?? 0) + 1);

    if (l.purpose === "sale") sale++;
    else if (l.purpose === "rent") rent++;
    else unknownPurpose++;

    const p = safeNum(l.price);
    const hasPrice = Number.isFinite(l.price) && p > 0;
    if (!hasPrice) {
      missingPrice++;
      if ((l.priceOnApplication || "").toLowerCase() === "yes") poa++;
    } else {
      prices.push(p);
    }

    const a = safeNum(l.area);
    if (a > 0) {
      areas.push(a);
      const u = (l.areaUnit || "sqft").trim() || "sqft";
      areaUnits.set(u, (areaUnits.get(u) ?? 0) + 1);
      // Sale only: a rent per sqft is a different measure and would skew the median.
      if (hasPrice && l.purpose === "sale") ppa.push(p / a);
    }

    const an = (l.agent?.name || "").trim();
    if (an) agentMap.set(an, (agentMap.get(an) ?? 0) + 1);
  }

  const sortedPrices = sortedNums(prices);
  const price: PriceStats | null =
    sortedPrices.length > 0
      ? {
          min: sortedPrices[0],
          max: sortedPrices[sortedPrices.length - 1],
          mean: sortedPrices.reduce((s, x) => s + x, 0) / sortedPrices.length,
          median: percentile(sortedPrices, 0.5),
          p25: percentile(sortedPrices, 0.25),
          p75: percentile(sortedPrices, 0.75),
        }
      : null;

  const sortedAreas = sortedNums(areas);
  const topUnit =
    Array.from(areaUnits.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "sqft";
  const areaStats =
    sortedAreas.length > 0
      ? {
          withArea: sortedAreas.length,
          min: sortedAreas[0],
          max: sortedAreas[sortedAreas.length - 1],
          mean: sortedAreas.reduce((s, x) => s + x, 0) / sortedAreas.length,
          median: percentile(sortedAreas, 0.5),
          unitLabel: topUnit,
        }
      : null;

  const sortedPpa = sortedNums(ppa);
  const pricePerArea =
    sortedPpa.length > 0
      ? {
          mean: sortedPpa.reduce((s, x) => s + x, 0) / sortedPpa.length,
          median: percentile(sortedPpa, 0.5),
          label: `per ${topUnit}`,
        }
      : null;

  // Built-area bands in sqft. Fixed, readable edges: one plot or warehouse would otherwise
  // stretch equal-width bins so far that every apartment lands in the first bar.
  const AREA_EDGES = [500, 750, 1000, 1500, 2000, 3000, 5000, 10000];
  const areaHistogram: HistogramBin[] = [0, ...AREA_EDGES].map((lo, i) => {
    const hi = AREA_EDGES[i] ?? Infinity;
    const label = hi === Infinity ? `${formatAreaTick(lo)}+` : lo === 0 ? `< ${formatAreaTick(hi)}` : `${formatAreaTick(lo)}–${formatAreaTick(hi)}`;
    return { label, count: 0, min: lo, max: hi };
  });
  for (const ar of sortedAreas) areaHistogram[areaHistogram.findIndex((b) => ar < b.max)].count++;
  while (areaHistogram.length > 1 && areaHistogram[areaHistogram.length - 1].count === 0) areaHistogram.pop();

  // Scatter sample (cap for perf)
  const scatterFull: { price: number; area: number; purpose: Listing["purpose"] }[] = [];
  for (const l of listings) {
    const p = safeNum(l.price);
    const a = safeNum(l.area);
    if (p > 0 && a > 0) scatterFull.push({ price: p, area: a, purpose: l.purpose });
  }
  const scatterPriceArea =
    scatterFull.length <= 400
      ? scatterFull
      : scatterFull.filter((_, i) => i % Math.ceil(scatterFull.length / 400) === 0);

  const agentsByVolume = Array.from(agentMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  const denom = total || 1;
  const coveragePct = (filled: number) => Math.round((filled / denom) * 1000) / 10;
  const fieldCoverage = [
    { label: "Numeric price", filled: listings.filter((l) => safeNum(l.price) > 0).length },
    { label: "Built area", filled: listings.filter((l) => safeNum(l.area) > 0).length },
    { label: "Photos", filled: listings.filter((l) => Array.isArray(l.images) && l.images.length > 0).length },
    { label: "Map coordinates", filled: listings.filter((l) => l.latitude != null && l.longitude != null).length },
    { label: "Community", filled: listings.filter((l) => (l.community || "").trim().length > 0).length },
    { label: "City", filled: listings.filter((l) => (l.city || "").trim().length > 0).length },
    { label: "Agent name", filled: listings.filter((l) => (l.agent?.name || "").trim().length > 0).length },
    { label: "Description", filled: listings.filter((l) => (l.description || "").trim().length > 0).length },
    { label: "Title", filled: listings.filter((l) => (l.title || "").trim().length > 0).length },
  ].map((row) => ({ ...row, pct: coveragePct(row.filled) }));

  const imgOrder = ["0 photos", "1 photo", "2–5 photos", "6+ photos"] as const;
  const imgMap = new Map<string, number>();
  for (const k of imgOrder) imgMap.set(k, 0);
  for (const l of listings) {
    const c = Array.isArray(l.images) ? l.images.length : 0;
    const key: (typeof imgOrder)[number] =
      c <= 0 ? "0 photos" : c === 1 ? "1 photo" : c <= 5 ? "2–5 photos" : "6+ photos";
    imgMap.set(key, (imgMap.get(key) ?? 0) + 1);
  }
  const imageBuckets = imgOrder.map((name) => ({ name, count: imgMap.get(name) ?? 0 }));

  const developers = bucketMap(listings, (l) => (l.developer || "").trim() || "—", 10);
  const subCommunities = bucketMap(listings, (l) => (l.subCommunity || "").trim() || "—", 12);

  return {
    total,
    uniqueCommunities,
    pricedCount: prices.length,
    missingPriceCount: missingPrice,
    priceOnApplicationCount: poa,
    currencyMix: bucketMap(
      listings,
      (l) => (l.currency || "").trim() || "—",
      8,
    ),
    price,
    purpose: { sale, rent, unknown: unknownPurpose },
    propertyTypes: bucketMap(listings, (l) => (l.propertyType || "").trim() || "—", 10),
    communities: bucketMap(listings, (l) => (l.community || "").trim() || "—", 12),
    cities: bucketMap(listings, (l) => (l.city || "").trim() || "—", 10),
    beds: bucketNumeric(listings, (l) => safeNum(l.beds), (n) => `${Math.round(n)} br`),
    baths: bucketNumeric(listings, (l) => safeNum(l.baths), (n) => `${Math.round(n * 2) / 2} bath`),
    area: areaStats,
    pricePerArea,
    completionStatus: bucketMap(listings, (l) => (l.completionStatus || "").trim() || "—", 8),
    furnished: bucketMap(listings, (l) => (l.furnished || "").trim() || "—", 8),
    parking: bucketNumeric(listings, (l) => safeNum(l.parking), (n) => `${Math.round(n)}`),
    scatterPriceArea,
    agentsByVolume,
    areaHistogram,
    fieldCoverage,
    imageBuckets,
    developers,
    subCommunities,
  };
}

function formatAreaTick(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  return Math.round(n).toLocaleString();
}

export function formatAnalyticsMoney(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 100_000) return `${Math.round(n / 1000)}K`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}
