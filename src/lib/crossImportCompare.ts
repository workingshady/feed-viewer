import { listingChangedKeysFull } from "@/lib/importAnalysis";
import type { Listing } from "@/lib/types";

export function normalizeReference(ref: string): string {
  return ref.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

/** Collapse punctuation for fuzzy title/address matching. */
export function normalizeFuzzyText(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u00C0-\u024F]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Buckets price into a coarse band (~2.5% or a minimum step) so minor edits still match across feeds.
 */
export function priceBandKey(price: number, currency: string): string {
  const c = (currency || "").trim().toUpperCase() || "?";
  if (!Number.isFinite(price) || price <= 0) return `${c}|noprice`;
  const minStep = price >= 1_000_000 ? 25_000 : price >= 100_000 ? 5_000 : 1_000;
  const step = Math.max(minStep, Math.round(price * 0.025));
  const band = Math.round(price / step) * step;
  return `${c}|${band}`;
}

/**
 * Wider price buckets (~6% or larger minimum step) for “near duplicate” cross-feed matching
 * when agencies tweak asking price slightly.
 */
export function priceBandKeyLoose(price: number, currency: string): string {
  const c = (currency || "").trim().toUpperCase() || "?";
  if (!Number.isFinite(price) || price <= 0) return `${c}|noprice`;
  const minStep = price >= 1_000_000 ? 100_000 : price >= 100_000 ? 25_000 : 5_000;
  const step = Math.max(minStep, Math.round(price * 0.06));
  const band = Math.round(price / step) * step;
  return `${c}|${band}`;
}

/**
 * Fuzzy identity: normalized location text + title + price band (not reference).
 * Use for “same property, different ref” and cross-import pairing when refs disagree.
 */
export function fuzzyListingKey(l: Listing): string {
  return crossFeedFuzzyKey(l, "strict");
}

/**
 * Cross-feed fuzzy identity: location + title + price band (strict or loose).
 * Used after reference/permit pairing for “same property, different ref” cases.
 */
export function crossFeedFuzzyKey(l: Listing, band: "strict" | "loose"): string {
  const loc = normalizeFuzzyText([l.address, l.subCommunity, l.community, l.city].filter(Boolean).join(", "));
  const title = normalizeFuzzyText(l.title || "");
  const titleKey = title.slice(0, 96);
  const pb = band === "loose" ? priceBandKeyLoose(l.price, l.currency) : priceBandKey(l.price, l.currency);
  return `${pb}|${loc.slice(0, 160)}|${titleKey}`;
}

export function referenceMatchKey(l: Listing): string | null {
  const r = normalizeReference(l.reference || "");
  if (r.length > 0) return r;
  return null;
}

/** Government / Trakheesi-style permit when both feeds publish it but references differ. */
export function permitMatchKey(l: Listing): string | null {
  const p = normalizeReference(l.permitNumber || "");
  if (p.length < 2) return null;
  return p;
}

export type WithinFeedDuplicateGroupKind = "exact_reference" | "fuzzy";

export type WithinFeedDuplicateGroup = {
  kind: WithinFeedDuplicateGroupKind;
  key: string;
  listings: Listing[];
};

export type WithinFeedDuplicateReport = {
  exactReferenceGroups: WithinFeedDuplicateGroup[];
  fuzzyGroups: WithinFeedDuplicateGroup[];
};

/** Duplicates inside a single feed: same reference, and same fuzzy signature with different references. */
export function analyzeWithinFeedDuplicates(listings: Listing[]): WithinFeedDuplicateReport {
  const byRef = new Map<string, Listing[]>();
  for (const l of listings) {
    const k = referenceMatchKey(l);
    if (!k) continue;
    const arr = byRef.get(k) ?? [];
    arr.push(l);
    byRef.set(k, arr);
  }
  const exactReferenceGroups: WithinFeedDuplicateGroup[] = [];
  for (const [key, arr] of byRef.entries()) {
    if (arr.length > 1) exactReferenceGroups.push({ kind: "exact_reference", key, listings: arr });
  }
  exactReferenceGroups.sort((a, b) => b.listings.length - a.listings.length || a.key.localeCompare(b.key));

  const byFuzzy = new Map<string, Listing[]>();
  for (const l of listings) {
    const fk = fuzzyListingKey(l);
    const arr = byFuzzy.get(fk) ?? [];
    arr.push(l);
    byFuzzy.set(fk, arr);
  }
  const fuzzyGroups: WithinFeedDuplicateGroup[] = [];
  for (const [key, arr] of byFuzzy.entries()) {
    if (arr.length < 2) continue;
    const firstRef = normalizeReference(arr[0]?.reference || "");
    const allSameNonEmptyRef =
      Boolean(firstRef) && arr.every((x) => normalizeReference(x.reference || "") === firstRef);
    if (allSameNonEmptyRef) {
      // Same reference repeated: already surfaced under exact reference groups
      continue;
    }
    fuzzyGroups.push({ kind: "fuzzy", key, listings: arr });
  }
  fuzzyGroups.sort((a, b) => b.listings.length - a.listings.length || a.key.localeCompare(b.key));

  return { exactReferenceGroups, fuzzyGroups };
}

export type CrossMatchKind = "reference" | "permit" | "fuzzy" | "fuzzy_loose";

export type CrossImportPair = {
  kind: CrossMatchKind;
  listingA: Listing;
  listingB: Listing;
  changedKeys: (keyof Listing)[];
};

export type CrossImportCompareOptions = {
  /** Pair rows with the same normalized permit / Trakheesi id (after reference pass). Default true. */
  matchPermit: boolean;
  /** Price band inside fuzzy key: strict (~2.5%) or loose (~6%). Default strict. */
  fuzzyPriceBand: "strict" | "loose";
  /**
   * When fuzzyPriceBand is strict, run a second fuzzy pass with loose price bands on leftovers.
   * Catches listings where price moved between exports. Default true.
   */
  looseFuzzySecondPass: boolean;
};

const DEFAULT_CROSS_IMPORT_OPTIONS: CrossImportCompareOptions = {
  matchPermit: true,
  fuzzyPriceBand: "strict",
  looseFuzzySecondPass: true,
};

export type CrossImportAmbiguous = {
  fuzzyKey: string;
  listingsA: Listing[];
  listingsB: Listing[];
};

export type CrossImportResult = {
  labelA: string;
  labelB: string;
  summary: {
    countA: number;
    countB: number;
    matchedByReference: number;
    matchedByPermit: number;
    matchedByFuzzy: number;
    matchedByFuzzyLoose: number;
    unchangedCount: number;
    changedCount: number;
    onlyInA: number;
    onlyInB: number;
    ambiguousFuzzyClusters: number;
  };
  pairs: CrossImportPair[];
  onlyInA: Listing[];
  onlyInB: Listing[];
  ambiguousFuzzy: CrossImportAmbiguous[];
  withinA: WithinFeedDuplicateReport;
  withinB: WithinFeedDuplicateReport;
};

function pushMulti<K, V>(map: Map<K, V[]>, key: K, val: V) {
  const arr = map.get(key) ?? [];
  arr.push(val);
  map.set(key, arr);
}

function pairByScalarKey(
  listingsA: Listing[],
  listingsB: Listing[],
  pairedA: Set<Listing>,
  pairedB: Set<Listing>,
  pairs: CrossImportPair[],
  getKey: (l: Listing) => string | null,
  kind: CrossImportPair["kind"],
): void {
  const byA = new Map<string, Listing[]>();
  const byB = new Map<string, Listing[]>();
  for (const l of listingsA) {
    if (pairedA.has(l)) continue;
    const k = getKey(l);
    if (k) pushMulti(byA, k, l);
  }
  for (const l of listingsB) {
    if (pairedB.has(l)) continue;
    const k = getKey(l);
    if (k) pushMulti(byB, k, l);
  }
  const keys = new Set<string>([...byA.keys(), ...byB.keys()]);
  for (const key of keys) {
    const aArr = byA.get(key) ?? [];
    const bArr = byB.get(key) ?? [];
    const n = Math.min(aArr.length, bArr.length);
    for (let i = 0; i < n; i++) {
      const la = aArr[i]!;
      const lb = bArr[i]!;
      pairedA.add(la);
      pairedB.add(lb);
      pairs.push({ kind, listingA: la, listingB: lb, changedKeys: listingChangedKeysFull(la, lb) });
    }
  }
}

function pairByFuzzyPass(
  listingsA: Listing[],
  listingsB: Listing[],
  pairedA: Set<Listing>,
  pairedB: Set<Listing>,
  pairs: CrossImportPair[],
  band: "strict" | "loose",
  pairKind: CrossImportPair["kind"],
): CrossImportAmbiguous[] {
  const unpairedA = listingsA.filter((l) => !pairedA.has(l));
  const unpairedB = listingsB.filter((l) => !pairedB.has(l));

  const fuzzyA = new Map<string, Listing[]>();
  const fuzzyB = new Map<string, Listing[]>();
  for (const l of unpairedA) pushMulti(fuzzyA, crossFeedFuzzyKey(l, band), l);
  for (const l of unpairedB) pushMulti(fuzzyB, crossFeedFuzzyKey(l, band), l);

  const ambiguousFuzzy: CrossImportAmbiguous[] = [];
  const fuzzyKeys = new Set<string>([...fuzzyA.keys(), ...fuzzyB.keys()]);

  for (const fk of fuzzyKeys) {
    const aArr = fuzzyA.get(fk) ?? [];
    const bArr = fuzzyB.get(fk) ?? [];
    if (aArr.length === 0 || bArr.length === 0) continue;
    if (aArr.length === 1 && bArr.length === 1) {
      const la = aArr[0]!;
      const lb = bArr[0]!;
      pairedA.add(la);
      pairedB.add(lb);
      pairs.push({
        kind: pairKind,
        listingA: la,
        listingB: lb,
        changedKeys: listingChangedKeysFull(la, lb),
      });
    } else {
      ambiguousFuzzy.push({ fuzzyKey: fk, listingsA: aArr, listingsB: bArr });
    }
  }
  return ambiguousFuzzy;
}

/**
 * Compare two parsed listing sets (e.g. two XMLs or two import snapshots).
 * Order: normalized reference → permit (optional) → fuzzy (location + title + price band) → optional loose fuzzy pass.
 */
export function compareCrossImportFeeds(
  listingsA: Listing[],
  listingsB: Listing[],
  labels?: { a?: string; b?: string },
  options?: Partial<CrossImportCompareOptions>,
): CrossImportResult {
  const labelA = labels?.a ?? "Feed A";
  const labelB = labels?.b ?? "Feed B";
  const opts: CrossImportCompareOptions = { ...DEFAULT_CROSS_IMPORT_OPTIONS, ...options };

  const pairedA = new Set<Listing>();
  const pairedB = new Set<Listing>();
  const pairs: CrossImportPair[] = [];

  const byRefA = new Map<string, Listing[]>();
  const byRefB = new Map<string, Listing[]>();
  for (const l of listingsA) {
    const k = referenceMatchKey(l);
    if (k) pushMulti(byRefA, k, l);
  }
  for (const l of listingsB) {
    const k = referenceMatchKey(l);
    if (k) pushMulti(byRefB, k, l);
  }

  const allRefs = new Set<string>([...byRefA.keys(), ...byRefB.keys()]);
  for (const ref of allRefs) {
    const aArr = byRefA.get(ref) ?? [];
    const bArr = byRefB.get(ref) ?? [];
    const n = Math.min(aArr.length, bArr.length);
    for (let i = 0; i < n; i++) {
      const la = aArr[i]!;
      const lb = bArr[i]!;
      pairedA.add(la);
      pairedB.add(lb);
      const ck = listingChangedKeysFull(la, lb);
      pairs.push({ kind: "reference", listingA: la, listingB: lb, changedKeys: ck });
    }
  }

  if (opts.matchPermit) {
    pairByScalarKey(listingsA, listingsB, pairedA, pairedB, pairs, permitMatchKey, "permit");
  }

  const ambiguousFuzzy: CrossImportAmbiguous[] = [];
  const fuzzyBand = opts.fuzzyPriceBand;
  ambiguousFuzzy.push(
    ...pairByFuzzyPass(listingsA, listingsB, pairedA, pairedB, pairs, fuzzyBand, "fuzzy"),
  );

  if (fuzzyBand === "strict" && opts.looseFuzzySecondPass) {
    ambiguousFuzzy.push(
      ...pairByFuzzyPass(listingsA, listingsB, pairedA, pairedB, pairs, "loose", "fuzzy_loose"),
    );
  }

  const onlyInA = listingsA.filter((l) => !pairedA.has(l));
  const onlyInB = listingsB.filter((l) => !pairedB.has(l));

  let matchedByReference = 0;
  let matchedByPermit = 0;
  let matchedByFuzzy = 0;
  let matchedByFuzzyLoose = 0;
  let unchangedCount = 0;
  let changedCount = 0;
  for (const p of pairs) {
    if (p.kind === "reference") matchedByReference++;
    else if (p.kind === "permit") matchedByPermit++;
    else if (p.kind === "fuzzy") matchedByFuzzy++;
    else if (p.kind === "fuzzy_loose") matchedByFuzzyLoose++;
    if (p.changedKeys.length === 0) unchangedCount++;
    else changedCount++;
  }

  return {
    labelA,
    labelB,
    summary: {
      countA: listingsA.length,
      countB: listingsB.length,
      matchedByReference,
      matchedByPermit,
      matchedByFuzzy,
      matchedByFuzzyLoose,
      unchangedCount,
      changedCount,
      onlyInA: onlyInA.length,
      onlyInB: onlyInB.length,
      ambiguousFuzzyClusters: ambiguousFuzzy.length,
    },
    pairs,
    onlyInA,
    onlyInB,
    ambiguousFuzzy,
    withinA: analyzeWithinFeedDuplicates(listingsA),
    withinB: analyzeWithinFeedDuplicates(listingsB),
  };
}

export function crossImportPairKindLabel(kind: CrossMatchKind): string {
  switch (kind) {
    case "reference":
      return "Reference";
    case "permit":
      return "Permit";
    case "fuzzy_loose":
      return "Fuzzy (loose price)";
    case "fuzzy":
    default:
      return "Fuzzy";
  }
}

export function crossImportPairKindBadgeVariant(kind: CrossMatchKind): "default" | "secondary" {
  return kind === "reference" || kind === "permit" ? "default" : "secondary";
}

export type ListingCriteriaMetrics = {
  images: number;
  amenities: number;
  descriptionChars: number;
  titleChars: number;
  rawXmlChars: number;
};

export function getListingCriteriaMetrics(l: Listing): ListingCriteriaMetrics {
  return {
    images: l.images?.length ?? 0,
    amenities: l.amenities?.length ?? 0,
    descriptionChars: (l.description || "").length,
    titleChars: (l.title || "").length,
    rawXmlChars: (l.rawXml || "").length,
  };
}

export function formatListingFieldForDiff(l: Listing, key: keyof Listing): string {
  const v = (l as unknown as Record<string, unknown>)[key as string];
  if (key === "rawXml") {
    const s = typeof v === "string" ? v : "";
    if (!s.length) return "—";
    const head = s.length > 400 ? `${s.slice(0, 400)}…` : s;
    return `[${s.length} chars]\n${head}`;
  }
  if (v == null) return "—";
  if (typeof v === "object" && v !== null && !Array.isArray(v)) {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  if (Array.isArray(v)) return v.length ? v.join(" · ") : "—";
  if (typeof v === "number" && key === "price") return Number.isFinite(v) ? String(v) : "—";
  return String(v);
}
