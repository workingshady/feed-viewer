import type {
  FieldMapping,
  ImportConflictsSummary,
  ImportDiffSummary,
  ImportListingDiff,
  ImportListingStatus,
  ImportResult,
  ImportSession,
  Listing,
  MappingConflict,
} from "@/lib/types";
import { UI_FIELDS } from "@/lib/types";

/** Key for `ImportSession.listingDiffById` — matches analysis (`id` with `reference` fallback). */
export function importListingDiffKey(l: Pick<Listing, "id" | "reference">): string {
  return l.id || l.reference;
}

function stableListingKey(l: Listing): string {
  return importListingDiffKey(l);
}

/** Text: trimmed, inner whitespace collapsed; numbers: rounded to cents; empty/null/NaN → "". */
function normalizeScalar(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(Math.round(v * 100) / 100) : "";
  if (typeof v === "boolean") return String(v);
  if (typeof v === "string") return v.replace(/\s+/g, " ").trim();
  return JSON.stringify(v);
}

/** Photo/media URL without query string or fragment (CDNs add cache-busting params). */
const normalizeUrl = (u: unknown) => normalizeScalar(u).replace(/[?#].*$/, "");

const setEq = (a: unknown[] = [], b: unknown[] = [], norm: (v: unknown) => string) => {
  const x = new Set(a.map(norm).filter(Boolean));
  const y = new Set(b.map(norm).filter(Boolean));
  if (x.size !== y.size) return false;
  for (const v of x) if (!y.has(v)) return false;
  return true;
};

const digits = (v: unknown) => normalizeScalar(v).replace(/\D+/g, "");
const lower = (v: unknown) => normalizeScalar(v).toLowerCase();

type AgentLike = Partial<Listing["agent"]> | undefined;
/** Agents match on identity fields; extra fields present on only one side (newer parser) don't count. */
function agentEq(a: AgentLike, b: AgentLike): boolean {
  const pairs: [unknown, unknown, (v: unknown) => string][] = [
    [a?.name, b?.name, lower],
    [a?.email, b?.email, lower],
    [a?.phone, b?.phone, digits],
    [a?.photo, b?.photo, normalizeUrl],
    [a?.licenseNo, b?.licenseNo, lower],
  ];
  return pairs.every(([x, y, norm]) => {
    const nx = norm(x);
    const ny = norm(y);
    // A field missing entirely (older parser) is unknown, not a change.
    return nx === ny || x === undefined || y === undefined;
  });
}

/** Field-aware equality used by every listing diff. */
function fieldEq(key: keyof Listing, a: unknown, b: unknown): boolean {
  switch (key) {
    case "reference":
      // Matching already ignores case and spaces in references; so does the comparison.
      return lower(a).replace(/\s+/g, "") === lower(b).replace(/\s+/g, "");
    case "images":
      return setEq(a as unknown[], b as unknown[], normalizeUrl);
    case "amenities":
      return setEq(a as unknown[], b as unknown[], lower);
    case "agent":
      return agentEq(a as AgentLike, b as AgentLike);
    case "latitude":
    case "longitude":
      // ~1 m tolerance; feeds re-round coordinates between exports.
      return a == null || b == null ? normalizeScalar(a) === normalizeScalar(b) : Math.abs(Number(a) - Number(b)) < 1e-5;
    case "view360":
    case "videoTourUrl":
    case "floorPlanUrl":
      return normalizeUrl(a) === normalizeUrl(b);
    default:
      if (Array.isArray(a) || Array.isArray(b)) return setEq((a as unknown[]) ?? [], (b as unknown[]) ?? [], normalizeScalar);
      return normalizeScalar(a) === normalizeScalar(b);
  }
}

/** Fields that change on every export; reported, but alone they don't make a listing "changed". */
export const NOISE_ONLY_KEYS: ReadonlySet<keyof Listing> = new Set<keyof Listing>(["lastUpdate"]);

function changedKeysFor(prev: Listing, next: Listing, keys: readonly (keyof Listing)[]): (keyof Listing)[] {
  const out: (keyof Listing)[] = [];
  for (const k of keys) {
    if (!fieldEq(k, (prev as never)[k], (next as never)[k])) out.push(k);
  }
  return out.every((k) => NOISE_ONLY_KEYS.has(k)) ? [] : out;
}

/**
 * Broad field set for import sessions and feed-compare: mapped listing fields except `id` and `rawXml`.
 */
export const FULL_LISTING_DIFF_KEYS: readonly (keyof Listing)[] = [
  "reference",
  "title",
  "description",
  "price",
  "priceOnApplication",
  "currency",
  "paymentMethod",
  "downPaymentPrice",
  "serviceCharge",
  "cheques",
  "purpose",
  "propertyType",
  "beds",
  "baths",
  "area",
  "areaUnit",
  "plotSize",
  "community",
  "city",
  "address",
  "subCommunity",
  "propertyName",
  "developer",
  "buildYear",
  "floor",
  "stories",
  "latitude",
  "longitude",
  "images",
  "amenities",
  "view360",
  "videoTourUrl",
  "floorPlanUrl",
  "agent",
  "furnished",
  "parking",
  "completionStatus",
  "permitNumber",
  "lastUpdate",
] as const;

/** Keys considered for import / cross-feed content diffs (excludes rawXml). */
export const LISTING_DIFF_KEYS: readonly (keyof Listing)[] = FULL_LISTING_DIFF_KEYS;

/** Import session "updated" detection uses the same broad field set as feed compare (excludes rawXml). */
function changedKeys(prev: Listing, next: Listing): (keyof Listing)[] {
  return changedKeysFor(prev, next, FULL_LISTING_DIFF_KEYS);
}

export function listingChangedKeys(prev: Listing, next: Listing): (keyof Listing)[] {
  return changedKeysFor(prev, next, FULL_LISTING_DIFF_KEYS);
}

export function listingChangedKeysFull(prev: Listing, next: Listing): (keyof Listing)[] {
  return changedKeysFor(prev, next, FULL_LISTING_DIFF_KEYS);
}

/** Full compare table including raw XML snippet (feed compare UI only). */
export const ALL_LISTING_DISPLAY_KEYS: readonly (keyof Listing)[] = [...FULL_LISTING_DIFF_KEYS, "rawXml"];

export function computeMappingConflicts(mappings: FieldMapping[] | undefined): MappingConflict[] {
  if (!mappings?.length) return [];
  const byField = new Map<keyof Listing, string[]>();
  for (const m of mappings) {
    if (!m.uiField) continue;
    const key = m.uiField as keyof Listing;
    const arr = byField.get(key) ?? [];
    arr.push(m.xmlPath);
    byField.set(key, arr);
  }
  const conflicts: MappingConflict[] = [];
  for (const [uiField, xmlPaths] of byField.entries()) {
    if (xmlPaths.length > 1) conflicts.push({ uiField, xmlPaths });
  }
  conflicts.sort((a, b) => String(a.uiField).localeCompare(String(b.uiField)));
  return conflicts;
}

/** Whether at least one listing row shows the importer successfully filled this required key. */
export function listingDemonstratesRequiredField(listing: Listing, key: keyof Listing): boolean {
  switch (key) {
    case "reference":
      return listing.reference.trim().length > 0;
    case "title":
      return listing.title.trim().length > 0;
    case "price":
      return (
        (typeof listing.price === "number" && listing.price > 0) ||
        String(listing.priceOnApplication ?? "")
          .trim()
          .toLowerCase() === "yes"
      );
    case "purpose":
      return listing.purpose === "sale" || listing.purpose === "rent";
    case "propertyType":
      return listing.propertyType.trim().length > 0;
    default:
      return false;
  }
}

/**
 * Required UI fields that still need attention: no explicit mapping row, and parsed listings
 * do not show usable values (so defaults / auto-map did not fill them).
 */
export function computeMissingRequiredFields(
  mappings: FieldMapping[] | undefined,
  opts?: { listings?: Listing[] },
): (keyof Listing)[] {
  const mapped = new Set(
    (mappings ?? [])
      .filter((m) => m.uiField && String(m.uiField).trim())
      .map((m) => m.uiField as keyof Listing),
  );
  const listings = opts?.listings?.filter(Boolean) ?? [];

  const out: (keyof Listing)[] = [];
  for (const f of UI_FIELDS) {
    if (!f.required) continue;
    if (mapped.has(f.key)) continue;
    if (listings.length > 0 && listings.some((l) => listingDemonstratesRequiredField(l, f.key))) continue;
    out.push(f.key);
  }
  return out;
}

export function analyzeImport(params: {
  result: ImportResult;
  previousListings: Listing[];
  mappings?: FieldMapping[];
  fileName: string;
  strictMode: boolean;
  now?: Date;
  /** Session id for `previousListings` when loaded from storage (classic import). */
  diffBaselineSessionId?: string | null;
  classicImportMode?: ImportSession["classicImportMode"];
}): ImportSession {
  const now = params.now ?? new Date();
  const listings = params.result.listings ?? [];

  const prevById = new Map<string, Listing>();
  for (const l of params.previousListings ?? []) prevById.set(stableListingKey(l), l);

  const seenId = new Set<string>();
  const dupIds = new Set<string>();
  const seenRef = new Set<string>();
  const dupRefs = new Set<string>();

  const listingDiffById: Record<string, ImportListingDiff> = {};
  let newCount = 0;
  let updatedCount = 0;
  let unchangedCount = 0;
  let duplicateCount = 0;

  for (const l of listings) {
    const key = stableListingKey(l);

    if (seenId.has(key)) dupIds.add(key);
    seenId.add(key);

    if (l.reference) {
      if (seenRef.has(l.reference)) dupRefs.add(l.reference);
      seenRef.add(l.reference);
    }

    const prev = prevById.get(key);
    let status: ImportListingStatus;
    let keys: (keyof Listing)[] = [];

    if (!prev) {
      status = "new";
      newCount++;
    } else {
      keys = changedKeys(prev, l);
      if (keys.length) {
        status = "updated";
        updatedCount++;
      } else {
        status = "unchanged";
        unchangedCount++;
      }
    }

    listingDiffById[key] = {
      id: l.id,
      reference: l.reference,
      status,
      changedKeys: keys,
    };
  }

  // Mark duplicates last so duplicates win visually.
  for (const id of dupIds) {
    if (listingDiffById[id]) {
      listingDiffById[id] = { ...listingDiffById[id], status: "duplicate" };
      duplicateCount++;
      // Adjust counts if needed (roughly keep totals consistent)
      // Don't attempt to perfectly rebalance; UI uses status per-item.
    }
  }

  // Removed: in previous but not current
  let removedCount = 0;
  for (const [id, prev] of prevById.entries()) {
    if (listingDiffById[id]) continue;
    removedCount++;
    listingDiffById[id] = {
      id: prev.id,
      reference: prev.reference,
      status: "removed",
      changedKeys: [],
    };
  }

  const mappingConflicts = computeMappingConflicts(params.mappings);
  const missingRequiredFields = computeMissingRequiredFields(params.mappings, { listings });

  const conflicts: ImportConflictsSummary = {
    duplicateIds: Array.from(dupIds).sort(),
    duplicateReferences: Array.from(dupRefs).sort(),
    mappingConflicts,
    missingRequiredFields,
  };

  const diffSummary: ImportDiffSummary = {
    newCount,
    updatedCount,
    unchangedCount,
    removedCount,
    duplicateCount,
  };

  return {
    id: `${now.getTime()}-${Math.random().toString(16).slice(2)}`,
    createdAt: now.toISOString(),
    fileName: params.fileName,
    ...(params.classicImportMode ? { classicImportMode: params.classicImportMode } : {}),
    strictMode: params.strictMode,
    agencyInfo: params.result.agencyInfo,
    listingCount: listings.length,
    warnings: params.result.warnings ?? [],
    errors: params.result.errors ?? [],
    conflicts,
    diffSummary,
    listingDiffById,
    diffBaselineSessionId: params.diffBaselineSessionId ?? null,
  };
}

/** After removing listings from stored snapshots, keep session metadata consistent. */
export function pruneImportSessionAfterListingDelete(
  session: ImportSession,
  listingId: string,
  listingReference: string,
  newListingCount: number,
): ImportSession {
  const nextDiff: Record<string, ImportListingDiff> = {};
  for (const [k, d] of Object.entries(session.listingDiffById)) {
    if (d.id === listingId || k === listingId) continue;
    nextDiff[k] = d;
  }

  const diffSummary: ImportDiffSummary = {
    newCount: 0,
    updatedCount: 0,
    unchangedCount: 0,
    removedCount: 0,
    duplicateCount: 0,
  };
  for (const d of Object.values(nextDiff)) {
    if (d.status === "new") diffSummary.newCount++;
    else if (d.status === "updated") diffSummary.updatedCount++;
    else if (d.status === "unchanged") diffSummary.unchangedCount++;
    else if (d.status === "removed") diffSummary.removedCount++;
    else if (d.status === "duplicate") diffSummary.duplicateCount++;
  }

  const ref = listingReference.trim();
  return {
    ...session,
    listingCount: newListingCount,
    listingDiffById: nextDiff,
    diffSummary,
    conflicts: {
      ...session.conflicts,
      duplicateIds: session.conflicts.duplicateIds.filter((id) => id !== listingId),
      duplicateReferences: ref
        ? session.conflicts.duplicateReferences.filter((r) => r !== ref)
        : session.conflicts.duplicateReferences,
    },
  };
}

