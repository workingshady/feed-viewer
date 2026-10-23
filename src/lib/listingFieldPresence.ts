import { priceOnApplicationIsAffirmative } from "@/lib/databaseFormat";
import { flattenXmlString } from "@/lib/xmlParser";
import type { ImportResult, Listing } from "@/lib/types";
import { UI_FIELDS } from "@/lib/types";

/** Mapped listing fields used for completeness / EDA (excludes structural `id` and bulk `rawXml`). */
export const LISTING_FIELD_QUALITY_KEYS: (keyof Listing)[] = UI_FIELDS.filter(
  (f) => f.key !== "id" && f.key !== "rawXml",
).map((f) => f.key);

/**
 * Whether `key` is populated with a non-empty / meaningful value for analytics and QA highlights.
 */
export function isListingFieldFilled(listing: Listing, key: keyof Listing): boolean {
  switch (key) {
    case "reference":
      return listing.reference.trim().length > 0;
    case "title":
      return listing.title.trim().length > 0;
    case "description":
      return listing.description.trim().length > 0;
    case "price":
      return (
        (typeof listing.price === "number" && Number.isFinite(listing.price) && listing.price > 0) ||
        priceOnApplicationIsAffirmative(listing.priceOnApplication)
      );
    case "priceOnApplication":
      return listing.priceOnApplication.trim().length > 0;
    case "currency":
      return listing.currency.trim().length > 0;
    case "paymentMethod":
      return listing.paymentMethod.trim().length > 0;
    case "downPaymentPrice":
      return Number.isFinite(listing.downPaymentPrice) && listing.downPaymentPrice > 0;
    case "serviceCharge":
      return Number.isFinite(listing.serviceCharge) && listing.serviceCharge > 0;
    case "cheques":
      return listing.cheques.trim().length > 0;
    case "purpose":
      return listing.purpose === "sale" || listing.purpose === "rent";
    case "propertyType":
      return listing.propertyType.trim().length > 0;
    case "beds":
      return Number.isFinite(listing.beds) && listing.beds > 0;
    case "baths":
      return Number.isFinite(listing.baths) && listing.baths > 0;
    case "area":
      return Number.isFinite(listing.area) && listing.area > 0;
    case "areaUnit":
      return listing.areaUnit.trim().length > 0;
    case "plotSize":
      return Number.isFinite(listing.plotSize) && listing.plotSize > 0;
    case "community":
      return listing.community.trim().length > 0;
    case "city":
      return listing.city.trim().length > 0;
    case "address":
      return listing.address.trim().length > 0;
    case "subCommunity":
      return listing.subCommunity.trim().length > 0;
    case "propertyName":
      return listing.propertyName.trim().length > 0;
    case "developer":
      return listing.developer.trim().length > 0;
    case "buildYear":
      return listing.buildYear.trim().length > 0;
    case "floor":
      return listing.floor.trim().length > 0;
    case "stories":
      return listing.stories.trim().length > 0;
    case "latitude":
      return listing.latitude != null;
    case "longitude":
      return listing.longitude != null;
    case "images":
      return Array.isArray(listing.images) && listing.images.length > 0;
    case "amenities":
      return Array.isArray(listing.amenities) && listing.amenities.length > 0;
    case "view360":
      return listing.view360.trim().length > 0;
    case "videoTourUrl":
      return listing.videoTourUrl.trim().length > 0;
    case "floorPlanUrl":
      return listing.floorPlanUrl.trim().length > 0;
    case "agent": {
      const a = listing.agent;
      return Boolean(
        (a?.name || "").trim() ||
          (a?.phone || "").trim() ||
          (a?.email || "").trim() ||
          (a?.photo || "").trim(),
      );
    }
    case "furnished":
      return listing.furnished.trim().length > 0;
    case "parking":
      return Number.isFinite(listing.parking) && listing.parking > 0;
    case "completionStatus":
      return listing.completionStatus.trim().length > 0;
    case "permitNumber":
      return listing.permitNumber.trim().length > 0;
    case "lastUpdate":
      return listing.lastUpdate.trim().length > 0;
    default:
      return false;
  }
}

export function fieldLabelForKey(key: keyof Listing): string {
  return UI_FIELDS.find((f) => f.key === key)?.label ?? String(key);
}

export function getMissingListingFields(listing: Listing): { key: keyof Listing; label: string }[] {
  const out: { key: keyof Listing; label: string }[] = [];
  for (const key of LISTING_FIELD_QUALITY_KEYS) {
    if (!isListingFieldFilled(listing, key)) {
      out.push({ key, label: fieldLabelForKey(key) });
    }
  }
  return out;
}

export function countMissingListingFields(listing: Listing): number {
  let n = 0;
  for (const key of LISTING_FIELD_QUALITY_KEYS) {
    if (!isListingFieldFilled(listing, key)) n++;
  }
  return n;
}

/** Agent named in feed but no photo URL (common “missing logo/headshot” case). */
export function isAgentPhotoMissing(listing: Listing): boolean {
  const name = (listing.agent?.name || "").trim();
  const photo = (listing.agent?.photo || "").trim();
  return Boolean(name && !photo);
}

export function isAgencyLogoPresent(agency?: ImportResult["agencyInfo"] | null): boolean {
  return Boolean((agency?.logo || "").trim());
}

export type FieldPresenceRow = {
  key: keyof Listing;
  label: string;
  filled: number;
  missing: number;
  pct: number;
};

export function computeFieldPresenceTable(listings: Listing[]): FieldPresenceRow[] {
  const total = listings.length || 1;
  return LISTING_FIELD_QUALITY_KEYS.map((key) => {
    let filled = 0;
    for (const l of listings) {
      if (isListingFieldFilled(l, key)) filled++;
    }
    return {
      key,
      label: fieldLabelForKey(key),
      filled,
      missing: listings.length - filled,
      pct: Math.round((filled / total) * 1000) / 10,
    };
  });
}

export type MissingFieldBucket = { label: string; count: number };

/** Distribution of how many mapped fields are empty per listing. */
export function computeMissingFieldCountDistribution(listings: Listing[]): MissingFieldBucket[] {
  const counts = new Map<number, number>();
  for (const l of listings) {
    const m = countMissingListingFields(l);
    counts.set(m, (counts.get(m) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([missingCount, count]) => ({
      label: missingCount === 0 ? "Complete (0 gaps)" : `${missingCount} empty fields`,
      count,
    }));
}

export type XmlPathPresenceRow = {
  path: string;
  listingsWithPath: number;
  listingsWithValue: number;
  pctOfSampleWithValue: number;
  pctOfAppearancesFilled: number;
};

/** Safe upper bounds for UI sliders (plan: 5000 listings / 200 paths). */
export const XML_EDA_MAX_LISTINGS_CEILING = 5000;
export const XML_EDA_MAX_PATHS_CEILING = 200;

export type XmlPathPresenceResult = {
  rows: XmlPathPresenceRow[];
  sampleSize: number;
  truncatedListings: boolean;
  /** Listings in scope with no usable raw XML in the sample pass. */
  listingsSkippedNoRawXml: number;
  /** Distinct paths discovered before applying maxPaths truncation. */
  totalPathsDiscovered: number;
  pathsShown: number;
  pathsTruncated: boolean;
};

/**
 * Per-path XML EDA: among a sample of listings, how often each flattened path carries a non-empty value.
 * Paths are only counted for listings where they appear in the flattened tree at least once.
 */
export function computeXmlPathPresence(
  listings: Listing[],
  opts?: { maxListings?: number; maxPaths?: number },
): XmlPathPresenceResult {
  const maxListings = Math.min(opts?.maxListings ?? 1200, XML_EDA_MAX_LISTINGS_CEILING);
  const maxPaths = Math.min(opts?.maxPaths ?? 80, XML_EDA_MAX_PATHS_CEILING);
  const sample = listings.slice(0, maxListings);
  const truncatedListings = listings.length > sample.length;

  const appeared = new Map<string, number>();
  const withValue = new Map<string, number>();
  let listingsSkippedNoRawXml = 0;

  for (const l of sample) {
    if (!l.rawXml?.trim()) {
      listingsSkippedNoRawXml++;
      continue;
    }
    const flat = flattenXmlString(l.rawXml, "property");
    const byPath = new Map<string, boolean>();
    for (const e of flat) {
      const rawVal = Array.isArray(e.value) ? e.value.join(", ") : (e.value ?? "");
      const ok = String(rawVal).trim().length > 0;
      const prev = byPath.get(e.path);
      byPath.set(e.path, Boolean(prev) || ok);
    }
    for (const [path, has] of byPath) {
      appeared.set(path, (appeared.get(path) ?? 0) + 1);
      if (has) withValue.set(path, (withValue.get(path) ?? 0) + 1);
    }
  }

  const rowsFull: XmlPathPresenceRow[] = [];
  for (const [path, app] of appeared) {
    const wv = withValue.get(path) ?? 0;
    const denom = sample.length || 1;
    rowsFull.push({
      path,
      listingsWithPath: app,
      listingsWithValue: wv,
      pctOfSampleWithValue: Math.round((wv / denom) * 1000) / 10,
      pctOfAppearancesFilled: app ? Math.round((wv / app) * 1000) / 10 : 0,
    });
  }

  const totalPathsDiscovered = rowsFull.length;
  rowsFull.sort((a, b) => a.pctOfSampleWithValue - b.pctOfSampleWithValue || b.listingsWithPath - a.listingsWithPath);
  const rows = rowsFull.slice(0, maxPaths);
  return {
    rows,
    sampleSize: sample.length,
    truncatedListings,
    listingsSkippedNoRawXml,
    totalPathsDiscovered,
    pathsShown: rows.length,
    pathsTruncated: totalPathsDiscovered > rows.length,
  };
}

/** Keys for co-missing heatmap: all required mapped fields plus the worst-covered optional fields (by presence table). */
export function pickCoabsenceFieldKeys(presenceRows: FieldPresenceRow[], maxKeys: number): (keyof Listing)[] {
  const required = UI_FIELDS.filter((f) => f.required && f.key !== "id" && f.key !== "rawXml").map((f) => f.key);
  const requiredSet = new Set(required);
  const optionalSorted = [...presenceRows]
    .filter((r) => !requiredSet.has(r.key))
    .sort((a, b) => a.pct - b.pct)
    .map((r) => r.key);
  const out: (keyof Listing)[] = [];
  for (const k of required) {
    if (out.length >= maxKeys) break;
    out.push(k);
  }
  for (const k of optionalSorted) {
    if (out.length >= maxKeys) break;
    if (!out.includes(k)) out.push(k);
  }
  return out.slice(0, maxKeys);
}

export type CoabsenceMatrix = {
  labels: string[];
  keys: (keyof Listing)[];
  /** matrix[i][j]: i===j → % listings with field i missing; else → % listings with both i and j missing */
  matrix: number[][];
  n: number;
};

export function computeFieldCoabsenceMatrix(listings: Listing[], keys: (keyof Listing)[]): CoabsenceMatrix {
  const n = listings.length || 1;
  const labels = keys.map((k) => fieldLabelForKey(k));
  const len = keys.length;
  const matrix: number[][] = Array.from({ length: len }, () => Array(len).fill(0));
  if (listings.length === 0) {
    return { labels, keys, matrix, n: 0 };
  }

  const missing = listings.map((l) => keys.map((k) => !isListingFieldFilled(l, k)));

  for (let i = 0; i < len; i++) {
    let missI = 0;
    for (let r = 0; r < listings.length; r++) {
      if (missing[r]![i]) missI++;
    }
    matrix[i]![i] = Math.round((missI / n) * 1000) / 10;

    for (let j = i + 1; j < len; j++) {
      let both = 0;
      for (let r = 0; r < listings.length; r++) {
        if (missing[r]![i] && missing[r]![j]) both++;
      }
      const pct = Math.round((both / n) * 1000) / 10;
      matrix[i]![j] = pct;
      matrix[j]![i] = pct;
    }
  }

  return { labels, keys, matrix, n: listings.length };
}

export type SegmentQualityKey = "propertyType" | "purpose" | "community" | "city";

export type SegmentQualityRow = {
  segment: string;
  count: number;
  meanMissing: number;
  avgCoveragePct: number;
};

function segmentLabelForListing(l: Listing, key: SegmentQualityKey): string {
  switch (key) {
    case "propertyType":
      return (l.propertyType || "").trim() || "—";
    case "purpose":
      return l.purpose === "sale" || l.purpose === "rent" ? l.purpose : "unknown";
    case "community":
      return (l.community || "").trim() || "—";
    case "city":
      return (l.city || "").trim() || "—";
    default:
      return "—";
  }
}

/** Mean gaps per listing and average coverage % within each segment (top K segments by volume). */
export function computeSegmentQuality(
  listings: Listing[],
  segmentKey: SegmentQualityKey,
  topK: number,
): SegmentQualityRow[] {
  const k = Math.max(1, Math.min(topK, 40));
  const counts = new Map<string, number>();
  for (const l of listings) {
    const s = segmentLabelForListing(l, segmentKey);
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  const topSegments = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([name]) => name);
  const topSet = new Set(topSegments);

  const sumMissing = new Map<string, number>();
  const sumCoverage = new Map<string, number>();
  const denom = LISTING_FIELD_QUALITY_KEYS.length || 1;

  for (const l of listings) {
    const seg = segmentLabelForListing(l, segmentKey);
    if (!topSet.has(seg)) continue;
    const m = countMissingListingFields(l);
    sumMissing.set(seg, (sumMissing.get(seg) ?? 0) + m);
    const filled = denom - m;
    sumCoverage.set(seg, (sumCoverage.get(seg) ?? 0) + (filled / denom) * 100);
  }

  return topSegments
    .map((segment) => {
      const count = counts.get(segment) ?? 0;
      const sm = sumMissing.get(segment) ?? 0;
      const sc = sumCoverage.get(segment) ?? 0;
      return {
        segment,
        count,
        meanMissing: count ? Math.round((sm / count) * 10) / 10 : 0,
        avgCoveragePct: count ? Math.round((sc / count) * 10) / 10 : 0,
      };
    })
    .filter((r) => r.count > 0);
}

export type XmlPathPrefixGroup = {
  prefix: string;
  distinctPaths: number;
  avgPctSampleWithValue: number;
  minPctSampleWithValue: number;
  maxPctSampleWithValue: number;
};

/** Roll up XML path rows by the first `depth` dot-separated segments (e.g. depth 2 → `property.Listing`). */
export function groupXmlPathsByPrefix(rows: XmlPathPresenceRow[], depth: 1 | 2 | 3): XmlPathPrefixGroup[] {
  const groups = new Map<
    string,
    { paths: number; sumPct: number; minPct: number; maxPct: number }
  >();

  for (const r of rows) {
    const parts = r.path.split(".");
    const prefix = parts.slice(0, Math.min(depth, parts.length)).join(".") || r.path;
    const cur = groups.get(prefix) ?? { paths: 0, sumPct: 0, minPct: 100, maxPct: 0 };
    cur.paths += 1;
    cur.sumPct += r.pctOfSampleWithValue;
    cur.minPct = Math.min(cur.minPct, r.pctOfSampleWithValue);
    cur.maxPct = Math.max(cur.maxPct, r.pctOfSampleWithValue);
    groups.set(prefix, cur);
  }

  return [...groups.entries()]
    .map(([prefix, g]) => ({
      prefix,
      distinctPaths: g.paths,
      avgPctSampleWithValue: g.paths ? Math.round((g.sumPct / g.paths) * 10) / 10 : 0,
      minPctSampleWithValue: g.minPct,
      maxPctSampleWithValue: g.maxPct,
    }))
    .sort((a, b) => a.avgPctSampleWithValue - b.avgPctSampleWithValue || b.distinctPaths - a.distinctPaths);
}

const REQUIRED_QUALITY_KEYS = UI_FIELDS.filter(
  (f) => f.required && f.key !== "id" && f.key !== "rawXml",
).map((f) => f.key);

/** Listings where every required mapped field is filled (reference, title, price/POA, purpose, propertyType). */
export function countListingsAllRequiredFilled(listings: Listing[]): { pass: number; fail: number } {
  let pass = 0;
  for (const l of listings) {
    let ok = true;
    for (const key of REQUIRED_QUALITY_KEYS) {
      if (!isListingFieldFilled(l, key)) {
        ok = false;
        break;
      }
    }
    if (ok) pass++;
  }
  return { pass, fail: listings.length - pass };
}

export type PurposeAnalyticsFilter = "all" | "sale" | "rent" | "unknown";

export function filterListingsByPurpose(listings: Listing[], filter: PurposeAnalyticsFilter): Listing[] {
  if (filter === "all") return listings;
  if (filter === "sale") return listings.filter((l) => l.purpose === "sale");
  if (filter === "rent") return listings.filter((l) => l.purpose === "rent");
  return listings.filter((l) => l.purpose !== "sale" && l.purpose !== "rent");
}

/** How many mapped fields fall into each coverage band (granular view of schema health). */
export type FieldCoverageBucketRow = { band: string; fieldCount: number; lo: number; hi: number };

export function computeFieldCoverageBuckets(rows: FieldPresenceRow[]): FieldCoverageBucketRow[] {
  const defs: { band: string; lo: number; hi: number }[] = [
    { band: "0–20%", lo: 0, hi: 20 },
    { band: "20–40%", lo: 20, hi: 40 },
    { band: "40–60%", lo: 40, hi: 60 },
    { band: "60–80%", lo: 60, hi: 80 },
    { band: "80–100%", lo: 80, hi: 100 },
  ];
  return defs.map(({ band, lo, hi }) => {
    let fieldCount = 0;
    for (const r of rows) {
      const last = hi >= 100;
      if (last) {
        if (r.pct >= lo && r.pct <= hi) fieldCount++;
      } else if (r.pct >= lo && r.pct < hi) {
        fieldCount++;
      }
    }
    return { band, fieldCount, lo, hi };
  });
}

export type ImageCountBucketRow = { label: string; count: number };

/** Listing-level image URL counts (media depth). */
export function computeImageCountDistribution(listings: Listing[]): ImageCountBucketRow[] {
  const keys = ["0 photos", "1 photo", "2–3 photos", "4–5 photos", "6+ photos"] as const;
  const map = new Map<string, number>();
  for (const k of keys) map.set(k, 0);
  for (const l of listings) {
    const n = Array.isArray(l.images) ? l.images.length : 0;
    const label: (typeof keys)[number] =
      n <= 0 ? "0 photos" : n === 1 ? "1 photo" : n <= 3 ? "2–3 photos" : n <= 5 ? "4–5 photos" : "6+ photos";
    map.set(label, (map.get(label) ?? 0) + 1);
  }
  return keys.map((label) => ({ label, count: map.get(label) ?? 0 }));
}

