import { computeMappingConflicts, computeMissingRequiredFields } from "@/lib/importAnalysis";
import { getListingFlags } from "@/lib/listingDatabaseMeta";
import type { Listing, MappingConfig, MappingConflict } from "@/lib/types";

export type MappingAuditSummary = {
  listingNodePath: string;
  mappingRows: number;
  assignedPaths: number;
  unassignedPaths: number;
  conflicts: MappingConflict[];
  missingRequiredFields: (keyof Listing)[];
};

export type ListingDatasetStats = {
  total: number;
  withAnyQualityFlag: number;
  withImages: number;
  withGeo: number;
  withReference: number;
  withTitle: number;
  withPriceOrPoa: number;
};

function listingHasQualityIssue(l: Listing): boolean {
  const flags = getListingFlags(l, { isFavorite: false, inCompare: false });
  return flags.some((f) => f.tone === "bad" || f.tone === "warn");
}

/** Aggregate mapping config + listing outcomes for the QA dashboard. */
export function computeMappingAuditSummary(
  config: MappingConfig | null | undefined,
  listings: Listing[],
): MappingAuditSummary {
  const mappings = config?.mappings ?? [];
  const assigned = mappings.filter((m) => m.uiField && String(m.uiField).trim());
  const unassigned = mappings.filter((m) => !m.uiField || !String(m.uiField).trim());
  return {
    listingNodePath: (config?.listingNodePath ?? "").trim() || "(not set)",
    mappingRows: mappings.length,
    assignedPaths: assigned.length,
    unassignedPaths: unassigned.length,
    conflicts: computeMappingConflicts(mappings),
    missingRequiredFields: computeMissingRequiredFields(mappings, { listings }),
  };
}

export function computeListingDatasetStats(listings: Listing[]): ListingDatasetStats {
  let withAnyQualityFlag = 0;
  let withImages = 0;
  let withGeo = 0;
  let withReference = 0;
  let withTitle = 0;
  let withPriceOrPoa = 0;

  for (const l of listings) {
    if (listingHasQualityIssue(l)) withAnyQualityFlag++;
    if (l.images?.length) withImages++;
    const lat = l.latitude;
    const lng = l.longitude;
    if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) withGeo++;
    if (String(l.reference ?? "").trim()) withReference++;
    if (String(l.title ?? "").trim().length >= 2) withTitle++;
    const poa = String(l.priceOnApplication ?? "")
      .trim()
      .toLowerCase();
    if ((typeof l.price === "number" && l.price > 0) || poa === "yes") withPriceOrPoa++;
  }

  const n = listings.length;
  return {
    total: n,
    withAnyQualityFlag,
    withImages,
    withGeo,
    withReference,
    withTitle,
    withPriceOrPoa,
  };
}

export function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((100 * part) / whole);
}
