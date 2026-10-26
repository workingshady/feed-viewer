import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { googleMapsQueryUrl } from "@/lib/mapExternalLinks";
import { cn } from "@/lib/utils";
import { useAppData } from "@/providers/DataProvider";
import { formatPriceCompact } from "@/lib/displayPrice";
import {
  addCompareListingId,
  COMPARE_UPDATED_EVENT,
  getCompareListingIds,
  prepareCompareTrayFromIds,
  removeCompareListingId,
} from "@/lib/compareSelection";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Focus,
  GitCompare,
  Globe2,
  Loader2,
  MapPin,
  Sparkles,
  Table2,
  TriangleAlert,
} from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import type { Listing } from "@/lib/types";
import type { GeoPointsMapView } from "@/components/GeoPointsMap";

const LazyGeoPointsMap = lazy(async () => {
  const mod = await import("@/components/GeoPointsMap");
  return { default: mod.GeoPointsMap };
});

function previewPriceLine(l: Listing) {
  if (!Number.isFinite(l.price) || l.price <= 0) return "POA";
  return `${l.currency || ""} ${formatPriceCompact(l.price)}`.trim();
}

function ListingPreviewCard({
  listing,
  onOpen,
  size = "full",
}: {
  listing: Listing;
  onOpen?: () => void;
  size?: "full" | "compact";
}) {
  const imgs = Array.isArray(listing.images) ? listing.images.filter(Boolean) : [];
  const [idx, setIdx] = useState(0);
  useEffect(() => setIdx(0), [listing.id]);
  const img = imgs.length > 0 ? imgs[Math.max(0, Math.min(idx, imgs.length - 1))] : "";

  const showCarousel = size === "full" && imgs.length > 1;
  return (
    <div className={cn("rounded-2xl border border-border bg-card shadow-[var(--shadow-card)] overflow-hidden", size === "compact" && "max-w-[320px]")}>
      <div className={cn("relative bg-muted", size === "compact" ? "aspect-[16/10]" : "aspect-[16/9]")}>
        {img ? (
          <img src={img} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
            No image
          </div>
        )}
        {showCarousel ? (
          <>
            <button
              type="button"
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full border border-border/60 bg-background/85 p-2 text-foreground shadow-sm hover:bg-background focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/40"
              onClick={(e) => {
                e.stopPropagation();
                setIdx((v) => (v - 1 + imgs.length) % imgs.length);
              }}
              aria-label="Previous image"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full border border-border/60 bg-background/85 p-2 text-foreground shadow-sm hover:bg-background focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/40"
              onClick={(e) => {
                e.stopPropagation();
                setIdx((v) => (v + 1) % imgs.length);
              }}
              aria-label="Next image"
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
            <div className="absolute right-3 bottom-3 rounded-full border border-border/70 bg-background/90 px-2 py-1 text-[11px] font-semibold text-muted-foreground shadow-sm">
              {idx + 1}/{imgs.length}
            </div>
          </>
        ) : null}
        <div className="absolute left-3 bottom-3 rounded-full border border-border/70 bg-background/90 px-2.5 py-1 text-[11px] font-semibold text-foreground shadow-sm">
          {previewPriceLine(listing)}
        </div>
      </div>
      <div className={cn(size === "compact" ? "p-3" : "p-4")}>
        <div className={cn("font-semibold text-foreground line-clamp-2", size === "compact" ? "text-[13px]" : "text-sm")}>
          {listing.title || "Untitled"}
        </div>
        <div className={cn("mt-1 text-xs text-muted-foreground line-clamp-2", size === "compact" && "text-[11px]")}>
          {norm(listing.city) || "—"}
          {norm(listing.community) ? ` · ${norm(listing.community)}` : ""}
          {norm(listing.address) ? ` · ${norm(listing.address)}` : ""}
        </div>
        {size === "full" ? (
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            {Number.isFinite(listing.beds) && listing.beds > 0 ? (
              <span className="rounded-full border border-border/70 bg-background px-2 py-0.5">{listing.beds} bd</span>
            ) : null}
            {Number.isFinite(listing.baths) && listing.baths > 0 ? (
              <span className="rounded-full border border-border/70 bg-background px-2 py-0.5">{listing.baths} ba</span>
            ) : null}
            {Number.isFinite(listing.area) && listing.area > 0 ? (
              <span className="rounded-full border border-border/70 bg-background px-2 py-0.5">
                {Math.round(listing.area).toLocaleString()} {norm(listing.areaUnit) || "sqft"}
              </span>
            ) : null}
            {norm(listing.propertyType) ? (
              <span className="rounded-full border border-border/70 bg-background px-2 py-0.5">{norm(listing.propertyType)}</span>
            ) : null}
            {norm(listing.purpose) ? (
              <span className="rounded-full border border-border/70 bg-background px-2 py-0.5">{norm(listing.purpose)}</span>
            ) : null}
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" className="h-9 rounded-xl" onClick={onOpen}>
            Open listing
          </Button>
          {listing.latitude != null && listing.longitude != null ? (
            <Button asChild size="sm" variant="outline" className="h-9 rounded-xl">
              <a href={googleMapsQueryUrl(listing.latitude, listing.longitude)} target="_blank" rel="noopener noreferrer">
                Google
              </a>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function norm(s: string | null | undefined) {
  return (s ?? "").trim();
}

function uniqueNonEmpty(values: Array<string | null | undefined>) {
  const set = new Set<string>();
  for (const v of values) {
    const n = norm(v);
    if (n) set.add(n);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * c;
}

function median(xs: number[]) {
  if (xs.length === 0) return 0;
  const a = [...xs].sort((p, q) => p - q);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function mad(xs: number[], med: number) {
  if (xs.length === 0) return 0;
  return median(xs.map((x) => Math.abs(x - med)));
}

function modifiedZ(x: number, med: number, madVal: number) {
  if (!Number.isFinite(x) || !Number.isFinite(med)) return 0;
  if (!Number.isFinite(madVal) || madVal <= 0) return 0;
  return (0.6745 * (x - med)) / madVal;
}

function topBuckets<T>(
  items: T[],
  keyOf: (x: T) => string,
  max = 12,
): Array<{ key: string; count: number }> {
  const m = new Map<string, number>();
  for (const it of items) {
    const k = keyOf(it);
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return Array.from(m.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, max);
}

function BarList({
  title,
  rows,
  selectedKey,
  onSelect,
}: {
  title: string;
  rows: Array<{ key: string; count: number }>;
  selectedKey?: string | null;
  onSelect?: (key: string) => void;
}) {
  const max = rows.length ? Math.max(...rows.map((r) => r.count)) : 0;
  return (
    <Card className="rounded-[1.5rem] shadow-[var(--shadow-card)]">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription className="text-xs">Top values in the current filter scope.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">No data</div>
        ) : (
          rows.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={onSelect ? () => onSelect(r.key) : undefined}
              className={cn(
                "w-full flex items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors",
                onSelect ? "hover:bg-muted/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/40" : "",
                selectedKey && selectedKey === r.key ? "bg-primary/10" : "",
              )}
              aria-pressed={selectedKey ? selectedKey === r.key : undefined}
              disabled={!onSelect}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate text-sm font-medium">{r.key}</div>
                  <div className="text-xs tabular-nums text-muted-foreground">{r.count.toLocaleString()}</div>
                </div>
                <div className="mt-1 h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary/70"
                    style={{ width: `${max ? (r.count / max) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </button>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function listingAddressLine(l: Listing) {
  return norm(l.address) || "";
}

const GeoPointsPage = () => {
  const { listings: allListings, scope, setScope, listingsByAgency } = useAppData();

  const [tab, setTab] = useState<"map" | "insights">("map");
  const [search, setSearch] = useState("");
  const [city, setCity] = useState("all");
  const [community, setCommunity] = useState("all");
  const [purpose, setPurpose] = useState("all");
  const [propType, setPropType] = useState("all");
  const [minBeds, setMinBeds] = useState("");
  const [maxBeds, setMaxBeds] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [onlyWithImages, setOnlyWithImages] = useState(false);
  const [onlyWithVideo, setOnlyWithVideo] = useState(false);
  const [onlyWithCoords, setOnlyWithCoords] = useState(true);
  const [outlierMode, setOutlierMode] = useState<"all" | "outliers" | "non-outliers">("all");
  const [onlyInViewport, setOnlyInViewport] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const [outliersOpen, setOutliersOpen] = useState(true);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const [mapView, setMapView] = useState<GeoPointsMapView | null>(null);
  const [fitBoundsSignal, setFitBoundsSignal] = useState(0);
  const [clickHistory, setClickHistory] = useState<string[]>([]);
  const [compareIds, setCompareIds] = useState<string[]>(() => getCompareListingIds());
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 1023px)").matches : false,
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, []);

  useEffect(() => {
    const sync = () => setCompareIds(getCompareListingIds());
    sync();
    window.addEventListener(COMPARE_UPDATED_EVENT, sync);
    return () => window.removeEventListener(COMPARE_UPDATED_EVENT, sync);
  }, []);

  const agencyNames = useMemo(
    () => Array.from(listingsByAgency.keys()).sort((a, b) => a.localeCompare(b)),
    [listingsByAgency],
  );

  const scoped = useMemo(() => {
    if (scope.mode === "all") return allListings;
    if (scope.mode === "agency") return listingsByAgency.get(scope.agencyName) ?? [];
    return allListings;
  }, [allListings, listingsByAgency, scope]);

  const effectiveScoped = scoped;

  const cityOptions = useMemo(() => {
    return uniqueNonEmpty(effectiveScoped.map((l) => l.city));
  }, [effectiveScoped]);
  const communityOptions = useMemo(() => {
    return uniqueNonEmpty(effectiveScoped.map((l) => l.community));
  }, [effectiveScoped]);
  const propTypeOptions = useMemo(() => {
    return uniqueNonEmpty(effectiveScoped.map((l) => (l.propertyType ? String(l.propertyType) : "")));
  }, [effectiveScoped]);

  const searchNorm = search.trim().toLowerCase();
  const bedsMin = useMemo(() => {
    const n = Number.parseInt(minBeds.trim(), 10);
    return Number.isFinite(n) ? n : null;
  }, [minBeds]);
  const bedsMax = useMemo(() => {
    const n = Number.parseInt(maxBeds.trim(), 10);
    return Number.isFinite(n) ? n : null;
  }, [maxBeds]);
  const priceMin = useMemo(() => {
    const n = Number.parseFloat(minPrice.trim().replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }, [minPrice]);
  const priceMax = useMemo(() => {
    const n = Number.parseFloat(maxPrice.trim().replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }, [maxPrice]);

  const baseFiltered = useMemo(() => {
    return effectiveScoped.filter((l) => {
      const hasCoords =
        l.latitude != null &&
        l.longitude != null &&
        Number.isFinite(l.latitude) &&
        Number.isFinite(l.longitude);
      if (onlyWithCoords && !hasCoords) return false;
      if (city !== "all" && norm(l.city) !== city) return false;
      if (community !== "all" && norm(l.community) !== community) return false;
      if (purpose !== "all" && norm(l.purpose) !== purpose) return false;
      if (propType !== "all" && String(l.propertyType ?? "") !== propType) return false;
      if (onlyWithImages && (!Array.isArray(l.images) || l.images.length === 0)) return false;
      if (onlyWithVideo && !norm(l.videoTourUrl)) return false;
      if (bedsMin != null && (Number.isFinite(l.beds) ? l.beds : 0) < bedsMin) return false;
      if (bedsMax != null && (Number.isFinite(l.beds) ? l.beds : 0) > bedsMax) return false;
      if (priceMin != null && (Number.isFinite(l.price) ? l.price : 0) < priceMin) return false;
      if (priceMax != null && (Number.isFinite(l.price) ? l.price : 0) > priceMax) return false;

      if (searchNorm) {
        const hay = [
          l.id,
          l.title,
          l.reference,
          l.city,
          l.community,
          l.subCommunity,
          l.propertyName,
          l.agent?.name,
          l.developer,
          l.sourceAgency,
          listingAddressLine(l),
        ]
          .map((x) => norm(x).toLowerCase())
          .filter(Boolean)
          .join(" · ");
        if (!hay.includes(searchNorm)) return false;
      }
      return true;
    });
  }, [
    effectiveScoped,
    onlyWithCoords,
    city,
    community,
    purpose,
    propType,
    onlyWithImages,
    onlyWithVideo,
    bedsMin,
    bedsMax,
    priceMin,
    priceMax,
    searchNorm,
  ]);

  const withCoords = useMemo(() => {
    return baseFiltered.filter(
      (l) =>
        l.latitude != null &&
        l.longitude != null &&
        Number.isFinite(l.latitude) &&
        Number.isFinite(l.longitude),
    );
  }, [baseFiltered]);

  const outlierModel = useMemo(() => {
    const pts = withCoords.map((l) => ({ id: l.id, lat: l.latitude!, lng: l.longitude! }));
    if (pts.length === 0) {
      return {
        outlierIds: new Set<string>(),
        detailsById: new Map<string, { kmFromCenter: number; reasons: string[] }>(),
        anomalies: { zeroZero: 0, duplicates: 0 },
      };
    }

    // Robust center (median) is more stable than mean when there are extreme points.
    const latMed = median(pts.map((p) => p.lat));
    const lngMed = median(pts.map((p) => p.lng));
    const latMad = mad(pts.map((p) => p.lat), latMed);
    const lngMad = mad(pts.map((p) => p.lng), lngMed);
    const center = { lat: latMed, lng: lngMed };

    // Distance-based outliers around the robust center.
    const d = pts.map((p) => ({ id: p.id, km: haversineKm(center, p) }));
    const dMed = median(d.map((x) => x.km));
    const dMad = mad(d.map((x) => x.km), dMed);
    const distThreshold = dMad > 0 ? dMed + 7 * dMad : Math.max(25, dMed * 4);

    // Duplicate coordinate clusters (rounded) are usually placeholders / defaults.
    const coordKey = (p: { lat: number; lng: number }) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
    const coordCounts = new Map<string, number>();
    for (const p of pts) coordCounts.set(coordKey(p), (coordCounts.get(coordKey(p)) ?? 0) + 1);

    const outlierIds = new Set<string>();
    const detailsById = new Map<string, { kmFromCenter: number; reasons: string[] }>();
    let zeroZero = 0;
    let duplicates = 0;

    for (const p of pts) {
      const reasons: string[] = [];
      const kmFromCenter = haversineKm(center, p);

      if (Math.abs(p.lat) < 1e-9 && Math.abs(p.lng) < 1e-9) {
        reasons.push("Coords are (0,0) — placeholder");
        zeroZero += 1;
      }

      const c = coordCounts.get(coordKey(p)) ?? 1;
      if (c >= 10) {
        reasons.push(`Repeated coordinates (${c} listings) — likely default`);
        duplicates += 1;
      }

      const zLat = Math.abs(modifiedZ(p.lat, latMed, latMad));
      const zLng = Math.abs(modifiedZ(p.lng, lngMed, lngMad));
      if (zLat >= 10 || zLng >= 10) reasons.push("Lat/lng far from typical range");

      if (kmFromCenter > distThreshold) reasons.push(`Far from main cluster (${kmFromCenter.toFixed(1)} km)`);

      const isOutlier = reasons.some((r) => r.startsWith("Coords are (0,0)") || r.startsWith("Far from main cluster") || r === "Lat/lng far from typical range");
      if (isOutlier) outlierIds.add(p.id);
      if (reasons.length > 0) detailsById.set(p.id, { kmFromCenter, reasons });
    }

    return { outlierIds, detailsById, anomalies: { zeroZero, duplicates } };
  }, [withCoords]);

  const outlierIds = outlierModel.outlierIds;

  const filtered = useMemo(() => {
    if (outlierMode === "all") return baseFiltered;
    if (outlierMode === "outliers") return baseFiltered.filter((l) => outlierIds.has(l.id));
    return baseFiltered.filter((l) => !outlierIds.has(l.id));
  }, [baseFiltered, outlierMode, outlierIds]);

  const filteredInViewport = useMemo(() => {
    if (!onlyInViewport) return filtered;
    const b = mapView?.bounds;
    if (!b) return filtered;
    return filtered.filter((l) => {
      if (l.latitude == null || l.longitude == null) return false;
      if (!Number.isFinite(l.latitude) || !Number.isFinite(l.longitude)) return false;
      return l.latitude <= b.north && l.latitude >= b.south && l.longitude <= b.east && l.longitude >= b.west;
    });
  }, [filtered, onlyInViewport, mapView?.bounds]);

  const selectedListing = useMemo(() => {
    if (!selectedId) return null;
    return filtered.find((l) => l.id === selectedId) ?? withCoords.find((l) => l.id === selectedId) ?? null;
  }, [filtered, withCoords, selectedId]);

  const hoveredListing = useMemo(() => {
    if (!hoveredId) return null;
    return filtered.find((l) => l.id === hoveredId) ?? withCoords.find((l) => l.id === hoveredId) ?? null;
  }, [filtered, withCoords, hoveredId]);

  const coverage = useMemo(() => {
    const f = onlyInViewport ? filteredInViewport : filtered;
    const pts = f
      .filter(
        (l) =>
          l.latitude != null &&
          l.longitude != null &&
          Number.isFinite(l.latitude) &&
          Number.isFinite(l.longitude),
      )
      .map((l) => ({ lat: l.latitude!, lng: l.longitude! }));
    if (pts.length === 0) return null;
    const latMin = Math.min(...pts.map((p) => p.lat));
    const latMax = Math.max(...pts.map((p) => p.lat));
    const lngMin = Math.min(...pts.map((p) => p.lng));
    const lngMax = Math.max(...pts.map((p) => p.lng));
    const center = { lat: (latMin + latMax) / 2, lng: (lngMin + lngMax) / 2 };
    const spreadKm = haversineKm({ lat: latMin, lng: lngMin }, { lat: latMax, lng: lngMax });
    return { latMin, latMax, lngMin, lngMax, center, spreadKm };
  }, [filtered, filteredInViewport, onlyInViewport]);

  const summary = useMemo(() => {
    const f = onlyInViewport ? filteredInViewport : filtered;
    const totalScoped = scoped.length;
    const scopedWithCoords = scoped.filter(
      (l) =>
        l.latitude != null &&
        l.longitude != null &&
        Number.isFinite(l.latitude) &&
        Number.isFinite(l.longitude),
    ).length;
    return {
      totalScoped,
      scopedWithCoords,
      scopedMissingCoords: totalScoped - scopedWithCoords,
      totalFiltered: f.length,
      filteredWithCoords: f.filter(
        (l) =>
          l.latitude != null &&
          l.longitude != null &&
          Number.isFinite(l.latitude) &&
          Number.isFinite(l.longitude),
      ).length,
      outliers: outlierIds.size,
    };
  }, [scoped, filtered, filteredInViewport, onlyInViewport, outlierIds]);

  const topCities = useMemo(() => topBuckets(withCoords, (l) => norm(l.city), 12), [withCoords]);
  const topCommunities = useMemo(
    () => topBuckets(withCoords, (l) => norm(l.community), 12),
    [withCoords],
  );
  const topPropertyNames = useMemo(
    () => topBuckets(withCoords, (l) => norm(l.propertyName), 12),
    [withCoords],
  );
  const topAddresses = useMemo(
    () => topBuckets(withCoords, (l) => norm(listingAddressLine(l)), 12),
    [withCoords],
  );

  const topOutliers = useMemo(() => {
    const out: Array<{ id: string; kmFromCenter: number; reasons: string[] }> = [];
    for (const l of withCoords) {
      if (!outlierIds.has(l.id)) continue;
      const d = outlierModel.detailsById.get(l.id);
      out.push({ id: l.id, kmFromCenter: d?.kmFromCenter ?? 0, reasons: d?.reasons ?? ["Outlier"] });
    }
    out.sort((a, b) => b.kmFromCenter - a.kmFromCenter);
    return out.slice(0, 25);
  }, [withCoords, outlierIds, outlierModel.detailsById]);

  // Auto-expand outliers panel when it becomes relevant.
  // Keeps the UI tidy when there are none, but surfaces issues immediately when they appear.
  // (User can always collapse manually.)
  useMemo(() => {
    if (withCoords.length < 20) return;
    if (outlierIds.size > 0 && !outliersOpen) setOutliersOpen(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outlierIds.size, withCoords.length]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="container mx-auto px-4 py-6">
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-[240px]">
              <h1 className="text-2xl font-bold font-heading tracking-tight flex items-center gap-2">
                <MapPin className="w-6 h-6 text-primary-text/70" aria-hidden />
                Listing locations map
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Map view of listing coordinates — explore pins, outliers, and distributions (separate from XML field mapping).
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Select
                value={scope.mode === "agency" ? `agency:${scope.agencyName}` : scope.mode}
                onValueChange={(v) => {
                  if (v === "all") setScope({ mode: "all" });
                  else if (v.startsWith("agency:")) setScope({ mode: "agency", agencyName: v.slice("agency:".length) });
                }}
              >
                <SelectTrigger className="w-[220px] rounded-xl">
                  <SelectValue placeholder="Scope" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All agencies</SelectItem>
                  {agencyNames.length > 0 ? (
                    <>
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">Agencies</div>
                      {agencyNames.map((n) => (
                        <SelectItem key={n} value={`agency:${n}`}>
                          {n}
                        </SelectItem>
                      ))}
                    </>
                  ) : null}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Card className="rounded-[1.75rem] shadow-[var(--shadow-card)]">
            <CardHeader className="pb-4">
              <CardTitle className="text-base flex items-center justify-between gap-3 flex-wrap">
                <span className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary-text/70" aria-hidden />
                  Filters
                </span>
                <span className="text-xs text-muted-foreground font-normal">
                  Scoped: {summary.totalScoped.toLocaleString()} · With coords:{" "}
                  {summary.scopedWithCoords.toLocaleString()} · Missing coords:{" "}
                  {summary.scopedMissingCoords.toLocaleString()}
                </span>
              </CardTitle>
              <CardDescription className="text-xs">
                Use search + dropdowns; map loads only when the Map tab is open.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-4">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search title, address, community, property name, reference…"
                  className="rounded-xl"
                />
              </div>
              <div className="md:col-span-2">
                <Select value={city} onValueChange={setCity}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="City" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All cities</SelectItem>
                    {cityOptions.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2">
                <Select value={community} onValueChange={setCommunity}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Community" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All communities</SelectItem>
                    {communityOptions.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2">
                <Select value={purpose} onValueChange={setPurpose}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Purpose" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All purposes</SelectItem>
                    <SelectItem value="sale">Sale</SelectItem>
                    <SelectItem value="rent">Rent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2">
                <Select value={propType} onValueChange={setPropType}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Property type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    {propTypeOptions.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-2">
                <Input
                  inputMode="numeric"
                  value={minBeds}
                  onChange={(e) => setMinBeds(e.target.value)}
                  placeholder="Min beds"
                  className="rounded-xl"
                />
              </div>
              <div className="md:col-span-2">
                <Input
                  inputMode="numeric"
                  value={maxBeds}
                  onChange={(e) => setMaxBeds(e.target.value)}
                  placeholder="Max beds"
                  className="rounded-xl"
                />
              </div>
              <div className="md:col-span-2">
                <Input
                  inputMode="decimal"
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                  placeholder="Min price"
                  className="rounded-xl"
                />
              </div>
              <div className="md:col-span-2">
                <Input
                  inputMode="decimal"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  placeholder="Max price"
                  className="rounded-xl"
                />
              </div>

              <div className="md:col-span-12 flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="flex items-center gap-5 flex-wrap">
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={onlyWithCoords} onCheckedChange={setOnlyWithCoords} />
                    <span className="text-muted-foreground">Only with coordinates</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={onlyWithImages} onCheckedChange={setOnlyWithImages} />
                    <span className="text-muted-foreground">Has images</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={onlyWithVideo} onCheckedChange={setOnlyWithVideo} />
                    <span className="text-muted-foreground">Has video tour</span>
                  </label>
                  <label className={cn("flex items-center gap-2 text-sm", tab !== "map" && "opacity-60")}>
                    <Switch checked={onlyInViewport} onCheckedChange={setOnlyInViewport} disabled={tab !== "map"} />
                    <span className="text-muted-foreground">Only in map view</span>
                  </label>
                  <div className={cn("flex items-center gap-2", withCoords.length < 20 && "opacity-60")}>
                    <Select
                      value={outlierMode}
                      onValueChange={(v) => setOutlierMode(v as typeof outlierMode)}
                      disabled={withCoords.length < 20}
                    >
                      <SelectTrigger className="h-9 w-[200px] rounded-xl">
                        <SelectValue placeholder="Outliers" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All points</SelectItem>
                        <SelectItem value="outliers">Outliers only</SelectItem>
                        <SelectItem value="non-outliers">Non-outliers only</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="text-xs text-muted-foreground">
                      {withCoords.length < 20 ? "need ≥ 20 points" : `${outlierIds.size.toLocaleString()} outliers detected`}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="text-xs text-muted-foreground">
                    Filtered: <span className="font-medium text-foreground">{summary.totalFiltered.toLocaleString()}</span>
                    {onlyWithCoords ? null : (
                      <>
                        {" "}
                        · With coords:{" "}
                        <span className="font-medium text-foreground">{summary.filteredWithCoords.toLocaleString()}</span>
                      </>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    className="rounded-xl"
                    onClick={() => {
                      setSearch("");
                      setCity("all");
                      setCommunity("all");
                      setPurpose("all");
                      setPropType("all");
                      setMinBeds("");
                      setMaxBeds("");
                      setMinPrice("");
                      setMaxPrice("");
                      setOnlyWithImages(false);
                      setOnlyWithVideo(false);
                      setOnlyWithCoords(true);
                      setOutlierMode("all");
                      setOnlyInViewport(false);
                    }}
                  >
                    Clear
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="w-full">
          <TabsList className="grid w-full grid-cols-2 rounded-2xl h-12 mb-4">
            <TabsTrigger value="map" className="gap-2">
              <MapPin className="w-4 h-4" aria-hidden />
              Map
            </TabsTrigger>
            <TabsTrigger value="insights" className="gap-2">
              <Table2 className="w-4 h-4" aria-hidden />
              Insights
            </TabsTrigger>
          </TabsList>

          <TabsContent value="map" className="mt-0">
            <div className="grid grid-cols-1 gap-4">
              <div className="relative rounded-[1.75rem] overflow-hidden border border-border shadow-[var(--shadow-card)]">
                <Suspense
                  fallback={
                    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-muted-foreground">
                      <Loader2 className="h-7 w-7 animate-spin text-primary-text" aria-hidden />
                      <p className="text-sm">Loading map…</p>
                    </div>
                  }
                >
                  <LazyGeoPointsMap
                    listings={filteredInViewport}
                    selectedId={selectedId}
                    onHoverListingIdChange={(id) => {
                      // Don't replace a locked selection with hover noise.
                      if (selectedId) return;
                      setHoveredId(id);
                    }}
                    onHoverListingPosChange={(pos) => {
                      if (selectedId) return;
                      setHoverPos(pos);
                    }}
                    onSelectListingId={(id) => {
                      setSelectedId(id);
                      setClickHistory((cur) => {
                        const next = [id, ...cur.filter((x) => x !== id)];
                        return next.slice(0, 30);
                      });
                      setHoveredId(null);
                      setHoverPos(null);
                      // Only open the bottom sheet on mobile; on desktop we use the right-side panel.
                      if (isMobile) setMobilePreviewOpen(true);
                    }}
                    onViewChange={(v) => setMapView(v)}
                    fitBoundsSignal={fitBoundsSignal}
                  />
                </Suspense>

                <div className="absolute left-3 top-3 z-10 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-9 rounded-xl shadow-sm"
                    onClick={() => setFitBoundsSignal((x) => x + 1)}
                  >
                    <Focus className="h-4 w-4 mr-2" aria-hidden />
                    Fit to results
                  </Button>
                </div>

                {/* Hover preview anchored to cursor (click to lock/pin). */}
                {!selectedId && hoveredId && hoveredListing && hoverPos ? (
                  <div
                    className="absolute z-20 pointer-events-auto"
                    style={{
                      left: Math.max(12, hoverPos.x + 14),
                      top: Math.max(12, hoverPos.y),
                      transform: "translateY(-50%)",
                    }}
                    onClick={() => {
                      setSelectedId(hoveredListing.id);
                      setClickHistory((cur) => {
                        const next = [hoveredListing.id, ...cur.filter((x) => x !== hoveredListing.id)];
                        return next.slice(0, 30);
                      });
                      setHoveredId(null);
                      setHoverPos(null);
                      if (isMobile) setMobilePreviewOpen(true);
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedId(hoveredListing.id);
                        setClickHistory((cur) => {
                          const next = [hoveredListing.id, ...cur.filter((x) => x !== hoveredListing.id)];
                          return next.slice(0, 30);
                        });
                        setHoveredId(null);
                        setHoverPos(null);
                        if (isMobile) setMobilePreviewOpen(true);
                      }
                    }}
                  >
                    <div className="rounded-2xl border border-border bg-background/95 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80">
                      <div className="p-2">
                        <ListingPreviewCard
                          listing={hoveredListing}
                          size="compact"
                          onOpen={() => {
                            window.location.href = `/listing/${encodeURIComponent(hoveredListing.id)}`;
                          }}
                        />
                        <div className="mt-2 text-[11px] text-muted-foreground px-1">
                          Click to pin · press Enter to pin
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="insights" className="mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <Card className="lg:col-span-12 rounded-[1.75rem] shadow-[var(--shadow-card)]">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Coverage</CardTitle>
                  <CardDescription className="text-xs">
                    Bounding box and a rough spread estimate for the current filtered points.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {coverage ? (
                    <>
                      <div className="rounded-xl border border-border bg-muted/20 p-3">
                        <div className="text-[11px] text-muted-foreground">Center</div>
                        <div className="text-sm font-medium tabular-nums">
                          {coverage.center.lat.toFixed(5)}, {coverage.center.lng.toFixed(5)}
                        </div>
                      </div>
                      <div className="rounded-xl border border-border bg-muted/20 p-3">
                        <div className="text-[11px] text-muted-foreground">Lat range</div>
                        <div className="text-sm font-medium tabular-nums">
                          {coverage.latMin.toFixed(5)} → {coverage.latMax.toFixed(5)}
                        </div>
                      </div>
                      <div className="rounded-xl border border-border bg-muted/20 p-3">
                        <div className="text-[11px] text-muted-foreground">Lng range</div>
                        <div className="text-sm font-medium tabular-nums">
                          {coverage.lngMin.toFixed(5)} → {coverage.lngMax.toFixed(5)}
                        </div>
                      </div>
                      <div className="rounded-xl border border-border bg-muted/20 p-3">
                        <div className="text-[11px] text-muted-foreground">Spread (km)</div>
                        <div className="text-sm font-medium tabular-nums">{coverage.spreadKm.toFixed(1)}</div>
                      </div>
                    </>
                  ) : (
                    <div className="col-span-2 md:col-span-4 text-center text-sm text-muted-foreground py-6">
                      No points with coordinates in the current filter.
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="lg:col-span-12 rounded-[1.75rem] shadow-[var(--shadow-card)]">
                <Collapsible open={outliersOpen} onOpenChange={setOutliersOpen}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <CardTitle className="text-base flex items-center gap-2">
                          <TriangleAlert className="w-4 h-4 text-primary-text/70 shrink-0" aria-hidden />
                          Outliers & anomalies
                        </CardTitle>
                        <CardDescription className="text-xs mt-1">
                          Robust detection using median/MAD on lat/lng + distance-from-cluster.
                        </CardDescription>
                      </div>
                      <div className="shrink-0 flex flex-col items-end gap-2">
                        <div className="text-xs text-muted-foreground font-normal text-right">
                          Outliers: <span className="font-medium text-foreground">{outlierIds.size.toLocaleString()}</span>
                          {" · "}
                          (0,0): <span className="font-medium text-foreground">{outlierModel.anomalies.zeroZero.toLocaleString()}</span>
                          {" · "}
                          repeats: <span className="font-medium text-foreground">{outlierModel.anomalies.duplicates.toLocaleString()}</span>
                        </div>
                        <CollapsibleTrigger
                          type="button"
                          className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-primary/25 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/40"
                          aria-label={outliersOpen ? "Collapse outliers panel" : "Expand outliers panel"}
                        >
                          <ChevronDown
                            className={cn("h-4 w-4 transition-transform duration-200", outliersOpen && "rotate-180")}
                            aria-hidden
                          />
                          {outliersOpen ? "Collapse" : "Expand"}
                        </CollapsibleTrigger>
                      </div>
                    </div>
                  </CardHeader>

                  <CollapsibleContent>
                    <CardContent className="flex flex-col gap-3 pt-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs text-muted-foreground">
                          Tip: click an outlier below to open it in Map, or enable{" "}
                          <span className="font-medium text-foreground">Outliers only</span>.
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant={outlierMode === "outliers" ? "default" : "outline"}
                            className="rounded-xl"
                            disabled={withCoords.length < 20}
                            onClick={() => {
                              setOutlierMode("outliers");
                              setOnlyWithCoords(true);
                              setTab("map");
                              setFitBoundsSignal((x) => x + 1);
                            }}
                          >
                            Show outliers on map
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="rounded-xl"
                            onClick={() => {
                              setOutlierMode("all");
                            }}
                          >
                            Clear outlier filter
                          </Button>
                        </div>
                      </div>

                      {topOutliers.length === 0 ? (
                        <div className="text-sm text-muted-foreground py-4 text-center">
                          No outliers detected in this filter scope.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {topOutliers.map((o) => {
                            const l = withCoords.find((x) => x.id === o.id);
                            if (!l) return null;
                            const lat = l.latitude!;
                            const lng = l.longitude!;
                            return (
                              <button
                                key={o.id}
                                type="button"
                                className="text-left rounded-xl border border-border bg-muted/15 p-3 hover:bg-muted/25 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/40"
                                onClick={() => {
                                  setOnlyWithCoords(true);
                                  setOutlierMode("outliers");
                                  setSelectedId(l.id);
                                  setTab("map");
                                  setFitBoundsSignal((x) => x + 1);
                                }}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="text-sm font-semibold truncate">{l.title || "Untitled"}</div>
                                    <div className="mt-0.5 text-xs text-muted-foreground truncate">
                                      {norm(l.city) || "—"}
                                      {norm(l.community) ? ` · ${norm(l.community)}` : ""}
                                    </div>
                                  </div>
                                  <div className="text-xs tabular-nums text-muted-foreground shrink-0">
                                    {o.kmFromCenter.toFixed(1)} km
                                  </div>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {o.reasons.slice(0, 3).map((r, i) => (
                                    <span
                                      key={i}
                                      className="inline-flex items-center rounded-full border border-border/70 bg-background px-2 py-0.5 text-[11px] text-muted-foreground"
                                    >
                                      {r}
                                    </span>
                                  ))}
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                                  <Button
                                    asChild
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 rounded-lg border border-border bg-background"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <a href={googleMapsQueryUrl(lat, lng)} target="_blank" rel="noopener noreferrer">
                                      Google
                                    </a>
                                  </Button>
                                  <Button
                                    asChild
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 rounded-lg border border-border bg-background"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <a href={`/listing/${encodeURIComponent(l.id)}`}>Open listing</a>
                                  </Button>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>

              <div className="lg:col-span-6 grid grid-cols-1 gap-4">
                <BarList
                  title="Cities"
                  rows={topCities}
                  selectedKey={city !== "all" ? city : null}
                  onSelect={(k) => {
                    setCity(k);
                    setTab("map");
                  }}
                />
                <BarList
                  title="Communities"
                  rows={topCommunities}
                  selectedKey={community !== "all" ? community : null}
                  onSelect={(k) => {
                    setCommunity(k);
                    setTab("map");
                  }}
                />
              </div>
              <div className="lg:col-span-6 grid grid-cols-1 gap-4">
                <BarList title="Property names" rows={topPropertyNames} />
                <BarList title="Addresses" rows={topAddresses} />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Mobile: floating quick jump (thumb-friendly). */}
      <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-40 lg:hidden">
        <Button
          type="button"
          size="sm"
          className="h-11 rounded-full shadow-lg shadow-primary/20 gap-2 px-4"
          onClick={() => setTab((t) => (t === "map" ? "insights" : "map"))}
        >
          <Globe2 className="w-4 h-4" aria-hidden />
          {tab === "map" ? "Insights" : "Map"}
        </Button>
      </div>

      {/* Mobile: bottom preview sheet (tap a pin) */}
      <Sheet
        open={mobilePreviewOpen && Boolean(selectedListing)}
        onOpenChange={(open) => {
          setMobilePreviewOpen(open);
          if (!open) setSelectedId(null);
        }}
      >
        <SheetContent side="bottom" className="p-4 pt-5 rounded-t-2xl">
          <SheetHeader className="pb-3">
            <SheetTitle className="text-base">Listing preview</SheetTitle>
          </SheetHeader>
          {selectedListing ? (
            <ListingPreviewCard
              listing={selectedListing}
              onOpen={() => {
                window.location.href = `/listing/${encodeURIComponent(selectedListing.id)}`;
              }}
            />
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Desktop: right slide-over preview (click a pin) */}
      <div className="hidden lg:block">
        <Sheet
          modal={false}
          open={Boolean(selectedListing)}
          onOpenChange={(open) => {
            if (!open) setSelectedId(null);
          }}
        >
          <SheetContent
            side="right"
            hideOverlay
            className="w-[420px] max-w-[92vw] p-4 pt-5 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 shadow-2xl"
            onInteractOutside={(e) => e.preventDefault()}
            onPointerDownOutside={(e) => e.preventDefault()}
            onFocusOutside={(e) => e.preventDefault()}
          >
            <SheetHeader className="pb-3">
              <SheetTitle className="text-base flex items-center justify-between gap-2">
                <span>History</span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="rounded-xl"
                    onClick={() => setClickHistory([])}
                  >
                    Clear all
                  </Button>
                </div>
              </SheetTitle>
            </SheetHeader>

            <div className="flex flex-col gap-3 h-full">
              <div className="rounded-2xl border border-border bg-muted/10">
                <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/60">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <GitCompare className="h-4 w-4 text-primary-text" aria-hidden />
                    Compare
                    <span className="tabular-nums rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-foreground">
                      {compareIds.length}
                    </span>
                  </div>
                  <Button
                    asChild
                    size="sm"
                    className="rounded-xl"
                    disabled={compareIds.length < 2}
                    variant={compareIds.length >= 2 ? "default" : "secondary"}
                  >
                    <a href="/compare">{compareIds.length >= 2 ? "Open" : "Need 2+"}</a>
                  </Button>
                </div>

                <div className="p-2 flex flex-wrap gap-2">
                  {selectedListing ? (
                    <Button
                      type="button"
                      size="sm"
                      variant={compareIds.includes(selectedListing.id) ? "secondary" : "default"}
                      className="rounded-xl"
                      onClick={() => {
                        if (compareIds.includes(selectedListing.id)) removeCompareListingId(selectedListing.id);
                        else addCompareListingId(selectedListing.id);
                      }}
                    >
                      {compareIds.includes(selectedListing.id) ? "Remove active" : "Add active"}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-xl"
                    disabled={clickHistory.length < 2}
                    onClick={() => {
                      const ok = prepareCompareTrayFromIds(clickHistory.slice(0, 4));
                      if (ok) window.location.href = "/compare";
                    }}
                  >
                    Compare recent
                  </Button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto pr-1 space-y-2">
                {clickHistory.length === 0 ? (
                  <div className="rounded-2xl border border-border bg-muted/10 p-4 text-sm text-muted-foreground">
                    Click pins on the map to build a history stack. Hover still shows a quick preview.
                  </div>
                ) : (
                  clickHistory.map((id) => {
                    const l =
                      filtered.find((x) => x.id === id) ??
                      withCoords.find((x) => x.id === id) ??
                      null;
                    if (!l) return null;
                    const active = selectedId === id;
                    const inCompare = compareIds.includes(id);
                    return (
                      <div
                        key={id}
                        className={cn(
                          "rounded-2xl border border-border bg-card/80 hover:bg-card transition-colors overflow-hidden",
                          active ? "ring-2 ring-primary/40" : "",
                        )}
                      >
                        <button
                          type="button"
                          className="w-full text-left"
                          onClick={() => setSelectedId(id)}
                          aria-current={active ? "true" : undefined}
                        >
                          <ListingPreviewCard
                            listing={l}
                            size="compact"
                            onOpen={() => {
                              window.location.href = `/listing/${encodeURIComponent(l.id)}`;
                            }}
                          />
                        </button>
                        <div className="px-3 pb-3 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            className="rounded-xl"
                            onClick={() => {
                              window.location.href = `/listing/${encodeURIComponent(l.id)}`;
                            }}
                          >
                            Details
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={inCompare ? "secondary" : "outline"}
                            className="rounded-xl"
                            onClick={() => {
                              if (inCompare) removeCompareListingId(id);
                              else addCompareListingId(id);
                            }}
                          >
                            {inCompare ? "In compare" : "Add compare"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="rounded-xl ml-auto"
                            onClick={() => {
                              setClickHistory((cur) => cur.filter((x) => x !== id));
                              if (selectedId === id) setSelectedId(null);
                            }}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
};

export default GeoPointsPage;

