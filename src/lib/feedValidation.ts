import type { Listing } from "@/lib/types";

/**
 * Feed-level checks, grouped by rule (one row per problem type with a count and examples) rather
 * than one line per listing. Modelled on the ZibaAi import policy: required core fields, plausible
 * values, consistent formats.
 */

export type Severity = "error" | "warning" | "info";

export type FeedIssue = {
  code: string;
  severity: Severity;
  title: string;
  /** What to do about it, in one sentence. */
  hint: string;
  count: number;
  /** Up to 5 listing references for spot checks. */
  examples: string[];
};

export type FeedCheckResult = {
  gate: "pass" | "warn" | "fail";
  listingCount: number;
  issues: FeedIssue[];
  /** Rental price periods as stated in the feed (yearly, monthly…, or "not stated"). */
  rentPeriods: Record<string, number>;
  /** Most common reference-number formats, e.g. "AA-A-99999". */
  referenceShapes: [string, number][];
};

const COMMERCIAL_TYPES = new Set(["Office", "Retail", "Warehouse", "Shop", "Show Room", "Building", "Whole Building", "Land", "Land/Plot", "Full Floor", "Half Floor", "Farm", "Staff Accommodation"]);
const KNOWN_TYPES = new Set([
  "Apartment", "Villa", "Townhouse", "Penthouse", "Land/Plot", "Office", "Retail", "Warehouse", "Full Floor", "Building",
  "Compound", "Duplex", "Half Floor", "Farm", "Whole Building", "Shop", "Show Room", "Studio", "Staff Accommodation", "Land",
  "Hotel Apartment", "Bungalow", "Bulk Units", "Factory", "Labor Camp",
]);

/** Rough bounding boxes for markets the ZibaAi feeds cover; used to catch swapped or zero coordinates. */
const MARKET_BOUNDS: Record<string, [number, number, number, number]> = {
  AED: [22.5, 51.0, 26.5, 56.5], // UAE
  SGD: [1.15, 103.55, 1.5, 104.1], // Singapore
  MYR: [0.8, 99.5, 7.5, 119.5], // Malaysia
  PKR: [23.5, 60.8, 37.1, 77.9], // Pakistan
};

const MARKET_BY_CURRENCY_NAME: Record<string, string> = {
  "uae dirham": "AED",
  aed: "AED",
  "singapore dollar": "SGD",
  sgd: "SGD",
  "malaysian ringgit": "MYR",
  myr: "MYR",
  "pakistani rupee": "PKR",
  pkr: "PKR",
};

/** Implausibly low prices per market: sale, yearly rent. Below these a price is probably a typo or a monthly figure. */
const MIN_PRICE: Record<string, { sale: number; yearlyRent: number }> = {
  AED: { sale: 100_000, yearlyRent: 10_000 },
  SGD: { sale: 100_000, yearlyRent: 6_000 },
};

const PERIOD_FACTOR: Record<string, number> = { yearly: 1, monthly: 12, weekly: 52, daily: 365 };

/** Annual rent when the feed states a period; otherwise the raw price. */
export const annualizedPrice = (l: Listing) => (l.purpose === "rent" ? l.price * (PERIOD_FACTOR[l.rentPeriod || "yearly"] ?? 1) : l.price);

/** Shape of an identifier: letters → A, digits → 9, runs collapsed with counts, e.g. "DP-S-64142" → "A{2}-A-9{5}". */
export function shapeOf(value: string): string {
  const raw = value.replace(/[A-Za-z]/g, "A").replace(/[0-9]/g, "9");
  return raw.replace(/(A+|9+)/g, (run) => (run.length > 1 ? `${run[0]}{${run.length}}` : run[0]));
}

const isPoa = (l: Listing) => /^(yes|true|1)$/i.test(l.priceOnApplication?.trim() ?? "");

export function checkFeed(listings: Listing[]): FeedCheckResult {
  const market = MARKET_BY_CURRENCY_NAME[(listings[0]?.currency ?? "").trim().toLowerCase()] ?? null;
  const bounds = market ? MARKET_BOUNDS[market] : null;
  const minPrice = market ? MIN_PRICE[market] : null;

  type Rule = Omit<FeedIssue, "count" | "examples"> & { test: (l: Listing) => boolean };
  const rules: Rule[] = [
    { code: "missing_reference", severity: "error", title: "Missing reference number", hint: "Every listing needs a stable reference; without it versions can't be compared.", test: (l) => !l.reference?.trim() },
    { code: "missing_price", severity: "error", title: "No price and not marked price-on-application", hint: "Add the price, or set price_on_application to Yes.", test: (l) => !(l.price > 0) && !isPoa(l) },
    { code: "unknown_purpose", severity: "error", title: "Sale or rent not recognised", hint: "offering_type should be RS, RR, CS or CR.", test: (l) => l.purpose === "unknown" },
    { code: "missing_type", severity: "error", title: "Missing property type", hint: "Fill property_type (AP, VH, TH, OF…).", test: (l) => !l.propertyType?.trim() },
    { code: "missing_location", severity: "error", title: "Missing city or community", hint: "Portals reject listings without a city and community.", test: (l) => !l.city?.trim() || !l.community?.trim() },
    { code: "no_photos", severity: "error", title: "No photos", hint: "Listings without photos are rejected by most portals.", test: (l) => !(l.images?.length > 0) },
    { code: "missing_coords", severity: "warning", title: "No map location", hint: "Add geopoints so the listing appears on maps.", test: (l) => l.latitude == null || l.longitude == null || (l.latitude === 0 && l.longitude === 0) },
    {
      code: "coords_outside_market",
      severity: "warning",
      title: market ? `Map location outside the ${market} market` : "Map location outside the feed's market",
      hint: "Latitude and longitude may be swapped or wrong.",
      test: (l) =>
        !!bounds && l.latitude != null && l.longitude != null && !(l.latitude === 0 && l.longitude === 0) &&
        !(l.latitude >= bounds[0] && l.latitude <= bounds[2] && l.longitude >= bounds[1] && l.longitude <= bounds[3]),
    },
    {
      code: "price_too_low",
      severity: "warning",
      title: "Suspiciously low price",
      hint: "Often a monthly rent filed as yearly, or a missing zero.",
      test: (l) =>
        !!minPrice && l.price > 0 && (l.purpose === "sale" ? l.price < minPrice.sale : l.purpose === "rent" && annualizedPrice(l) < minPrice.yearlyRent),
    },
    { code: "rent_period_missing", severity: "warning", title: "Rental without a price period", hint: "Wrap the price in <yearly> or <monthly> so rents aren't misread.", test: (l) => l.purpose === "rent" && l.price > 0 && !l.rentPeriod },
    { code: "missing_bedrooms", severity: "warning", title: "Residential listing without bedrooms", hint: "Fill bedroom (0 for studios).", test: (l) => !COMMERCIAL_TYPES.has(l.propertyType) && (l.beds == null || Number.isNaN(l.beds)) },
    { code: "missing_area", severity: "warning", title: "No size", hint: "Fill size in the feed's area unit.", test: (l) => !(l.area > 0) },
    { code: "few_photos", severity: "warning", title: "Fewer than 5 photos", hint: "Portals rank listings with more photos higher.", test: (l) => (l.images?.length ?? 0) > 0 && l.images.length < 5 },
    { code: "short_description", severity: "warning", title: "Description under 200 characters", hint: "Short descriptions lower the portal quality score.", test: (l) => (l.description?.trim().length ?? 0) < 200 },
    { code: "agent_no_contact", severity: "warning", title: "Agent without phone or email", hint: "Leads can't reach the agent.", test: (l) => !l.agent?.phone?.trim() && !l.agent?.email?.trim() },
    { code: "missing_permit", severity: market === "AED" ? "warning" : "info", title: "No permit number", hint: "Dubai listings need a RERA/DLD permit number.", test: (l) => !l.permitNumber?.trim() },
    { code: "unknown_type_code", severity: "info", title: "Unrecognised property type code", hint: "Map it in Field mapping so it groups correctly.", test: (l) => !!l.propertyType && !KNOWN_TYPES.has(l.propertyType) },
  ];

  const hits = rules.map(() => ({ count: 0, examples: [] as string[] }));
  const refs = new Map<string, number>();
  const shapes = new Map<string, number>();
  const rentPeriods: Record<string, number> = {};

  for (const l of listings) {
    rules.forEach((r, i) => {
      if (r.test(l)) {
        hits[i].count++;
        if (hits[i].examples.length < 5) hits[i].examples.push(l.reference || "(no reference)");
      }
    });
    const ref = l.reference?.trim();
    if (ref) {
      refs.set(ref, (refs.get(ref) ?? 0) + 1);
      const shape = shapeOf(ref);
      shapes.set(shape, (shapes.get(shape) ?? 0) + 1);
    }
    if (l.purpose === "rent") rentPeriods[l.rentPeriod || "not stated"] = (rentPeriods[l.rentPeriod || "not stated"] ?? 0) + 1;
  }

  const issues: FeedIssue[] = rules
    .map((r, i) => ({ code: r.code, severity: r.severity, title: r.title, hint: r.hint, ...hits[i] }))
    .filter((x) => x.count > 0);

  const dupes = [...refs.entries()].filter(([, n]) => n > 1);
  if (dupes.length) {
    issues.push({
      code: "duplicate_reference",
      severity: "error",
      title: "Duplicate reference numbers",
      hint: "Each reference must be unique; duplicates overwrite each other when comparing versions.",
      count: dupes.reduce((n, [, c]) => n + c, 0),
      examples: dupes.slice(0, 5).map(([r]) => r),
    });
  }

  // One contact on most listings usually means the feed fills in a default agent, so leads and
  // agent stats are wrong.
  if (listings.length >= 100) {
    const byAgent = new Map<string, number>();
    for (const l of listings) {
      const k = (l.agent?.email || l.agent?.phone || l.agent?.name || "").trim().toLowerCase();
      if (k) byAgent.set(k, (byAgent.get(k) ?? 0) + 1);
    }
    const [topKey, topCount] = [...byAgent.entries()].sort((x, y) => y[1] - x[1])[0] ?? ["", 0];
    if (topCount / listings.length > 0.5) {
      const top = listings.find((l) => (l.agent?.email || l.agent?.phone || l.agent?.name || "").trim().toLowerCase() === topKey);
      issues.push({
        code: "agent_concentration",
        severity: "warning",
        title: `${Math.round((topCount / listings.length) * 100)}% of listings use one agent (${top?.agent.name || topKey})`,
        hint: "Often a default contact filled in by the export; check the agency's agent mapping.",
        count: topCount,
        examples: listings.filter((l) => l === top).slice(0, 1).map((l) => l.reference),
      });
    }
  }

  // A reference format used by under 1% of listings is usually a typo or a different source mixed in.
  const sortedShapes = [...shapes.entries()].sort((a, b) => b[1] - a[1]);
  const rare = sortedShapes.filter(([, n]) => listings.length >= 100 && n / listings.length < 0.01);
  if (rare.length && sortedShapes.length > 1) {
    const rareSet = new Set(rare.map(([s]) => s));
    issues.push({
      code: "rare_reference_format",
      severity: "info",
      title: "Unusual reference-number format",
      hint: `Most references look like ${sortedShapes[0][0]}; these don't.`,
      count: rare.reduce((n, [, c]) => n + c, 0),
      examples: listings.filter((l) => l.reference && rareSet.has(shapeOf(l.reference))).slice(0, 5).map((l) => l.reference),
    });
  }

  const order: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
  issues.sort((a, b) => order[a.severity] - order[b.severity] || b.count - a.count);

  // Gate like the ZibaAi diff gate: fail when errors touch over 5% of listings, warn on any error or
  // when warnings touch over 25%.
  const n = Math.max(1, listings.length);
  const worstError = Math.max(0, ...issues.filter((i) => i.severity === "error").map((i) => i.count / n));
  const worstWarning = Math.max(0, ...issues.filter((i) => i.severity === "warning").map((i) => i.count / n));
  const gate = worstError > 0.05 ? "fail" : worstError > 0 || worstWarning > 0.25 ? "warn" : "pass";

  return { gate, listingCount: listings.length, issues, rentPeriods, referenceShapes: sortedShapes.slice(0, 5) };
}

export type FieldCompleteness = { field: string; before: number; after: number; delta: number; flagged: boolean };

const COMPLETENESS_FIELDS: [string, (l: Listing) => boolean][] = [
  ["Price", (l) => l.price > 0 || isPoa(l)],
  ["Photos", (l) => (l.images?.length ?? 0) > 0],
  ["Map location", (l) => l.latitude != null && l.longitude != null],
  ["Bedrooms", (l) => l.beds != null && !Number.isNaN(l.beds)],
  ["Size", (l) => l.area > 0],
  ["Description", (l) => (l.description?.trim().length ?? 0) > 0],
  ["Permit number", (l) => !!l.permitNumber?.trim()],
  ["Agent phone", (l) => !!l.agent?.phone?.trim()],
  ["Agent email", (l) => !!l.agent?.email?.trim()],
  ["Community", (l) => !!l.community?.trim()],
  ["Sub-community", (l) => !!l.subCommunity?.trim()],
  ["Furnished", (l) => !!l.furnished?.trim()],
  ["Completion status", (l) => !!l.completionStatus?.trim()],
  ["Video tour", (l) => !!l.videoTourUrl?.trim()],
];

/** Share of listings with each field filled, before vs after; flags drops of 10 points or more. */
export function completenessDelta(before: Listing[], after: Listing[]): FieldCompleteness[] {
  const share = (rows: Listing[], f: (l: Listing) => boolean) => (rows.length ? rows.filter(f).length / rows.length : 0);
  return COMPLETENESS_FIELDS.map(([field, f]) => {
    const b = share(before, f);
    const a = share(after, f);
    return { field, before: b, after: a, delta: a - b, flagged: a - b <= -0.1 };
  });
}
