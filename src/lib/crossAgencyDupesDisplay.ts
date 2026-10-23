import type { CrossAgencyCluster } from "@/lib/crossAgencyDuplicates";

export type ClusterSort = "default" | "agencies" | "listings";

/** Presets for confidence chips on clusters. */
export type ConfidenceFilter = "all" | "high_only" | "high_and_medium" | "exclude_review";

export function clusterPassesConfidence(
  c: CrossAgencyCluster,
  filter: ConfidenceFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "high_only") return c.confidence === "high";
  if (filter === "high_and_medium") return c.confidence === "high" || c.confidence === "medium";
  if (filter === "exclude_review") return c.confidence !== "review";
  return true;
}

export function filterClustersByMinAgencies(
  clusters: CrossAgencyCluster[],
  minAgencies: 2 | 3 | 4,
): CrossAgencyCluster[] {
  if (minAgencies <= 2) return clusters;
  return clusters.filter((c) => c.agencies.length >= minAgencies);
}

export function filterClustersByMinListings(
  clusters: CrossAgencyCluster[],
  minListings: number,
): CrossAgencyCluster[] {
  if (!Number.isFinite(minListings) || minListings <= 2) return clusters;
  return clusters.filter((c) => c.items.length >= minListings);
}

export function filterClustersByConfidence(
  clusters: CrossAgencyCluster[],
  filter: ConfidenceFilter,
): CrossAgencyCluster[] {
  if (filter === "all") return clusters;
  return clusters.filter((c) => clusterPassesConfidence(c, filter));
}

/**
 * Multi-word AND search: every token must appear somewhere in label, key, agencies, or titles.
 */
export function clusterMatchesQuery(c: CrossAgencyCluster, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;
  const words = q.split(/\s+/).filter(Boolean);
  const hay = [
    c.matchLabel,
    c.matchKey,
    ...c.agencies,
    ...c.items.map((t) => t.listing?.title || ""),
    ...c.items.map((t) => t.agencyName || ""),
    ...c.items.map((t) => t.listing?.reference || ""),
  ]
    .join("\n")
    .toLowerCase();
  return words.every((w) => hay.includes(w));
}

export function filterClustersByQuery(
  clusters: CrossAgencyCluster[],
  query: string,
): CrossAgencyCluster[] {
  const q = query.trim();
  if (!q) return clusters;
  return clusters.filter((c) => clusterMatchesQuery(c, q));
}

export function sortClusters(clusters: CrossAgencyCluster[], sort: ClusterSort): CrossAgencyCluster[] {
  const list = [...clusters];
  /** Preserve API / analysis order from `analyzeCrossAgencyDuplicates`. */
  if (sort === "default") return list;
  if (sort === "agencies") {
    list.sort(
      (a, b) =>
        b.agencies.length - a.agencies.length ||
        b.items.length - a.items.length ||
        a.matchLabel.localeCompare(b.matchLabel),
    );
    return list;
  }
  list.sort(
    (a, b) =>
      b.items.length - a.items.length ||
      b.agencies.length - a.agencies.length ||
      a.matchLabel.localeCompare(b.matchLabel),
  );
  return list;
}

export type ClusterDisplayPipelineOpts = {
  minAgencies: 2 | 3 | 4;
  /** Minimum listings in cluster (2 = no extra filter). */
  minListings: number;
  confidence: ConfidenceFilter;
  sort: ClusterSort;
  query: string;
};

/**
 * Applies structural filters, sort, then search — in that order so the list order is stable before text filter.
 */
export function applyClusterDisplayPipeline(
  clusters: CrossAgencyCluster[],
  opts: ClusterDisplayPipelineOpts,
): CrossAgencyCluster[] {
  let list = [...clusters];
  list = filterClustersByMinAgencies(list, opts.minAgencies);
  list = filterClustersByMinListings(list, opts.minListings);
  list = filterClustersByConfidence(list, opts.confidence);
  list = sortClusters(list, opts.sort);
  list = filterClustersByQuery(list, opts.query);
  return list;
}

export function buildVisibleClustersSummary(params: {
  signalLabel: string;
  clusters: CrossAgencyCluster[];
}): string {
  const { signalLabel, clusters } = params;
  const lines: string[] = [
    `Cross-agency duplicates — ${signalLabel}`,
    `${clusters.length} cluster${clusters.length === 1 ? "" : "s"} (visible)`,
    "",
  ];
  for (let i = 0; i < clusters.length; i++) {
    const c = clusters[i];
    lines.push(
      `${i + 1}. [${c.tier}] ${c.matchLabel}`,
      `   Agencies: ${c.agencies.length} · Listings: ${c.items.length} · Confidence: ${c.confidence}`,
      `   ${c.matchKey}`,
      "",
    );
  }
  return lines.join("\n").trimEnd();
}
