import type { Listing } from "@/lib/types";
import { annualRent, inMarketBounds, marketOf, marketsIn, rentPeriodMisread } from "@/lib/markets";

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
  /** Estimated listings that publish on Ziba, and why the rest are held back. */
  forecast?: ImportForecast;
};

export type ImportForecast = { publishable: number; dropped: { reason: string; count: number }[] };

/** Ziba import minimum: smaller feeds are rejected at onboarding. */
export const MIN_FEED_LISTINGS = 100;

const COMMERCIAL_TYPES = new Set(["Office", "Retail", "Warehouse", "Shop", "Show Room", "Building", "Whole Building", "Land", "Land/Plot", "Full Floor", "Half Floor", "Farm", "Staff Accommodation"]);
const KNOWN_TYPES = new Set([
  "Apartment", "Villa", "Townhouse", "Penthouse", "Land/Plot", "Office", "Retail", "Warehouse", "Full Floor", "Building",
  "Compound", "Duplex", "Half Floor", "Farm", "Whole Building", "Shop", "Show Room", "Studio", "Staff Accommodation", "Land",
  "Hotel Apartment", "Bungalow", "Bulk Units", "Factory", "Labor Camp",
]);

/** Annual rent for comparisons (rents without a period are read in their market's usual period). */
export const annualizedPrice = (l: Listing) => (l.purpose === "rent" ? annualRent(l) : l.price);

/** Shape of an identifier: letters → A, digits → 9, runs collapsed with counts, e.g. "DP-S-64142" → "A{2}-A-9{5}". */
export function shapeOf(value: string): string {
  const raw = value.replace(/[A-Za-z]/g, "A").replace(/[0-9]/g, "9");
  return raw.replace(/(A+|9+)/g, (run) => (run.length > 1 ? `${run[0]}{${run.length}}` : run[0]));
}

const isPoa = (l: Listing) => /^(yes|true|1)$/i.test(l.priceOnApplication?.trim() ?? "");

/** Pre-signed storage links (S3, CloudFront, GCS) stop working minutes after the crawl. */
const EXPIRING_URL = /[?&](x-amz-expires|x-amz-signature|expires|signature|x-goog-expires|se)=/i;
const hasExpiringImages = (l: Listing) => (l.images ?? []).some((u) => EXPIRING_URL.test(u)) || EXPIRING_URL.test(l.agent?.photo ?? "");
const hasInlineImages = (l: Listing) => (l.images ?? []).some((u) => u.startsWith("data:")) || (l.agent?.photo ?? "").startsWith("data:");
/** Ziba maps these codes to a generic "Residential"/building type with no details section. */
const GENERIC_TYPE_CODES = new Set(["BU", "HO"]);
const STALE_DAYS = 180;
const ageDays = (l: Listing) => {
  const t = Date.parse(l.lastUpdate ?? "");
  return Number.isFinite(t) ? (Date.now() - t) / 86_400_000 : null;
};

export function checkFeed(listings: Listing[]): FeedCheckResult {
  // Each listing is checked against its own market (a feed may mix countries).
  const markets = marketsIn(listings);
  const main = markets[0]?.market ?? null;
  const anyPermitMarket = markets.some((m) => m.market.permitsRequired);

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
      title: markets.length === 1 && main ? `Map location outside ${main.name}` : "Map location outside the listing's country",
      hint: "Latitude and longitude may be swapped or wrong; Ziba treats these as missing and re-geocodes from the address.",
      test: (l) =>
        l.latitude != null && l.longitude != null && !(l.latitude === 0 && l.longitude === 0) && !inMarketBounds(marketOf(l), l.latitude, l.longitude),
    },
    {
      code: "price_too_low",
      severity: "warning",
      title: "Suspiciously low price",
      hint: "Often a monthly rent filed as yearly, or a missing zero.",
      test: (l) => {
        if (!(l.price > 0)) return false;
        const m = marketOf(l).minPrice;
        return l.purpose === "sale" ? l.price < m.sale : l.purpose === "rent" && annualizedPrice(l) < m.yearlyRent;
      },
    },
    {
      code: "rent_period_misread",
      severity: "error",
      title: "Monthly rents sent without a period (shown 12× too cheap)",
      hint: "Singapore, Malaysia and Pakistan quote rents per month; Ziba reads a rent without <price><monthly> as yearly. Nest the amount under <monthly>.",
      test: rentPeriodMisread,
    },
    {
      code: "rent_period_missing",
      severity: "info",
      title: "Rental without a price period (read as yearly)",
      hint: "Fine for UAE yearly rents; wrap the price in <yearly> or <monthly> to be explicit.",
      test: (l) => l.purpose === "rent" && l.price > 0 && !l.rentPeriod && !rentPeriodMisread(l),
    },
    { code: "missing_bedrooms", severity: "warning", title: "Residential listing without bedrooms", hint: "Fill bedroom (0 for studios).", test: (l) => !COMMERCIAL_TYPES.has(l.propertyType) && (l.beds == null || Number.isNaN(l.beds)) },
    { code: "missing_area", severity: "warning", title: "No size", hint: "Fill size in the feed's area unit.", test: (l) => !(l.area > 0) },
    { code: "few_photos", severity: "warning", title: "Fewer than 5 photos", hint: "Portals rank listings with more photos higher.", test: (l) => (l.images?.length ?? 0) > 0 && l.images.length < 5 },
    { code: "short_description", severity: "warning", title: "Description under 200 characters", hint: "Short descriptions lower the portal quality score.", test: (l) => (l.description?.trim().length ?? 0) < 200 },
    { code: "agent_no_contact", severity: "warning", title: "Agent without phone or email", hint: "Leads can't reach the agent.", test: (l) => !l.agent?.phone?.trim() && !l.agent?.email?.trim() },
    ...(anyPermitMarket
      ? [{ code: "missing_permit", severity: "warning" as const, title: "UAE listing without a permit number", hint: "UAE listings need a RERA / DLD advertising permit; other markets are not checked.", test: (l: Listing) => marketOf(l).permitsRequired && !l.permitNumber?.trim() }]
      : []),
    {
      code: "missing_name_or_description",
      severity: "error",
      title: "No property name or description",
      hint: "Ziba's import policy skips listings missing property_name or description_en; neither can be filled by enrichment.",
      test: (l) => !l.propertyName?.trim() || !l.description?.trim(),
    },
    {
      code: "poa_not_published",
      severity: "warning",
      title: "Price on application: not published on Ziba",
      hint: "Ziba discards listings marked price_on_application=Yes; publish a price to include them.",
      test: isPoa,
    },
    {
      code: "expiring_image_urls",
      severity: "error",
      title: "Image links expire (pre-signed URLs)",
      hint: "Signed storage links stop working shortly after the crawl; import immediately or re-host the images.",
      test: hasExpiringImages,
    },
    {
      code: "inline_images",
      severity: "error",
      title: "Images embedded as base64",
      hint: "Ziba can't process data: URIs; use a normal image URL.",
      test: hasInlineImages,
    },
    {
      code: "size_outlier",
      severity: "warning",
      title: "Implausible size or bedrooms",
      hint: "Residential size over 50,000 sqft or more than 15 bedrooms; usually a unit or field mix-up.",
      test: (l) => !COMMERCIAL_TYPES.has(l.propertyType) && (l.area > 50_000 || (l.beds ?? 0) > 15),
    },
    {
      code: "stale_listing",
      severity: "info",
      title: `Not updated in ${STALE_DAYS}+ days`,
      hint: "Old listings are often already sold or let; confirm the agency still markets them.",
      test: (l) => (ageDays(l) ?? 0) > STALE_DAYS,
    },
    {
      code: "generic_type_code",
      severity: "info",
      title: "Building or hotel type (shown as generic Residential)",
      hint: "BU and HO map to a generic type on Ziba, so the property details section is hidden.",
      test: (l) => GENERIC_TYPE_CODES.has((l.propertyTypeCode ?? "").toUpperCase()),
    },
    {
      code: "svg_agent_photo",
      severity: "info",
      title: "Agent photo is an SVG",
      hint: "SVG logos are often white on transparent and render invisible; prefer a JPG or PNG.",
      test: (l) => /\.svg(\?|$)/i.test(l.agent?.photo ?? ""),
    },
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

  if (listings.length > 0 && listings.length < MIN_FEED_LISTINGS) {
    issues.push({
      code: "small_feed",
      severity: "warning",
      title: `Only ${listings.length} listings (minimum ${MIN_FEED_LISTINGS})`,
      hint: "Agencies below the minimum are usually rejected at onboarding.",
      count: listings.length,
      examples: [],
    });
  }

  // Several currencies in one feed usually means the site priced by visitor location.
  const currencies = new Map<string, number>();
  for (const l of listings) {
    const c = (l.currency ?? "").trim().toUpperCase();
    if (c) currencies.set(c, (currencies.get(c) ?? 0) + 1);
  }
  if (currencies.size > 1) {
    const [main] = [...currencies.entries()].sort((a, b) => b[1] - a[1])[0];
    const odd = listings.filter((l) => (l.currency ?? "").trim().toUpperCase() !== main && l.currency?.trim());
    issues.push({
      code: "mixed_currency",
      severity: "warning",
      title: `Prices in ${currencies.size} currencies`,
      hint: `Most listings use ${main}; the rest may be converted by the website and are not comparable.`,
      count: odd.length,
      examples: odd.slice(0, 5).map((l) => l.reference),
    });
  }

  // Ziba keeps one agent profile per email, so agents sharing an inbox are merged on import.
  const namesByEmail = new Map<string, Set<string>>();
  for (const l of listings) {
    const e = l.agent?.email?.trim().toLowerCase();
    const n = l.agent?.name?.trim();
    if (!e || !n) continue;
    if (!namesByEmail.has(e)) namesByEmail.set(e, new Set());
    namesByEmail.get(e)!.add(n.toLowerCase());
  }
  const shared = [...namesByEmail.entries()].filter(([, names]) => names.size > 1);
  if (shared.length) {
    const people = [...namesByEmail.values()].reduce((n, s) => n + s.size, 0);
    issues.push({
      code: "agents_share_email",
      severity: "info",
      title: `${people} agents become ${namesByEmail.size} profile${namesByEmail.size === 1 ? "" : "s"} on import`,
      hint: `${shared.length} email address(es) are used by several agents (e.g. ${shared[0][0]}). Ziba's policy 6 collapses them into the agency: agency name, logo, email and phone, with the agent's ID, licence and info cleared.`,
      count: shared.reduce((n, [, s]) => n + s.size, 0),
      examples: [],
    });
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

  return { gate, listingCount: listings.length, issues, rentPeriods, referenceShapes: sortedShapes.slice(0, 5), forecast: importForecast(listings) };
}

/** Reasons Ziba holds a listing back, first match wins (mirrors the import policy seen in QA). */
const DROP_REASONS: [string, (l: Listing) => boolean][] = [
  ["Price on application", isPoa],
  ["No photos", (l) => !(l.images?.length > 0)],
  ["Expiring or inline image links", (l) => hasExpiringImages(l) || hasInlineImages(l)],
  [
    "Missing required fields",
    (l) => !l.reference?.trim() || l.purpose === "unknown" || !l.propertyType?.trim() || !l.city?.trim() || !l.community?.trim() || !(l.price > 0),
  ],
  // skip_policy.py: property_name and description_en are core fields that enrichment can't fill.
  ["No property name or description", (l) => !l.propertyName?.trim() || !l.description?.trim()],
];

/** Estimate of how many listings will publish on Ziba. Broken image URLs can only be seen after import. */
export function importForecast(listings: Listing[]): ImportForecast {
  const counts = new Map<string, number>();
  let publishable = 0;
  for (const l of listings) {
    const hit = DROP_REASONS.find(([, test]) => test(l));
    if (hit) counts.set(hit[0], (counts.get(hit[0]) ?? 0) + 1);
    else publishable++;
  }
  return { publishable, dropped: DROP_REASONS.map(([reason]) => ({ reason, count: counts.get(reason) ?? 0 })).filter((d) => d.count > 0) };
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
