import { canonicalListingDedupeKey } from "@/lib/listingDedupe";
import { normalizeFuzzyText, priceBandKey, priceBandKeyLoose } from "@/lib/crossImportCompare";
import type { Listing } from "@/lib/types";

export type TaggedListing = {
  listing: Listing;
  agencyName: string;
  sessionId: string;
};

export type CrossAgencyMatchTier =
  | "permit"
  | "geo"
  | "geo_wide"
  | "image"
  | "building"
  | "layout"
  /** Normalized title + description slice + price band + rooms + location (strictest content tier). */
  | "content"
  /** Same as content but description is excluded — title + price + rooms + location + type. */
  | "content_no_desc"
  /** Coarser title prefix, loose price band, 2 dp geo — “close” not identical copy. */
  | "content_near"
  | "fuzzy";

export type CrossAgencyCluster = {
  tier: CrossAgencyMatchTier;
  /** Grouping key (normalized permit, "lat,lng", or fuzzy key). */
  matchKey: string;
  /** Human-readable explanation. */
  matchLabel: string;
  confidence: "high" | "medium" | "medium_low" | "review";
  items: TaggedListing[];
  /** Distinct agency names in this cluster. */
  agencies: string[];
};

export type CrossAgencyDuplicateReport = {
  taggedCount: number;
  agencyCount: number;
  permitClusters: CrossAgencyCluster[];
  geoClusters: CrossAgencyCluster[];
  /** Same map area ~111 m buckets (more hits, more false positives). */
  geoWideClusters: CrossAgencyCluster[];
  /** Same normalized first-image URL (often same CDN file across portals). */
  imageUrlClusters: CrossAgencyCluster[];
  /** Same development/building name + area + beds/baths + listing type. */
  buildingClusters: CrossAgencyCluster[];
  /** Property type + purpose + beds/baths + coarse area + location (no title). */
  layoutClusters: CrossAgencyCluster[];
  /**
   * Same normalized title + description + price band + rooms + location fingerprint (no agency).
   * Catches portals that paste identical copy without shared permit/refs.
   */
  contentClusters: CrossAgencyCluster[];
  /** Title + facts only — description excluded (agencies often rewrite body copy). */
  contentNoDescClusters: CrossAgencyCluster[];
  /** Near-duplicate: coarser title, wider price band, 2 dp map; no description. */
  contentNearClusters: CrossAgencyCluster[];
  fuzzyClusters: CrossAgencyCluster[];
};

/** RERA / permit style IDs: strip noise, uppercase. */
export function normalizePermitNumber(raw: string): string {
  return (raw || "").replace(/[\s\-_./,:;]+/g, "").toUpperCase();
}

function isValidGeo(lat: number | null, lng: number | null): boolean {
  if (lat == null || lng == null) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) < 1e-5 && Math.abs(lng) < 1e-5) return false;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  return true;
}

function fnv1aContentKey(prefix: string, parts: string[]): string {
  let h = 2166136261;
  const s = parts.join("\u241e");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${prefix}${(h >>> 0).toString(16)}`;
}

function contentGeo3dp(l: Listing): string {
  if (!isValidGeo(l.latitude, l.longitude)) return "";
  return `${l.latitude!.toFixed(3)},${l.longitude!.toFixed(3)}`;
}

function contentGeo2dp(l: Listing): string {
  if (!isValidGeo(l.latitude, l.longitude)) return "";
  return `${l.latitude!.toFixed(2)},${l.longitude!.toFixed(2)}`;
}

/**
 * Cross-agency “duplicate by content” key: FNV-1a hash of normalized title/headline/description,
 * price band, purpose, rooms, property type, location, and optional permit/geo — **excludes agency**.
 */
export function crossAgencyContentMatchKey(l: Listing): string | null {
  const title = normalizeFuzzyText(l.title || "");
  const desc = normalizeFuzzyText((l.description || "").slice(0, 220));
  if (title.length < 8 && desc.length < 24) return null;
  const loc = normalizeFuzzyText([l.address, l.subCommunity, l.community, l.city].filter(Boolean).join(", "));
  const pb = priceBandKey(l.price, l.currency);
  const purpose = l.purpose === "rent" ? "rent" : l.purpose === "sale" ? "sale" : "unk";
  const beds = Number.isFinite(l.beds) && l.beds > 0 ? String(l.beds) : "0";
  const baths = Number.isFinite(l.baths) && l.baths > 0 ? String(l.baths) : "0";
  const ptype = normalizeFuzzyText(l.propertyType || "").slice(0, 36);
  const permit = normalizePermitNumber(l.permitNumber || "");
  const permitPart = permit.length >= 4 ? permit : "";
  const geo = contentGeo3dp(l);
  const parts = [pb, purpose, beds, baths, ptype, title.slice(0, 100), desc.slice(0, 180), loc.slice(0, 120), permitPart, geo];
  return fnv1aContentKey("cnt:", parts);
}

/**
 * Same fingerprint as full content match but **description is omitted** — matches when titles and
 * facts align even if marketing copy was rewritten.
 */
export function crossAgencyContentMatchKeyNoDesc(l: Listing): string | null {
  const title = normalizeFuzzyText(l.title || "");
  const loc = normalizeFuzzyText([l.address, l.subCommunity, l.community, l.city].filter(Boolean).join(", "));
  if (title.length < 10 && loc.length < 12) return null;
  const pb = priceBandKey(l.price, l.currency);
  const purpose = l.purpose === "rent" ? "rent" : l.purpose === "sale" ? "sale" : "unk";
  const beds = Number.isFinite(l.beds) && l.beds > 0 ? String(l.beds) : "0";
  const baths = Number.isFinite(l.baths) && l.baths > 0 ? String(l.baths) : "0";
  const ptype = normalizeFuzzyText(l.propertyType || "").slice(0, 36);
  const permit = normalizePermitNumber(l.permitNumber || "");
  const permitPart = permit.length >= 4 ? permit : "";
  const geo = contentGeo3dp(l);
  const parts = [pb, purpose, beds, baths, ptype, title.slice(0, 100), loc.slice(0, 120), permitPart, geo];
  return fnv1aContentKey("cntnd:", parts);
}

/**
 * “Near” duplicate: loose price band, short title prefix, coarse location blob, 2 dp geo — no description.
 * Catches same unit with tweaked price or slightly different wording in the title.
 */
export function crossAgencyContentNearMatchKey(l: Listing): string | null {
  const title = normalizeFuzzyText(l.title || "");
  const loc = normalizeFuzzyText([l.address, l.subCommunity, l.community, l.city].filter(Boolean).join(", "));
  if (title.length < 6 || loc.length < 6) return null;
  const pb = priceBandKeyLoose(l.price, l.currency);
  const purpose = l.purpose === "rent" ? "rent" : l.purpose === "sale" ? "sale" : "unk";
  const beds = Number.isFinite(l.beds) && l.beds > 0 ? String(l.beds) : "0";
  const baths = Number.isFinite(l.baths) && l.baths > 0 ? String(l.baths) : "0";
  const ptype = normalizeFuzzyText(l.propertyType || "").slice(0, 24);
  const titleShort = title.slice(0, 48);
  const locShort = loc.slice(0, 80);
  const geo = contentGeo2dp(l);
  const parts = [pb, purpose, beds, baths, ptype, titleShort, locShort, geo];
  return fnv1aContentKey("cntnr:", parts);
}

function pushMulti<K, V>(map: Map<K, V[]>, key: K, val: V) {
  const arr = map.get(key) ?? [];
  arr.push(val);
  map.set(key, arr);
}

/**
 * One row per (agencyName, listing.id), newest session wins (pass sessions newest-first).
 * Stream sessions may hold multiple brands: use `listing.sourceAgency` when set.
 */
export function dedupeTaggedListings(
  sessions: { sessionId: string; fileName?: string; listings: Listing[]; agencyName: string }[],
): TaggedListing[] {
  const map = new Map<string, TaggedListing>();
  for (const s of sessions) {
    const isStream = s.fileName?.includes("(stream)");
    for (const listing of s.listings) {
      const ag =
        isStream && listing.sourceAgency?.trim() ? listing.sourceAgency.trim() : s.agencyName;
      const bKey = ag.replace(/\s+/g, " ").trim() || "Unknown agency";
      const canon = canonicalListingDedupeKey(listing, bKey);
      const k = `${bKey}\0${canon}`;
      if (!map.has(k)) {
        map.set(k, { listing, agencyName: bKey, sessionId: s.sessionId });
      }
    }
  }
  return Array.from(map.values());
}

/** Add current workspace listings under active agency without duplicating session snapshots. */
export function mergeWorkspaceIntoTagged(
  tagged: TaggedListing[],
  workspaceListings: Listing[],
  workspaceAgencyName: string | null | undefined,
): TaggedListing[] {
  const map = new Map<string, TaggedListing>();
  for (const t of tagged) {
    map.set(`${t.agencyName}\0${t.listing.id}`, t);
  }
  const ag = (workspaceAgencyName || "").trim();
  if (!ag || !workspaceListings.length) return tagged;
  const bKey = ag.replace(/\s+/g, " ").trim();
  for (const listing of workspaceListings) {
    const k = `${bKey}\0${canonicalListingDedupeKey(listing, bKey)}`;
    if (!map.has(k)) {
      map.set(k, { listing, agencyName: bKey, sessionId: "workspace" });
    }
  }
  return Array.from(map.values());
}

function distinctAgencies(items: TaggedListing[]): string[] {
  return [...new Set(items.map((t) => t.agencyName))].sort((a, b) => a.localeCompare(b));
}

/** ~11 m precision — same tower/unit pin often identical across portals. */
export function geoClusterKey(lat: number | null, lng: number | null): string | null {
  if (!isValidGeo(lat, lng)) return null;
  return `${lat!.toFixed(4)},${lng!.toFixed(4)}`;
}

/** ~111 m precision — same district / coarse tower area. */
export function geoWideClusterKey(lat: number | null, lng: number | null): string | null {
  if (!isValidGeo(lat, lng)) return null;
  return `${lat!.toFixed(3)},${lng!.toFixed(3)}`;
}

/** Normalize listing photo URL for cross-feed matching (origin + path, no query). */
export function normalizeListingImageUrl(raw: string): string | null {
  const u = (raw || "").trim();
  if (!u || !/^https?:\/\//i.test(u)) return null;
  try {
    const parsed = new URL(u);
    const path = parsed.pathname.replace(/\/+$/, "").toLowerCase();
    const out = `${parsed.origin.toLowerCase()}${path}`;
    return out.length >= 24 ? out : null;
  } catch {
    const noQuery = u.split("?")[0]?.trim().toLowerCase() ?? "";
    return noQuery.length >= 24 ? noQuery : null;
  }
}

export function primaryImageMatchKey(l: Listing): string | null {
  const first = l.images?.[0];
  return first ? normalizeListingImageUrl(first) : null;
}

/**
 * Same building / development line on the portal: name + community + listing type + beds/baths.
 */
export function buildingSignatureKey(l: Listing): string | null {
  const name = normalizeFuzzyText(l.propertyName || "");
  if (name.length < 4) return null;
  const area = normalizeFuzzyText([l.subCommunity, l.community, l.city].filter(Boolean).join(" "));
  const purpose = l.purpose === "rent" ? "rent" : l.purpose === "sale" ? "sale" : "unk";
  const beds = Number.isFinite(l.beds) && l.beds > 0 ? String(l.beds) : "0";
  const baths = Number.isFinite(l.baths) && l.baths > 0 ? String(l.baths) : "0";
  const ptype = normalizeFuzzyText(l.propertyType || "").slice(0, 32);
  return `bld|${purpose}|${beds}br|${baths}ba|${ptype}|${name.slice(0, 80)}|${area.slice(0, 100)}`;
}

function areaCoarseBand(area: number): string {
  if (!Number.isFinite(area) || area <= 0) return "0";
  const step = area >= 5000 ? 500 : area >= 1000 ? 100 : 50;
  return String(Math.round(area / step) * step);
}

/**
 * Layout / inventory signature without title (price changes, rewrites).
 */
export function layoutSignatureKey(l: Listing): string | null {
  const loc = normalizeFuzzyText([l.address, l.subCommunity, l.community, l.city].filter(Boolean).join(", "));
  if (loc.length < 8) return null;
  const purpose = l.purpose === "rent" ? "rent" : l.purpose === "sale" ? "sale" : "unk";
  const beds = Number.isFinite(l.beds) && l.beds > 0 ? String(l.beds) : "0";
  const baths = Number.isFinite(l.baths) && l.baths > 0 ? String(l.baths) : "0";
  const ptype = normalizeFuzzyText(l.propertyType || "").slice(0, 36);
  const ab = areaCoarseBand(l.area);
  const unit = (l.areaUnit || "").trim().toLowerCase().slice(0, 8) || "sqft";
  return `lay|${purpose}|${beds}br|${baths}ba|${ptype}|a${ab}${unit}|${loc.slice(0, 120)}`;
}

/**
 * Stricter than single-feed fuzzy: same price band + location blob + **title similarity**
 * so different units in the same building are less likely to cluster unless titles align.
 */
export function crossAgencyFuzzyKey(l: Listing): string {
  const loc = normalizeFuzzyText([l.address, l.subCommunity, l.community, l.city].filter(Boolean).join(", "));
  const title = normalizeFuzzyText(l.title || "");
  const titleKey = title.slice(0, 72);
  const pb = priceBandKey(l.price, l.currency);
  const beds = Number.isFinite(l.beds) && l.beds > 0 ? String(l.beds) : "0";
  return `${pb}|bed${beds}|${loc.slice(0, 140)}|${titleKey}`;
}

function clusterCrossAgency(
  tagged: TaggedListing[],
  getKey: (l: Listing) => string | null,
  tier: CrossAgencyMatchTier,
  confidence: CrossAgencyCluster["confidence"],
  labelForKey: (key: string) => string,
): CrossAgencyCluster[] {
  const map = new Map<string, TaggedListing[]>();
  for (const t of tagged) {
    const key = getKey(t.listing);
    if (!key || key.length < 2) continue;
    pushMulti(map, key, t);
  }
  const out: CrossAgencyCluster[] = [];
  for (const [matchKey, items] of map.entries()) {
    if (items.length < 2) continue;
    const agencies = distinctAgencies(items);
    if (agencies.length < 2) continue;
    out.push({
      tier,
      matchKey,
      matchLabel: labelForKey(matchKey),
      confidence,
      items,
      agencies,
    });
  }
  out.sort((a, b) => b.agencies.length - a.agencies.length || b.items.length - a.items.length);
  return out;
}

/**
 * Find the same physical listing marketed by different agencies (e.g. Aston vs Exclusive).
 * Uses permit number (strongest), then coordinates, then tightened fuzzy signature.
 */
export function analyzeCrossAgencyDuplicates(tagged: TaggedListing[]): CrossAgencyDuplicateReport {
  const agencyCount = new Set(tagged.map((t) => t.agencyName)).size;

  const permitClusters = clusterCrossAgency(
    tagged,
    (l) => {
      const p = normalizePermitNumber(l.permitNumber || "");
      return p.length >= 4 ? p : null;
    },
    "permit",
    "high",
    (k) => `Permit / RERA ref: ${k}`,
  );

  const geoClusters = clusterCrossAgency(
    tagged,
    (l) => geoClusterKey(l.latitude, l.longitude),
    "geo",
    "medium",
    (k) => `Coordinates (4dp): ${k}`,
  );

  const fuzzyClusters = clusterCrossAgency(
    tagged,
    (l) => {
      const fk = crossAgencyFuzzyKey(l);
      return fk.length > 12 ? fk : null;
    },
    "fuzzy",
    "review",
    () => `Fuzzy: price + beds + location + title`,
  );

  const geoWideClusters = clusterCrossAgency(
    tagged,
    (l) => geoWideClusterKey(l.latitude, l.longitude),
    "geo_wide",
    "medium_low",
    (k) => `Wider map grid (3 dp): ${k}`,
  );

  const imageUrlClusters = clusterCrossAgency(
    tagged,
    (l) => primaryImageMatchKey(l),
    "image",
    "high",
    () => `Same primary photo URL (normalized)`,
  );

  const buildingClusters = clusterCrossAgency(
    tagged,
    (l) => buildingSignatureKey(l),
    "building",
    "medium_low",
    () => `Same building + listing type + beds/baths + area context`,
  );

  const layoutClusters = clusterCrossAgency(
    tagged,
    (l) => layoutSignatureKey(l),
    "layout",
    "review",
    () => `Layout: type + purpose + rooms + coarse area + location (no title)`,
  );

  const contentClusters = clusterCrossAgency(
    tagged,
    (l) => crossAgencyContentMatchKey(l),
    "content",
    "review",
    (k) => `Duplicate by content (full copy): ${k.slice(0, 20)}…`,
  );

  const contentNoDescClusters = clusterCrossAgency(
    tagged,
    (l) => crossAgencyContentMatchKeyNoDesc(l),
    "content_no_desc",
    "review",
    (k) => `Duplicate by content (no description): ${k.slice(0, 20)}…`,
  );

  const contentNearClusters = clusterCrossAgency(
    tagged,
    (l) => crossAgencyContentNearMatchKey(l),
    "content_near",
    "medium_low",
    (k) => `Near-duplicate by content: ${k.slice(0, 20)}…`,
  );

  return {
    taggedCount: tagged.length,
    agencyCount,
    permitClusters,
    geoClusters,
    geoWideClusters,
    imageUrlClusters,
    buildingClusters,
    layoutClusters,
    contentClusters,
    contentNoDescClusters,
    contentNearClusters,
    fuzzyClusters,
  };
}
