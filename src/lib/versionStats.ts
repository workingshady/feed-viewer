import type { Listing } from "@/lib/types";

/**
 * Listing quality checks, modelled on portal quality scores (Property Finder / Bayut weigh photo
 * count, RERA permit, location and description). Weights sum to 100.
 */
export const QUALITY_CHECKS = [
  { key: "photos", label: "5+ photos", weight: 25, pass: (l: Listing) => (l.images?.length ?? 0) >= 5 },
  { key: "uniquePhotos", label: "No repeated photos", weight: 10, pass: (l: Listing) => !hasDuplicatePhotos(l) },
  { key: "description", label: "Description 200+ chars", weight: 15, pass: (l: Listing) => (l.description?.trim().length ?? 0) >= 200 },
  { key: "permit", label: "Permit number", weight: 15, pass: (l: Listing) => !!l.permitNumber?.trim() },
  { key: "coords", label: "Map location", weight: 15, pass: (l: Listing) => hasValidCoords(l) },
  { key: "price", label: "Price or POA", weight: 10, pass: (l: Listing) => l.price > 0 || isPoa(l) },
  { key: "title", label: "Title", weight: 5, pass: (l: Listing) => !!l.title?.trim() },
  { key: "agent", label: "Agent contact", weight: 5, pass: (l: Listing) => !!(l.agent?.phone?.trim() || l.agent?.email?.trim()) },
] as const;

export type QualityCheckKey = (typeof QUALITY_CHECKS)[number]["key"];

export type VersionStats = {
  /** Average listing quality, 0–100. */
  score: number;
  /** Share of listings passing each check, 0–1. */
  checks: Record<QualityCheckKey, number>;
  purpose: { sale: number; rent: number; unknown: number };
  medianPrice: { sale: number | null; rent: number | null };
  topPropertyTypes: [string, number][];
  communities: number;
  agents: number;
};

function hasDuplicatePhotos(l: Listing): boolean {
  const imgs = l.images ?? [];
  return new Set(imgs).size !== imgs.length;
}

function hasValidCoords(l: Listing): boolean {
  const { latitude: lat, longitude: lng } = l;
  return lat != null && lng != null && !(lat === 0 && lng === 0) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

const isPoa = (l: Listing) => /^(yes|true|1)$/i.test(l.priceOnApplication?.trim() ?? "");

export function listingQuality(l: Listing): { score: number; failed: QualityCheckKey[] } {
  let score = 0;
  const failed: QualityCheckKey[] = [];
  for (const c of QUALITY_CHECKS) {
    if (c.pass(l)) score += c.weight;
    else failed.push(c.key);
  }
  return { score, failed };
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function computeVersionStats(listings: Listing[]): VersionStats {
  const passCounts = Object.fromEntries(QUALITY_CHECKS.map((c) => [c.key, 0])) as Record<QualityCheckKey, number>;
  const purpose = { sale: 0, rent: 0, unknown: 0 };
  const prices = { sale: [] as number[], rent: [] as number[] };
  const types = new Map<string, number>();
  const communities = new Set<string>();
  const agents = new Set<string>();
  let total = 0;

  for (const l of listings) {
    const { score, failed } = listingQuality(l);
    total += score;
    for (const c of QUALITY_CHECKS) if (!failed.includes(c.key)) passCounts[c.key]++;
    purpose[l.purpose] = (purpose[l.purpose] ?? 0) + 1;
    if (l.price > 0 && (l.purpose === "sale" || l.purpose === "rent")) prices[l.purpose].push(l.price);
    if (l.propertyType) types.set(l.propertyType, (types.get(l.propertyType) ?? 0) + 1);
    if (l.community) communities.add(l.community.trim().toLowerCase());
    const agentKey = l.agent?.email?.trim().toLowerCase() || l.agent?.name?.trim().toLowerCase();
    if (agentKey) agents.add(agentKey);
  }

  const n = listings.length || 1;
  return {
    score: Math.round(total / n),
    checks: Object.fromEntries(QUALITY_CHECKS.map((c) => [c.key, passCounts[c.key] / n])) as Record<QualityCheckKey, number>,
    purpose,
    medianPrice: { sale: median(prices.sale), rent: median(prices.rent) },
    topPropertyTypes: [...types.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
    communities: communities.size,
    agents: agents.size,
  };
}

/** CSV of listings failing at least one quality check, worst first. */
export function qualityIssuesCsv(listings: Listing[]): string {
  const label = Object.fromEntries(QUALITY_CHECKS.map((c) => [c.key, c.label]));
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const rows = listings
    .map((l) => ({ l, ...listingQuality(l) }))
    .filter((r) => r.failed.length)
    .sort((a, b) => a.score - b.score)
    .map((r) => [r.l.reference, r.l.title, String(r.score), r.failed.map((k) => label[k]).join("; ")].map(esc).join(","));
  return ["reference,title,score,missing", ...rows].join("\n");
}

export type SourceHealth = "healthy" | "attention" | "error";

/** Traffic-light status for a source: no live version → error; pending/blocked or low quality → attention. */
export function sourceHealth(params: {
  hasLive: boolean;
  newestIsLive: boolean;
  liveScore: number | null;
  liveErrors: number;
}): SourceHealth {
  if (!params.hasLive) return "error";
  if (!params.newestIsLive || params.liveErrors > 0 || (params.liveScore ?? 100) < 60) return "attention";
  return "healthy";
}
