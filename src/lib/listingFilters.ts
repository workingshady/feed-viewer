import type { Market } from "@/lib/markets";
import type { ImportListingStatus, Listing } from "@/lib/types";

/** "Has X" toggles on the listings page. Each must hold when active (AND). */
export const LISTING_FEATURES = [
  { key: "photos", label: "Photos", test: (l: Listing) => l.images.length > 0 },
  { key: "video", label: "Video tour", test: (l: Listing) => !!l.videoTourUrl?.trim() },
  { key: "tour360", label: "360° tour", test: (l: Listing) => !!l.view360?.trim() },
  { key: "floorplan", label: "Floor plan", test: (l: Listing) => !!l.floorPlanUrl?.trim() },
  { key: "map", label: "On map", test: (l: Listing) => l.latitude != null && l.longitude != null },
  { key: "permit", label: "Permit no.", test: (l: Listing) => !!l.permitNumber?.trim() },
  { key: "agentPhoto", label: "Agent photo", test: (l: Listing) => !!l.agent?.photo?.trim() },
  { key: "noPrice", label: "No price / POA", test: (l: Listing) => !(l.price > 0) },
] as const;

export type FeatureKey = (typeof LISTING_FEATURES)[number]["key"];
export const FEATURE_KEYS: ReadonlySet<string> = new Set(LISTING_FEATURES.map((f) => f.key));

/** Feeds spell completion many ways ("off_plan", "Off-Plan", "completed", "ready"). */
export function completionOf(l: Pick<Listing, "completionStatus">): "ready" | "offplan" | null {
  const v = l.completionStatus?.toLowerCase() ?? "";
  if (!v) return null;
  if (v.includes("off")) return "offplan";
  if (v.includes("ready") || v.includes("complete")) return "ready";
  return null;
}

export type RangePreset = { label: string; min: string; max: string };

export const SALE_PRESETS: RangePreset[] = [
  { label: "Under 1M", min: "", max: "1000000" },
  { label: "1M–2M", min: "1000000", max: "2000000" },
  { label: "2M–5M", min: "2000000", max: "5000000" },
  { label: "5M–10M", min: "5000000", max: "10000000" },
  { label: "10M+", min: "10000000", max: "" },
];

/** Yearly rents — the feed norm in the UAE. */
export const RENT_PRESETS: RangePreset[] = [
  { label: "Under 60K", min: "", max: "60000" },
  { label: "60K–100K", min: "60000", max: "100000" },
  { label: "100K–200K", min: "100000", max: "200000" },
  { label: "200K–500K", min: "200000", max: "500000" },
  { label: "500K+", min: "500000", max: "" },
];

const compactLabel = (n: number) => (n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : `${+(n / 1_000).toFixed(1)}K`);

/**
 * Price presets in a market's currency. Rents use the market's usual quoting period (monthly in
 * Singapore, Malaysia and Pakistan), because the filter compares the price as the feed states it.
 */
export function pricePresetsFor(market: Market, purpose: string): RangePreset[] {
  if (market.code === "AE") return purpose === "rent" ? RENT_PRESETS : SALE_PRESETS;
  const per = purpose === "rent" && market.defaultRentPeriod === "monthly" ? 12 : 1;
  const edges = (purpose === "rent" ? market.bands.yearlyRent : market.bands.sale).filter((_, i) => i % 2 === 1 || i === 0).map((e) => Math.round(e / per));
  const suffix = per === 12 ? " /mo" : "";
  return [
    { label: `Under ${compactLabel(edges[0])}${suffix}`, min: "", max: String(edges[0]) },
    ...edges.slice(1).map((e, i) => ({ label: `${compactLabel(edges[i])}–${compactLabel(e)}${suffix}`, min: String(edges[i]), max: String(e) })),
    { label: `${compactLabel(edges[edges.length - 1])}+${suffix}`, min: String(edges[edges.length - 1]), max: "" },
  ];
}

export const AREA_PRESETS: RangePreset[] = [
  { label: "Under 800", min: "", max: "800" },
  { label: "800–1,500", min: "800", max: "1500" },
  { label: "1,500–3,000", min: "1500", max: "3000" },
  { label: "3,000–6,000", min: "3000", max: "6000" },
  { label: "6,000+", min: "6000", max: "" },
];

export type SavedView = {
  id: string;
  name: string;
  filters: Partial<{
    search: string;
    priceMin: string;
    priceMax: string;
    beds: string;
    baths: string;
    propType: string;
    community: string;
    purpose: string;
    agent: string;
    city: string;
    furnished: string;
    areaMin: string;
    areaMax: string;
    completion: string;
    developer: string;
    features: string[];
    statusFilter: "all" | ImportListingStatus;
  }>;
};

const VIEWS_KEY = "feedviewer.listings.savedViews.v1";

export function readSavedViews(): SavedView[] {
  try {
    const raw = localStorage.getItem(VIEWS_KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(v) ? (v.filter((x) => x && typeof x.id === "string" && typeof x.name === "string") as SavedView[]) : [];
  } catch {
    return [];
  }
}

export function writeSavedViews(views: SavedView[]): void {
  try {
    localStorage.setItem(VIEWS_KEY, JSON.stringify(views));
  } catch {
    /* private mode: views just won't persist */
  }
}
