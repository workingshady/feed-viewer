import type { CrossAgencyCluster, CrossAgencyDuplicateReport } from "@/lib/crossAgencyDuplicates";

/**
 * How aggressively to hide fuzzy clusters that are already “explained” by stronger cross-agency signals.
 * Each step adds more signals into the coverage set (cumulative).
 */
export type FuzzyNoiseFilterLevel =
  | "off"
  /** Legacy “tight” mode: drop fuzzy if every listing is in permit ∪ 4dp map ∪ shared photo */
  | "minus_permit_geo_image"
  /** Also treat wider map (3dp) matches as explaining a listing */
  | "minus_geo_wide"
  /** Also same-building signature */
  | "minus_building"
  /** Also layout signature (no title in layout key). */
  | "minus_layout"
  /** Also any duplicate-by-content tier (full copy, no-description, or near match). */
  | "minus_content";

export const FUZZY_NOISE_FILTER_LEVELS: FuzzyNoiseFilterLevel[] = [
  "off",
  "minus_permit_geo_image",
  "minus_geo_wide",
  "minus_building",
  "minus_layout",
  "minus_content",
];

export function isFuzzyNoiseFilterLevel(v: unknown): v is FuzzyNoiseFilterLevel {
  return typeof v === "string" && (FUZZY_NOISE_FILTER_LEVELS as string[]).includes(v);
}

/** UI copy: value, short label, long hint for tooltips. */
export const FUZZY_NOISE_LEVEL_UI: {
  value: FuzzyNoiseFilterLevel;
  label: string;
  hint: string;
}[] = [
  {
    value: "off",
    label: "Off — show all fuzzy",
    hint: "No extra filtering on fuzzy clusters.",
  },
  {
    value: "minus_permit_geo_image",
    label: "Strong signals (permit · 4 dp map · photo)",
    hint: "Hide a fuzzy cluster when every listing in it already appears in a permit match, precise map pin (4 dp), or shared primary photo URL.",
  },
  {
    value: "minus_geo_wide",
    label: "+ Wider map (3 dp)",
    hint: "Same as strong, plus listings matched on wider coordinates (3 dp) count as explained.",
  },
  {
    value: "minus_building",
    label: "+ Same building",
    hint: "Also count same-building / development signature matches as explaining a listing.",
  },
  {
    value: "minus_layout",
    label: "+ Layout match",
    hint: "Also count layout (property type + rooms + coarse area + location text — title not in layout key).",
  },
  {
    value: "minus_content",
    label: "+ Duplicate by content (strictest)",
    hint: "Also count listings matched by any content fingerprint: full copy, title+facts without description, or near-duplicate (looser price + title). Strongest fuzzy noise cut.",
  },
];

function listingIdsInClusters(clusters: CrossAgencyCluster[]): Set<string> {
  const s = new Set<string>();
  for (const c of clusters) {
    for (const t of c.items) s.add(t.listing.id);
  }
  return s;
}

type ReportSlices = Pick<
  CrossAgencyDuplicateReport,
  | "permitClusters"
  | "geoClusters"
  | "geoWideClusters"
  | "imageUrlClusters"
  | "buildingClusters"
  | "layoutClusters"
  | "contentClusters"
  | "contentNoDescClusters"
  | "contentNearClusters"
>;

/**
 * Build cumulative “explained listing ids” for the chosen level (not including fuzzy itself).
 */
export function explainedListingIdsForFuzzyLevel(level: FuzzyNoiseFilterLevel, report: ReportSlices): Set<string> {
  const out = new Set<string>();
  const add = (set: Set<string>) => {
    for (const id of set) out.add(id);
  };

  add(listingIdsInClusters(report.permitClusters));
  add(listingIdsInClusters(report.geoClusters));
  add(listingIdsInClusters(report.imageUrlClusters));

  if (level === "minus_permit_geo_image") return out;

  add(listingIdsInClusters(report.geoWideClusters));
  if (level === "minus_geo_wide") return out;

  add(listingIdsInClusters(report.buildingClusters));
  if (level === "minus_building") return out;

  add(listingIdsInClusters(report.layoutClusters));
  if (level === "minus_layout") return out;

  add(listingIdsInClusters(report.contentClusters));
  add(listingIdsInClusters(report.contentNoDescClusters));
  add(listingIdsInClusters(report.contentNearClusters));
  if (level === "minus_content") return out;

  return out;
}

/**
 * Drop fuzzy clusters where every listing id is already in the explanation set for `level`.
 */
export function filterFuzzyClustersByNoiseLevel(
  fuzzyClusters: CrossAgencyCluster[],
  level: FuzzyNoiseFilterLevel,
  report: ReportSlices,
): CrossAgencyCluster[] {
  if (level === "off") return fuzzyClusters;
  const explained = explainedListingIdsForFuzzyLevel(level, report);
  return fuzzyClusters.filter((c) => {
    const ids = c.items.map((t) => t.listing.id);
    return !ids.every((id) => explained.has(id));
  });
}

/** Cluster count for each noise level (for UI: show how many pairs survive at every tier). */
export function countFuzzyClustersPerNoiseLevel(
  fuzzyClusters: CrossAgencyCluster[],
  report: ReportSlices,
): Record<FuzzyNoiseFilterLevel, number> {
  const result = {} as Record<FuzzyNoiseFilterLevel, number>;
  for (const level of FUZZY_NOISE_FILTER_LEVELS) {
    result[level] = filterFuzzyClustersByNoiseLevel(fuzzyClusters, level, report).length;
  }
  return result;
}

/** Migrate persisted prefs: old boolean `hideNoise` → first non-off level. */
export function fuzzyNoiseLevelFromLegacy(hideNoise: boolean | undefined, raw: unknown): FuzzyNoiseFilterLevel {
  if (isFuzzyNoiseFilterLevel(raw)) return raw;
  if (hideNoise === true) return "minus_permit_geo_image";
  return "off";
}
