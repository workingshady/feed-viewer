import AppHeader from "@/components/AppHeader";
import { ListingsPageMapPanel } from "@/components/ListingsPageMapPanel";
import PropertyCard from "@/components/PropertyCard";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
    COMPARE_UPDATED_EVENT,
    getCompareListingIds,
} from "@/lib/compareSelection";
import { formatPriceCompact } from "@/lib/displayPrice";
import { buildListingHaystacks, listingMatchesQuery } from "@/lib/listingSearch";
import { computeFilteredPriceStats } from "@/lib/listingsFilteredStats";
import { readListingsPageUi, writeListingsPageUi } from "@/lib/listingsPageUiStorage";
import {
    clampZoomStep,
    GRID_COLUMN_MAX,
    GRID_COLUMN_MIN,
    LISTINGS_GRID_COL_CLASSES,
    readListingsGridColumnCount,
    readListingsZoom,
    writeListingsGridColumnCount,
    writeListingsZoom,
    ZOOM_DEFAULT,
} from "@/lib/listingsViewPrefs";
import {
    clearRecentListings,
    getRecentListings,
    RECENT_LISTINGS_UPDATED_EVENT,
    type RecentListingEntry,
} from "@/lib/recentListings";
import { useFavorites } from "@/hooks/usePrefs";
import { useListingStatusMap } from "@/hooks/useListingStatusMap";
import type { ImportListingStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { exportListingsAsCsv, exportListingsAsJson } from "@/lib/xmlParser";
import { useAppData } from "@/providers/DataProvider";
import { formatDistanceToNow } from "date-fns";
import {
    AlertTriangle,
    Banknote,
    BookOpen,
    Building2,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Clock,
    Download,
    LayoutGrid,
    MapPin,
    MapPinned,
    Search,
    Sigma,
    SlidersHorizontal,
    Upload,
    User,
    X,
    ZoomIn,
    ZoomOut,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

const PAGE_SIZE = 24;

type SortKey =
  | "newest" | "price_asc" | "price_desc" | "beds" | "baths"
  | "area" | "price_per_area" | "last_update" | "title_az";

const VALID_SORT = new Set<string>([
  "newest",
  "price_asc",
  "price_desc",
  "beds",
  "baths",
  "area",
  "price_per_area",
  "last_update",
  "title_az",
]);

const ListingsPage = () => {
  const { listings: allListings, selectedLiveVersion, scope, setScope, listingsByAgency } = useAppData();
  const favorites = useFavorites();
  const [search, setSearch] = useState(() => readListingsPageUi()?.search ?? "");
  const [searchDebounced, setSearchDebounced] = useState(() => readListingsPageUi()?.search ?? "");
  const [priceMin, setPriceMin] = useState(() => readListingsPageUi()?.priceMin ?? "");
  const [priceMax, setPriceMax] = useState(() => readListingsPageUi()?.priceMax ?? "");
  const [beds, setBeds] = useState(() => readListingsPageUi()?.beds ?? "");
  const [baths, setBaths] = useState(() => readListingsPageUi()?.baths ?? "");
  const [propType, setPropType] = useState(() => readListingsPageUi()?.propType ?? "all");
  const [community, setCommunity] = useState(() => readListingsPageUi()?.community ?? "all");
  const [purpose, setPurpose] = useState(() => readListingsPageUi()?.purpose ?? "all");
  const [agent, setAgent] = useState(() => readListingsPageUi()?.agent ?? "all");
  const [city, setCity] = useState(() => readListingsPageUi()?.city ?? "all");
  const [furnished, setFurnished] = useState(() => readListingsPageUi()?.furnished ?? "all");
  /** "has" = only listings with a non-empty video tour URL */
  const [videoTourFilter, setVideoTourFilter] = useState<"all" | "has">(
    () => (readListingsPageUi()?.videoTourFilter === "has" ? "has" : "all"),
  );
  const [sort, setSort] = useState<SortKey>(() => {
    const s = readListingsPageUi()?.sort;
    return s && VALID_SORT.has(s) ? (s as SortKey) : "newest";
  });
  const [page, setPage] = useState(() => {
    const p = readListingsPageUi()?.page;
    const n = typeof p === "number" ? p : Number(p);
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
  });
  const [showFilters, setShowFilters] = useState(() => Boolean(readListingsPageUi()?.showFilters));
  const [statusFilter, setStatusFilter] = useState<"all" | ImportListingStatus>(() => {
    const x = readListingsPageUi()?.statusFilter;
    if (x === "new" || x === "updated" || x === "duplicate") return x;
    return "all";
  });
  const [viewMode, setViewMode] = useState<"grid" | "map">(() =>
    readListingsPageUi()?.viewMode === "map" ? "map" : "grid",
  );
  const [gridColumnCount, setGridColumnCount] = useState(() => readListingsGridColumnCount());
  const [viewZoom, setViewZoom] = useState(() => readListingsZoom());
  const [filterGuideOpen, setFilterGuideOpen] = useState(false);
  const [recentEntries, setRecentEntries] = useState<RecentListingEntry[]>(() => getRecentListings());
  /** CSS `zoom` + browser pinch-zoom causes overlapping layout on small screens; disable in-page zoom here. */
  const [coarseLayout, setCoarseLayout] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 767px)").matches : false,
  );
  const [compareSlots, setCompareSlots] = useState(0);
  const [compareTick, setCompareTick] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const onChange = () => setCoarseLayout(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const sync = () => setCompareSlots(getCompareListingIds().length);
    sync();
    window.addEventListener(COMPARE_UPDATED_EVENT, sync);
    return () => window.removeEventListener(COMPARE_UPDATED_EVENT, sync);
  }, []);

  useEffect(() => {
    const onCmp = () => setCompareTick((x) => x + 1);
    window.addEventListener(COMPARE_UPDATED_EVENT, onCmp);
    return () => window.removeEventListener(COMPARE_UPDATED_EVENT, onCmp);
  }, []);

  const effectiveGridZoom = coarseLayout ? 1 : viewZoom;

  useEffect(() => {
    const sync = () => setRecentEntries(getRecentListings());
    sync();
    window.addEventListener(RECENT_LISTINGS_UPDATED_EVENT, sync);
    return () => window.removeEventListener(RECENT_LISTINGS_UPDATED_EVENT, sync);
  }, []);

  useEffect(() => {
    writeListingsGridColumnCount(gridColumnCount);
  }, [gridColumnCount]);
  useEffect(() => {
    writeListingsZoom(viewZoom);
  }, [viewZoom]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      writeListingsPageUi({
        search,
        priceMin,
        priceMax,
        beds,
        baths,
        propType,
        community,
        purpose,
        agent,
        city,
        furnished,
        videoTourFilter,
        sort,
        page,
        showFilters,
        statusFilter,
        viewMode,
      });
    }, 400);
    return () => window.clearTimeout(t);
  }, [
    search,
    priceMin,
    priceMax,
    beds,
    baths,
    propType,
    community,
    purpose,
    agent,
    city,
    furnished,
    videoTourFilter,
    sort,
    page,
    showFilters,
    statusFilter,
    viewMode,
  ]);

  const gridColClass = LISTINGS_GRID_COL_CLASSES[gridColumnCount] ?? LISTINGS_GRID_COL_CLASSES[4];
  const cardCompact = gridColumnCount >= 5;

  const agencyNames = useMemo(() => Array.from(listingsByAgency.keys()).sort((a, b) => a.localeCompare(b)), [listingsByAgency]);

  const recentStripItems = useMemo(() => {
    const byId = new Map(allListings.map((l) => [l.id, l]));
    return recentEntries.map((r) => {
      const live = byId.get(r.id);
      const rawTitle = live?.title?.trim() || r.title || r.reference || r.id;
      const displayTitle = rawTitle.length > 72 ? `${rawTitle.slice(0, 70)}…` : rawTitle;
      const rawRef = live?.reference?.trim() || r.reference || "";
      const refLabel = rawRef.length > 24 ? `${rawRef.slice(0, 22)}…` : rawRef;
      return {
        ...r,
        displayTitle,
        refLabel,
        inWorkspace: !!live,
      };
    });
  }, [recentEntries, allListings]);

  const validationIssueCount = selectedLiveVersion?.warnings
    ? selectedLiveVersion.warnings.errors.length + selectedLiveVersion.warnings.warnings.length
    : 0;

  useEffect(() => {
    const t = window.setTimeout(() => setSearchDebounced(search), 180);
    return () => window.clearTimeout(t);
  }, [search]);

  const { statusById } = useListingStatusMap();
  const favoritesSet = favorites.ids;
  const compareSet = useMemo(() => new Set(getCompareListingIds()), [compareTick]);

  const communities = useMemo(
    () => Array.from(new Set(allListings.map((l) => l.community).filter(Boolean))).sort(),
    [allListings],
  );
  const propTypes = useMemo(
    () => Array.from(new Set(allListings.map((l) => l.propertyType).filter(Boolean))).sort(),
    [allListings],
  );
  const cities = useMemo(
    () => Array.from(new Set(allListings.map((l) => l.city).filter(Boolean))).sort(),
    [allListings],
  );

  const agents = useMemo(() => {
    return Array.from(new Set(allListings.map((l) => l.agent?.name).filter(Boolean) as string[])).sort();
  }, [allListings]);
  const furnishedOptions = useMemo(() => {
    return Array.from(new Set(allListings.map((l) => l.furnished).filter(Boolean))).sort();
  }, [allListings]);

  /**
   * Free-text search reads eight fields per listing. Lowercasing them inside the filter meant
   * allocating eight strings per listing on every keystroke — `description` among them, the
   * longest field on the record. Fold each listing into one lowercase haystack instead, keyed
   * off `allListings` so it is rebuilt only when the listing set itself changes.
   */
  const searchHaystackById = useMemo(
    // Semantics are covered by src/lib/listingSearch.test.ts — keep the matching there, not inline.
    () => buildListingHaystacks(allListings),
    [allListings],
  );

  const filtered = useMemo(() => {
    // One predicate, one pass. This previously ran up to twelve chained .filter() calls, each
    // allocating a new array over the entire listing set, to produce a 24-item page. Conditions
    // are hoisted out of the loop so the per-listing work is just comparisons.
    const q = searchDebounced ? searchDebounced.toLowerCase() : "";
    // Empty-string checks below mirror the original truthiness guards: a "0" bound was already
    // treated as unset, and changing that here would alter which listings match.
    const priceMinNum = priceMin ? Number(priceMin) : null;
    const priceMaxNum = priceMax ? Number(priceMax) : null;
    const bedsNum = beds && beds !== "any" ? Number(beds) : null;
    const bathsNum = baths && baths !== "any" ? Number(baths) : null;

    // .filter() already returns a fresh array, so the later sort() needs no defensive copy.
    const items = allListings.filter((l) => {
      if (!listingMatchesQuery(searchHaystackById, l, q)) return false;
      if (priceMinNum !== null && !(l.price >= priceMinNum)) return false;
      if (priceMaxNum !== null && !(l.price <= priceMaxNum)) return false;
      if (bedsNum !== null && l.beds !== bedsNum) return false;
      if (bathsNum !== null && l.baths !== bathsNum) return false;
      if (propType !== "all" && l.propertyType !== propType) return false;
      if (community !== "all" && l.community !== community) return false;
      if (purpose !== "all" && l.purpose !== purpose) return false;
      if (agent !== "all" && (l.agent?.name || "") !== agent) return false;
      if (city !== "all" && l.city !== city) return false;
      if (furnished !== "all" && l.furnished !== furnished) return false;
      if (videoTourFilter === "has" && (l.videoTourUrl || "").trim().length === 0) return false;
      if (statusFilter !== "all" && statusById.get(l.id) !== statusFilter) return false;
      return true;
    });

    switch (sort) {
      case "price_asc": items.sort((a, b) => a.price - b.price); break;
      case "price_desc": items.sort((a, b) => b.price - a.price); break;
      case "beds": items.sort((a, b) => b.beds - a.beds); break;
      case "baths": items.sort((a, b) => (b.baths || 0) - (a.baths || 0)); break;
      case "area": items.sort((a, b) => (b.area || 0) - (a.area || 0)); break;
      case "price_per_area": items.sort((a, b) => { const ap = a.price && a.area ? a.price / a.area : -1; const bp = b.price && b.area ? b.price / b.area : -1; return bp - ap; }); break;
      case "last_update": items.sort((a, b) => String(b.lastUpdate || "").localeCompare(String(a.lastUpdate || ""))); break;
      case "title_az": items.sort((a, b) => String(a.title || "").localeCompare(String(b.title || ""))); break;
    }
    return items;
  }, [
    allListings,
    searchDebounced,
    priceMin,
    priceMax,
    beds,
    baths,
    propType,
    community,
    purpose,
    agent,
    city,
    furnished,
    videoTourFilter,
    sort,
    statusFilter,
    statusById,
    searchHaystackById,
  ]);

  const filteredPriceStats = useMemo(() => computeFilteredPriceStats(filtered), [filtered]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const clearFilters = () => {
    setSearch(""); setPriceMin(""); setPriceMax(""); setBeds(""); setBaths("");
    setPropType("all"); setCommunity("all"); setPurpose("all"); setAgent("all");
    setCity("all"); setFurnished("all"); setVideoTourFilter("all"); setStatusFilter("all"); setPage(1);
  };

  const activeFilters = useMemo(() => {
    const chips: { key: string; label: string; onClear: () => void }[] = [];
    if (search) chips.push({ key: "search", label: `"${search}"`, onClear: () => setSearch("") });
    if (priceMin) chips.push({ key: "pmin", label: `Min ${priceMin}`, onClear: () => setPriceMin("") });
    if (priceMax) chips.push({ key: "pmax", label: `Max ${priceMax}`, onClear: () => setPriceMax("") });
    if (beds && beds !== "any") chips.push({ key: "beds", label: beds === "0" ? "Studio" : `${beds} bed`, onClear: () => setBeds("") });
    if (baths && baths !== "any") chips.push({ key: "baths", label: `${baths} bath`, onClear: () => setBaths("") });
    if (propType !== "all") chips.push({ key: "type", label: propType, onClear: () => setPropType("all") });
    if (community !== "all") chips.push({ key: "comm", label: community, onClear: () => setCommunity("all") });
    if (purpose !== "all") chips.push({ key: "purp", label: purpose === "sale" ? "For Sale" : "For Rent", onClear: () => setPurpose("all") });
    if (agent !== "all") chips.push({ key: "agent", label: agent, onClear: () => setAgent("all") });
    if (city !== "all") chips.push({ key: "city", label: city, onClear: () => setCity("all") });
    if (furnished !== "all") chips.push({ key: "furn", label: furnished, onClear: () => setFurnished("all") });
    if (videoTourFilter === "has") {
      chips.push({
        key: "videoTour",
        label: "Has video tour",
        onClear: () => setVideoTourFilter("all"),
      });
    }
    if (statusFilter !== "all") chips.push({ key: "status", label: statusFilter, onClear: () => setStatusFilter("all") });
    return chips;
  }, [search, priceMin, priceMax, beds, baths, propType, community, purpose, agent, city, furnished, videoTourFilter, statusFilter]);

  /* ── Empty state ── */
  if (allListings.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="max-w-[1720px] mx-auto px-4 sm:px-6 py-24 sm:py-32 text-center">
          <div className="w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-6">
            <LayoutGrid className="w-10 h-10 text-primary-text" />
          </div>
          <h1 className="text-3xl font-extrabold font-heading text-foreground mb-3">No feeds yet</h1>
          <p className="text-muted-foreground mb-8 max-w-sm mx-auto">Upload an agency XML feed to start.</p>
          <Button asChild className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full h-11 px-8 font-semibold">
            <Link to="/sources"><Upload className="w-4 h-4 mr-2" />Go to Sources</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      {/* ── Hero title band + toolbar ── */}
      <div className="border-b border-border">
        <div className="relative overflow-hidden bg-primary text-primary-foreground">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.08]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(0deg, transparent, transparent 47px, rgba(255,255,255,0.5) 48px), repeating-linear-gradient(90deg, transparent, transparent 47px, rgba(255,255,255,0.5) 48px)",
            }}
          />
          <div className="max-w-[1720px] mx-auto px-4 sm:px-6 py-7 sm:py-10 relative min-w-0">
            <div className="text-[11px] uppercase tracking-[0.3em] text-primary-foreground/55 font-semibold mb-2">Property feed</div>
            <h1 className="text-2xl sm:text-4xl font-heading font-semibold tracking-tight text-primary-foreground break-words">
              {filtered.length.toLocaleString()}{" "}
              <span className="text-primary-foreground/55 font-medium">listings</span>
            </h1>
            <p className="text-sm text-primary-foreground/65 mt-2 font-body">
              Filter, map, export — every row links to a full detail view.
            </p>
          </div>
        </div>

        {recentStripItems.length > 0 && (
          <div className="border-b border-border bg-primary-foreground/[0.07]">
            <div className="max-w-[1720px] mx-auto px-4 sm:px-6 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4 min-w-0">
              <div className="flex items-center justify-between gap-3 sm:justify-start sm:min-w-[10rem]">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary-foreground/55">
                  <Clock className="w-3.5 h-3.5 shrink-0 opacity-90" aria-hidden />
                  Recently viewed
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[11px] text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10 sm:hidden"
                  onClick={() => clearRecentListings()}
                  aria-label="Clear recently viewed listings"
                >
                  Clear
                </Button>
              </div>
              <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:thin]">
                {recentStripItems.map((r) => (
                  <Link
                    key={r.id}
                    to={`/listing/${encodeURIComponent(r.id)}`}
                    title={`${r.displayTitle}${r.refLabel ? ` · ${r.refLabel}` : ""} — opened ${formatDistanceToNow(r.viewedAt, { addSuffix: true })}`}
                    className={cn(
                      "shrink-0 max-w-[min(100%,14rem)] rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                      r.inWorkspace
                        ? "border-primary-foreground/25 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/18"
                        : "border-primary-foreground/15 bg-primary-foreground/[0.06] text-primary-foreground/75 hover:bg-primary-foreground/12",
                    )}
                  >
                    <span className="block truncate">{r.displayTitle}</span>
                    {r.refLabel ? (
                      <span className="block truncate font-mono text-[10px] text-primary-foreground/50">{r.refLabel}</span>
                    ) : null}
                  </Link>
                ))}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="hidden h-7 shrink-0 px-2 text-[11px] text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10 sm:inline-flex"
                onClick={() => clearRecentListings()}
                aria-label="Clear recently viewed listings"
              >
                Clear
              </Button>
            </div>
          </div>
        )}

        <div className="bg-card/80 backdrop-blur-sm border-b border-border">
          <div className="max-w-[1720px] mx-auto px-4 sm:px-6 py-3 sm:py-4 w-full min-w-0">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4 min-w-0">
              <div className="shrink-0">
                <div className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-xs text-muted-foreground font-medium">
                  <span>Page</span>
                  <span className="text-foreground tabular-nums">{page}</span>
                  <span>of</span>
                  <span className="text-foreground tabular-nums">{totalPages || 1}</span>
                </div>
              </div>

            <div className="flex w-full min-w-0 flex-col gap-2 sm:gap-2.5 lg:max-w-[85%] xl:max-w-none">
              <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              {/* Scope selector */}
              <Select
                value={scope.mode === "agency" ? `agency:${scope.agencyName}` : scope.mode}
                onValueChange={(v) => {
                  if (v === "all") setScope({ mode: "all" });
                  else if (v.startsWith("agency:")) setScope({ mode: "agency", agencyName: v.slice(7) });
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-10 sm:h-9 w-full min-w-0 sm:w-44 sm:min-w-[11rem] bg-background border-border text-foreground hover:border-primary/30 rounded-xl text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border text-foreground">
                  <SelectItem value="all">All sources</SelectItem>
                  {agencyNames.length > 0 && (
                    <>
                      <div className="px-2 py-1 text-[10px] text-muted-foreground uppercase tracking-wider">Agencies</div>
                      {agencyNames.map(a => <SelectItem key={a} value={`agency:${a}`}>{a}</SelectItem>)}
                    </>
                  )}
                </SelectContent>
              </Select>

              {/* View toggle */}
              <ToggleGroup type="single" value={viewMode} onValueChange={(v) => v && setViewMode(v as "grid" | "map")} className="flex w-full min-w-0 shrink-0 justify-stretch bg-background border border-border rounded-xl p-1 gap-0.5 sm:inline-flex sm:w-auto">
                <ToggleGroupItem value="grid" className="flex-1 sm:flex-none rounded-lg h-9 sm:h-7 w-full sm:w-8 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground text-muted-foreground hover:text-foreground">
                  <LayoutGrid className="w-3.5 h-3.5" />
                </ToggleGroupItem>
                <ToggleGroupItem value="map" className="flex-1 sm:flex-none rounded-lg h-9 sm:h-7 w-full sm:w-8 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground text-muted-foreground hover:text-foreground">
                  <MapPinned className="w-3.5 h-3.5" />
                </ToggleGroupItem>
              </ToggleGroup>

              {viewMode === "grid" && (
                <Select
                  value={String(gridColumnCount)}
                  onValueChange={(v) => {
                    const n = Number(v);
                    if (n >= GRID_COLUMN_MIN && n <= GRID_COLUMN_MAX) setGridColumnCount(n);
                  }}
                >
                  <SelectTrigger
                    title="Columns on wide screens (responsive steps on smaller widths)"
                    className="h-10 sm:h-9 w-full min-w-0 sm:w-28 bg-background border-border text-foreground hover:border-primary/30 rounded-xl text-xs"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <LayoutGrid className="w-3.5 h-3.5 shrink-0 opacity-70" />
                      <SelectValue placeholder="Columns" />
                    </div>
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border text-foreground min-w-[12rem]">
                    <div className="px-2 py-1.5 text-[10px] text-muted-foreground uppercase tracking-wider border-b border-border mb-1">
                      Max columns (large screens)
                    </div>
                    {Array.from({ length: GRID_COLUMN_MAX }, (_, i) => i + 1).map((n) => (
                      <SelectItem
                        key={n}
                        value={String(n)}
                        className="text-xs font-mono font-semibold tabular-nums"
                        title={
                          n === 1
                            ? "One column — full width, image on top"
                            : n <= 3
                              ? "Fewer columns — wider cards on large screens"
                              : n >= 5
                                ? "More columns — compact; controls stay in a fixed strip"
                                : "Balanced columns for typical desktops"
                        }
                      >
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <div
                className={cn(
                  "flex w-full min-w-0 items-center justify-center rounded-xl border border-border bg-background p-0.5 gap-0.5 sm:w-auto sm:justify-start",
                  coarseLayout && "opacity-90",
                )}
                title={
                  coarseLayout
                    ? "Card zoom is available on wider screens — avoids overlap when the page is zoomed."
                    : "Zoom listing cards and map"
                }
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 sm:h-8 sm:w-8 p-0 rounded-lg text-muted-foreground hover:text-foreground touch-manipulation disabled:opacity-40"
                  title="Zoom out"
                  disabled={coarseLayout}
                  onClick={() => setViewZoom(z => clampZoomStep(-1, z))}
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </Button>
                <span className="text-[11px] font-semibold tabular-nums text-foreground min-w-[2.75rem] text-center">
                  {Math.round((coarseLayout ? 1 : viewZoom) * 100)}%
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 sm:h-8 sm:w-8 p-0 rounded-lg text-muted-foreground hover:text-foreground touch-manipulation disabled:opacity-40"
                  title="Zoom in"
                  disabled={coarseLayout}
                  onClick={() => setViewZoom(z => clampZoomStep(1, z))}
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </Button>
                {viewZoom !== ZOOM_DEFAULT && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 px-2 sm:h-8 rounded-lg text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-40"
                    disabled={coarseLayout}
                    onClick={() => setViewZoom(ZOOM_DEFAULT)}
                  >
                    Reset
                  </Button>
                )}
              </div>

              {/* Sort */}
              <Select value={sort} onValueChange={v => setSort(v as SortKey)}>
                <SelectTrigger className="h-10 sm:h-9 w-full min-w-0 sm:w-40 sm:min-w-[10rem] bg-background border-border text-foreground hover:border-primary/30 rounded-xl text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border text-foreground">
                  <SelectItem value="newest">Newest first</SelectItem>
                  <SelectItem value="price_asc">Price: Low → High</SelectItem>
                  <SelectItem value="price_desc">Price: High → Low</SelectItem>
                  <SelectItem value="beds">Most beds</SelectItem>
                  <SelectItem value="baths">Most baths</SelectItem>
                  <SelectItem value="area">Largest area</SelectItem>
                  <SelectItem value="price_per_area">Price / sqft</SelectItem>
                  <SelectItem value="last_update">Last updated</SelectItem>
                  <SelectItem value="title_az">Title A → Z</SelectItem>
                </SelectContent>
              </Select>

              {/* Filters toggle */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className={cn("h-10 sm:h-9 w-full sm:w-auto min-h-[44px] sm:min-h-0 gap-1.5 rounded-xl border text-xs font-medium transition-all touch-manipulation", showFilters ? "border-primary/40 bg-primary/10 text-foreground" : "border-border bg-background text-muted-foreground hover:text-foreground hover:border-primary/25")}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Filters
                {activeFilters.length > 0 && (
                  <span className="ml-1 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                    {activeFilters.length}
                  </span>
                )}
              </Button>

              {/* Export */}
              <Button variant="ghost" size="sm" onClick={() => exportListingsAsJson(filtered)} className="h-10 sm:h-9 min-h-[44px] sm:min-h-0 w-full sm:w-auto gap-1.5 rounded-xl border border-border bg-background text-muted-foreground hover:text-foreground text-xs touch-manipulation">
                <Download className="w-3.5 h-3.5" /> JSON
              </Button>
              <Button variant="ghost" size="sm" onClick={() => exportListingsAsCsv(filtered)} className="h-10 sm:h-9 min-h-[44px] sm:min-h-0 w-full sm:w-auto gap-1.5 rounded-xl border border-border bg-background text-muted-foreground hover:text-foreground text-xs touch-manipulation">
                <Download className="w-3.5 h-3.5" /> CSV
              </Button>

              </div>
            </div>
            </div>
          </div>
        </div>
      </div>

      <div
        className={cn(
          "max-w-[1720px] mx-auto px-4 sm:px-6 py-5 sm:py-6 overflow-x-hidden min-w-0",
          compareSlots > 0 && "pb-28 sm:pb-24",
        )}
      >
        {/* Validation banner */}
        {validationIssueCount > 0 && (
          <div className="mb-5 rounded-2xl border border-yellow-500/20 bg-yellow-500/5 px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm text-foreground">
              <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400 shrink-0" />
              Live version has <strong className="text-foreground">{validationIssueCount}</strong> validation signal{validationIssueCount === 1 ? "" : "s"}
            </span>
            <Button asChild size="sm" variant="ghost" className="border border-yellow-500/30 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-500/10 rounded-xl h-8 text-xs">
              <Link to="/validation">View dashboard</Link>
            </Button>
          </div>
        )}

        {/* Search bar */}
        <div className="relative mb-4">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search title, description, city, community, reference, agent…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-11 h-11 bg-background border-border text-foreground placeholder:text-muted-foreground rounded-2xl focus:border-primary/50 focus:ring-0 focus:ring-offset-0"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="absolute right-4 top-1/2 -translate-y-1/2 rounded-md text-muted-foreground hover:text-foreground transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/40"
            >
              <X className="w-4 h-4" aria-hidden />
            </button>
          )}
        </div>

        {filtered.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-border/80 bg-muted/25 px-4 py-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <Sigma className="h-4 w-4 shrink-0 text-primary-text" aria-hidden />
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Filtered snapshot</span>
            </div>
            <span className="tabular-nums">
              {filtered.length.toLocaleString()} listing{filtered.length === 1 ? "" : "s"}
            </span>
            {(["sale", "rent"] as const).map((purpose) => {
              const st = filteredPriceStats[purpose];
              if (!st) return null;
              return (
                <span key={purpose} className="inline-flex flex-wrap items-baseline gap-x-1.5">
                  <span className="hidden text-border sm:inline">·</span>
                  {purpose === "sale" ? "Sale" : "Rent"} {st.count.toLocaleString()} · median{" "}
                  <span className="font-semibold text-foreground">
                    {filteredPriceStats.currency} {formatPriceCompact(st.median)}
                    {purpose === "rent" ? "/yr" : ""}
                  </span>
                  <span className="hidden font-mono text-xs md:inline">
                    ({formatPriceCompact(st.min)}–{formatPriceCompact(st.max)})
                  </span>
                </span>
              );
            })}
            {filteredPriceStats.pricedCount === 0 && (
              <span className="text-xs">No numeric prices in this result set</span>
            )}
          </div>
        )}

        {/* Filter panel */}
        {showFilters && (
          <div className="bg-card border border-border rounded-2xl overflow-hidden mb-5 shadow-[var(--shadow-card)] animate-fade-in">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 px-5 py-4 border-b border-border bg-accent/25">
              <div>
                <h2 className="text-sm font-bold font-heading text-foreground tracking-tight">Filter properties</h2>
                <p className="text-xs text-muted-foreground mt-1 max-w-xl leading-relaxed">
                  Combine fields below with the search bar. Every filter uses <strong className="text-foreground font-medium">AND</strong> logic — listings must match all active choices.
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 shrink-0 text-xs text-muted-foreground hover:text-foreground gap-1 border border-border rounded-xl self-start">
                <X className="w-3 h-3" /> Clear all
              </Button>
            </div>

            <Collapsible open={filterGuideOpen} onOpenChange={setFilterGuideOpen} className="border-b border-border">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-5 py-3 text-left text-xs font-semibold text-foreground hover:bg-accent/40 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <BookOpen className="w-3.5 h-3.5 text-primary-text shrink-0" />
                    Quick guide — how filters work
                  </span>
                  <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform shrink-0", filterGuideOpen && "rotate-180")} />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="px-5 pb-4">
                <ul className="text-xs text-muted-foreground space-y-2.5 leading-relaxed border border-border/80 rounded-xl bg-background/50 p-4">
                  <li>
                    <span className="text-foreground font-medium">Search</span> scans title, description, city, community, building, reference, internal id, and agent name (partial match, not case-sensitive).
                  </li>
                  <li>
                    <span className="text-foreground font-medium">Price min / max</span> include listings with a numeric price in range. Empty fields are ignored.
                  </li>
                  <li>
                    <span className="text-foreground font-medium">Beds / baths</span> are exact matches. Studio = 0 beds.
                  </li>
                  <li>
                    <span className="text-foreground font-medium">Type, community, city, furnished, purpose, agent</span> narrow to a single value from your current feed.
                  </li>
                  <li>
                    <span className="text-foreground font-medium">Status</span> refers to the latest import diff (new / updated / duplicate), when available.
                  </li>
                  <li className="text-[11px] pt-1 border-t border-border/60">
                    Active filters appear as chips under this panel; remove one at a time or use Clear all.
                  </li>
                </ul>
              </CollapsibleContent>
            </Collapsible>

            <div className="p-5 space-y-8">
              <section>
                <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground mb-3 pb-2 border-b border-border/80">
                  <Banknote className="w-3.5 h-3.5 text-primary-text" />
                  Price range
                </h3>
                <p className="text-[11px] text-muted-foreground mb-3">Numeric asking price or rent in feed currency. Leave blank for no bound.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
                  <Input placeholder="Min price" type="number" value={priceMin} onChange={e => { setPriceMin(e.target.value); setPage(1); }} className="h-10 bg-background border-border text-foreground placeholder:text-muted-foreground rounded-xl text-sm" />
                  <Input placeholder="Max price" type="number" value={priceMax} onChange={e => { setPriceMax(e.target.value); setPage(1); }} className="h-10 bg-background border-border text-foreground placeholder:text-muted-foreground rounded-xl text-sm" />
                </div>
              </section>

              <section>
                <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground mb-3 pb-2 border-b border-border/80">
                  <Building2 className="w-3.5 h-3.5 text-primary-text" />
                  Property details
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {(
                    [
                      { val: beds || "any", set: (v: string) => { setBeds(v); setPage(1); }, placeholder: "Beds", options: [["any", "Any beds"], ...["0","1","2","3","4","5","6","7"].map(n => [n, n === "0" ? "Studio" : `${n} bed`])] },
                      { val: baths || "any", set: (v: string) => { setBaths(v); setPage(1); }, placeholder: "Baths", options: [["any", "Any baths"], ...["1","2","3","4","5","6"].map(n => [n, `${n} bath`])] },
                      { val: propType, set: (v: string) => { setPropType(v); setPage(1); }, placeholder: "Property type", options: [["all", "All types"], ...propTypes.map(t => [t, t])] },
                      { val: furnished, set: (v: string) => { setFurnished(v); setPage(1); }, placeholder: "Furnished", options: [["all", "Any furnished"], ...furnishedOptions.map(f => [f, f])] },
                      { val: purpose, set: (v: string) => { setPurpose(v); setPage(1); }, placeholder: "Purpose", options: [["all", "All purposes"], ["sale", "For sale"], ["rent", "For rent"]] },
                      {
                        val: videoTourFilter,
                        set: (v: string) => {
                          setVideoTourFilter(v as "all" | "has");
                          setPage(1);
                        },
                        placeholder: "Video tour",
                        options: [
                          ["all", "Any (video tour)"],
                          ["has", "Has video tour URL"],
                        ],
                      },
                    ] as { val: string; set: (v: string) => void; placeholder: string; options: [string, string][] }[]
                  ).map(({ val, set, placeholder, options }) => (
                    <Select key={placeholder} value={val} onValueChange={set}>
                      <SelectTrigger className="h-10 bg-background border-border text-foreground hover:border-primary/30 rounded-xl text-sm">
                        <SelectValue placeholder={placeholder} />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border-border text-foreground max-h-64">
                        {options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground mb-3 pb-2 border-b border-border/80">
                  <MapPin className="w-3.5 h-3.5 text-primary-text" />
                  Location
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {(
                    [
                      { val: city, set: (v: string) => { setCity(v); setPage(1); }, placeholder: "City", options: [["all", "All cities"], ...cities.map(c => [c, c])] },
                      { val: community, set: (v: string) => { setCommunity(v); setPage(1); }, placeholder: "Community", options: [["all", "All communities"], ...communities.map(c => [c, c])] },
                    ] as { val: string; set: (v: string) => void; placeholder: string; options: [string, string][] }[]
                  ).map(({ val, set, placeholder, options }) => (
                    <Select key={placeholder} value={val} onValueChange={set}>
                      <SelectTrigger className="h-10 bg-background border-border text-foreground hover:border-primary/30 rounded-xl text-sm">
                        <SelectValue placeholder={placeholder} />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border-border text-foreground max-h-64">
                        {options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground mb-3 pb-2 border-b border-border/80">
                  <User className="w-3.5 h-3.5 text-primary-text" />
                  People & import
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {(
                    [
                      { val: agent, set: (v: string) => { setAgent(v); setPage(1); }, placeholder: "Agent", options: [["all", "All agents"], ...agents.map(a => [a, a])] },
                      { val: statusFilter, set: (v: string) => { setStatusFilter(v as "all" | ImportListingStatus); setPage(1); }, placeholder: "Import status", options: [["all", "All statuses"], ["new", "New"], ["updated", "Updated"], ["duplicate", "Duplicate"]] },
                    ] as { val: string; set: (v: string) => void; placeholder: string; options: [string, string][] }[]
                  ).map(({ val, set, placeholder, options }) => (
                    <Select key={placeholder} value={val} onValueChange={set}>
                      <SelectTrigger className="h-10 bg-background border-border text-foreground hover:border-primary/30 rounded-xl text-sm">
                        <SelectValue placeholder={placeholder} />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border-border text-foreground max-h-64">
                        {options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ))}
                </div>
              </section>
            </div>
          </div>
        )}

        {/* Active filter chips */}
        {activeFilters.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-5">
            {activeFilters.map(c => (
              <button
                key={c.key}
                type="button"
                onClick={() => { c.onClear(); setPage(1); }}
                aria-label={`Remove filter ${c.label}`}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/15 border border-primary/25 text-primary-text text-xs font-medium hover:bg-primary/25 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/40"
              >
                {c.label}
                <X className="w-3 h-3 text-primary-text/50" aria-hidden />
              </button>
            ))}
            <button
              type="button"
              onClick={clearFilters}
              className="px-3 py-1 rounded-full border border-border text-muted-foreground text-xs hover:text-foreground hover:border-primary/25 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/40"
            >
              Clear all
            </button>
          </div>
        )}

        {/* Map cap warning */}
        {/* Empty results */}
        {filtered.length === 0 ? (
          <div className="rounded-[1.75rem] border border-border bg-card p-16 text-center shadow-[var(--shadow-card)]">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/15 flex items-center justify-center mx-auto mb-4">
              <Search className="w-7 h-7 text-primary-text/40" />
            </div>
            <h2 className="text-lg font-bold font-heading text-foreground mb-2">No results</h2>
            <p className="text-sm text-muted-foreground mb-6">Try adjusting your filters or search query.</p>
            <Button variant="ghost" onClick={clearFilters} className="border border-border text-muted-foreground hover:text-foreground rounded-full h-9 text-sm">
              Clear filters
            </Button>
          </div>
        ) : viewMode === "map" ? (
          <div className="rounded-[1.75rem] mb-8 overflow-hidden border border-border shadow-[var(--shadow-card)] origin-top">
            {/* No CSS zoom here — it makes Leaflet repaint every frame (same as full map page). */}
            <ListingsPageMapPanel listings={filtered} />
          </div>
        ) : (
          <>
            <div
              className="w-full min-w-0 origin-top mb-8"
              style={{ zoom: effectiveGridZoom }}
            >
              <div
                className={cn(
                  "grid w-full min-w-0",
                  gridColClass,
                  cardCompact ? "gap-4" : "gap-6"
                )}
              >
                {paginated.map(listing => (
                  <div key={listing.id} className="min-w-0 h-full">
                    <PropertyCard
                      listing={listing}
                      highlightQuery={searchDebounced.trim()}
                      status={statusById.get(listing.id)}
                      isFavorite={favoritesSet.has(listing.id)}
                      inCompare={compareSet.has(listing.id)}
                      compact={cardCompact}
                    />
                  </div>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-4 pb-8">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage(p => p - 1)}
                    className="h-9 w-9 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-primary/25 disabled:opacity-30 p-0"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                      let p = i + 1;
                      if (totalPages > 7) {
                        if (page <= 4) p = i + 1;
                        else if (page >= totalPages - 3) p = totalPages - 6 + i;
                        else p = page - 3 + i;
                      }
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setPage(p)}
                          className={cn(
                            "w-9 h-9 rounded-full text-sm font-medium transition-all",
                            p === page
                              ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                              : "text-muted-foreground hover:text-foreground hover:bg-accent border border-transparent hover:border-border"
                          )}
                        >
                          {p}
                        </button>
                      );
                    })}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => p + 1)}
                    className="h-9 w-9 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-primary/25 disabled:opacity-30 p-0"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ListingsPage;
