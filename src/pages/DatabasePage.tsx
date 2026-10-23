import AppHeader from "@/components/AppHeader";
import { ListingDatabaseTable } from "@/components/database/ListingDatabaseTable";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { COMPARE_UPDATED_EVENT, getCompareListingIds } from "@/lib/compareSelection";
import { DB_MISSING } from "@/lib/databaseFormat";
import { importListingDiffKey } from "@/lib/importAnalysis";
import { DATABASE_NUMERIC_SORT_DEFAULTS, type DatabaseSortDir, type DatabaseSortKey } from "@/lib/databaseSort";
import { getListingFlags, getListingTags, listingHasDataIssue } from "@/lib/listingDatabaseMeta";
import { useFavorites } from "@/hooks/usePrefs";
import { useListingStatusMap } from "@/hooks/useListingStatusMap";
import type { Listing } from "@/lib/types";
import { exportListingsAsCsv } from "@/lib/xmlParser";
import { cn } from "@/lib/utils";
import { useAppData } from "@/providers/DataProvider";
import { ChevronDown, Database as DatabaseIcon, Download, Filter, Search, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "@/components/ui/sonner";

const PAGE_SIZE = 60;

type SortKey = DatabaseSortKey;
type SortDir = DatabaseSortDir;

type QualityFilter = "all" | "issues" | "no_images" | "no_geo" | "no_agent" | "thin_title" | "no_price";

/** Import Δ row filter (keys match `ImportListingStatus` plus aggregates). */
type ImportStateFilter =
  | "all"
  | "has_diff"
  | "no_diff"
  | "new"
  | "updated"
  | "unchanged"
  | "removed"
  | "duplicate"
  | "new_or_updated";

function cmpFiniteNumber(a: unknown, b: unknown): number {
  const na = typeof a === "number" && Number.isFinite(a);
  const nb = typeof b === "number" && Number.isFinite(b);
  if (na && nb) return a - b;
  if (na && !nb) return -1;
  if (!na && nb) return 1;
  return 0;
}

const COL_DEFS: { key: string; label: string; defaultOn: boolean }[] = [
  { key: "importStatus", label: "Δ", defaultOn: true },
  { key: "reference", label: "Ref", defaultOn: true },
  { key: "listingId", label: "ID", defaultOn: false },
  { key: "title", label: "Title", defaultOn: true },
  { key: "tags", label: "Tags", defaultOn: false },
  { key: "purpose", label: "Purpose", defaultOn: true },
  { key: "type", label: "Type", defaultOn: true },
  { key: "price", label: "Price", defaultOn: true },
  { key: "bedrooms", label: "Bedrooms", defaultOn: true },
  { key: "bathrooms", label: "Bathrooms", defaultOn: true },
  { key: "area", label: "Area", defaultOn: true },
  { key: "images", label: "# Img", defaultOn: true },
  { key: "furnished", label: "Furn.", defaultOn: true },
  { key: "completion", label: "Completion", defaultOn: true },
  { key: "parking", label: "Park", defaultOn: true },
  { key: "permit", label: "Permit", defaultOn: true },
  { key: "amenities", label: "# Amn", defaultOn: true },
  { key: "location", label: "City / Area", defaultOn: true },
  { key: "subCommunity", label: "Sub", defaultOn: false },
  { key: "developer", label: "Developer", defaultOn: false },
  { key: "payment", label: "Payment", defaultOn: false },
  { key: "agent", label: "Agent", defaultOn: true },
  { key: "updated", label: "Updated", defaultOn: false },
  { key: "actions", label: "Link", defaultOn: true },
];

function safeLower(s: unknown): string {
  return String(s ?? "").toLowerCase();
}

/** Stable row identity for merged feeds (duplicate listing ids across agencies break React keys + sort). */
function mergedRowKey(agencyName: string, listingId: string): string {
  return `${agencyName}\u0001${listingId}`;
}

const DatabasePage = () => {
  const { listings, scope, setScope, listingsByAgency } = useAppData();
  const favorites = useFavorites();
  const { statusById, hasDiff } = useListingStatusMap();

  const tableSource = useMemo(() => {
    if (scope.mode === "all") {
      const out: { listing: Listing; rowKey: string }[] = [];
      for (const [agencyName, arr] of listingsByAgency.entries()) {
        for (const l of arr) {
          out.push({ listing: l, rowKey: mergedRowKey(agencyName, l.id) });
        }
      }
      return out;
    }
    return listings.map((l) => ({ listing: l, rowKey: l.id }));
  }, [scope.mode, listings, listingsByAgency]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [purposeFilter, setPurposeFilter] = useState<"all" | Listing["purpose"]>("all");
  const [propertyTypeFilter, setPropertyTypeFilter] = useState<"all" | string>("all");
  const [qualityFilter, setQualityFilter] = useState<QualityFilter>("all");
  const [importStateFilter, setImportStateFilter] = useState<ImportStateFilter>("all");
  const [dbTab, setDbTab] = useState<"table" | "summary">("table");
  const [sortKey, setSortKey] = useState<SortKey>("reference");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [compareTick, setCompareTick] = useState(0);

  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>(() => {
    const o: Record<string, boolean> = {};
    for (const c of COL_DEFS) o[c.key] = c.defaultOn;
    return o;
  });
  const [showColumnPanel, setShowColumnPanel] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim().toLowerCase()), 200);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!hasDiff) setImportStateFilter("all");
  }, [hasDiff]);

  useEffect(() => {
    const onCmp = () => setCompareTick((x) => x + 1);
    window.addEventListener(COMPARE_UPDATED_EVENT, onCmp);
    return () => {
      window.removeEventListener(COMPARE_UPDATED_EVENT, onCmp);
    };
  }, []);

  const compareSet = useMemo(() => new Set(getCompareListingIds()), [compareTick, tableSource.length]);

  const rows = useMemo(() => {
    return tableSource.map(({ listing: l, rowKey }) => {
      const fav = favorites.isFavorite(l.id);
      const tags = getListingTags(l);
      const flags = getListingFlags(l, { isFavorite: fav, inCompare: compareSet.has(l.id) });
      return { listing: l, tags, flags, rowKey };
    });
  }, [tableSource, compareSet, favorites]);

  const propertyTypeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const { listing: l } of rows) {
      const t = (l.propertyType ?? "").trim();
      if (t) set.add(t);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  useEffect(() => {
    if (propertyTypeFilter !== "all" && !propertyTypeOptions.includes(propertyTypeFilter)) {
      setPropertyTypeFilter("all");
    }
  }, [propertyTypeFilter, propertyTypeOptions]);

  const filtered = useMemo(() => {
    let out = rows;
    if (debouncedSearch) {
      const q = debouncedSearch;
      out = out.filter(({ listing: l }) => {
        return (
          safeLower(l.reference).includes(q) ||
          safeLower(l.id).includes(q) ||
          safeLower(l.title).includes(q) ||
          safeLower(l.city).includes(q) ||
          safeLower(l.community).includes(q) ||
          safeLower(l.propertyType).includes(q) ||
          safeLower(l.agent?.name).includes(q)
        );
      });
    }
    if (purposeFilter !== "all") {
      out = out.filter(({ listing: l }) => l.purpose === purposeFilter);
    }
    if (propertyTypeFilter !== "all") {
      out = out.filter(({ listing: l }) => (l.propertyType ?? "").trim() === propertyTypeFilter);
    }
    if (qualityFilter !== "all") {
      out = out.filter(({ listing: l, flags }) => {
        const ids = new Set(flags.map((f) => f.id));
        switch (qualityFilter) {
          case "issues":
            return listingHasDataIssue(flags);
          case "no_images":
            return ids.has("no_images");
          case "no_geo":
            return ids.has("no_geo");
          case "no_agent":
            return ids.has("no_agent");
          case "thin_title":
            return ids.has("thin_title");
          case "no_price":
            return ids.has("no_price");
          default:
            return true;
        }
      });
    }
    if (importStateFilter !== "all" && hasDiff) {
      out = out.filter(({ listing: l }) => {
        const st = statusById.get(importListingDiffKey(l));
        switch (importStateFilter) {
          case "has_diff":
            return Boolean(st);
          case "no_diff":
            return !st;
          case "new":
            return st === "new";
          case "updated":
            return st === "updated";
          case "unchanged":
            return st === "unchanged";
          case "removed":
            return st === "removed";
          case "duplicate":
            return st === "duplicate";
          case "new_or_updated":
            return st === "new" || st === "updated";
          default:
            return true;
        }
      });
    }
    return out;
  }, [rows, debouncedSearch, purposeFilter, propertyTypeFilter, qualityFilter, importStateFilter, hasDiff, statusById]);

  const purposeBreakdown = useMemo(() => {
    let sale = 0;
    let rent = 0;
    let unknown = 0;
    for (const { listing: l } of filtered) {
      if (l.purpose === "sale") sale += 1;
      else if (l.purpose === "rent") rent += 1;
      else unknown += 1;
    }
    return { sale, rent, unknown, total: filtered.length };
  }, [filtered]);

  const propertyTypeBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const { listing: l } of filtered) {
      const t = (l.propertyType ?? "").trim() || DB_MISSING;
      map.set(t, (map.get(t) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [filtered]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    copy.sort((a, b) => {
      const la = a.listing;
      const lb = b.listing;
      let cmp = 0;
      switch (sortKey) {
        case "reference":
          cmp = (la.reference || "").localeCompare(lb.reference || "");
          break;
        case "listingId":
          cmp = (la.id || "").localeCompare(lb.id || "");
          break;
        case "title":
          cmp = (la.title || "").localeCompare(lb.title || "");
          break;
        case "purpose":
          cmp = (la.purpose || "").localeCompare(lb.purpose || "");
          break;
        case "propertyType":
          cmp = (la.propertyType || "").localeCompare(lb.propertyType || "");
          break;
        case "price":
          cmp = cmpFiniteNumber(la.price, lb.price);
          break;
        case "beds":
          cmp = cmpFiniteNumber(la.beds, lb.beds);
          break;
        case "baths":
          cmp = cmpFiniteNumber(la.baths, lb.baths);
          break;
        case "area":
          cmp = cmpFiniteNumber(la.area, lb.area);
          break;
        case "city":
          cmp =
            (la.city || "").localeCompare(lb.city || "") ||
            (la.community || "").localeCompare(lb.community || "");
          break;
        case "images":
          cmp = (la.images?.length ?? 0) - (lb.images?.length ?? 0);
          break;
        case "parking":
          cmp = (la.parking ?? 0) - (lb.parking ?? 0);
          break;
        case "amenities":
          cmp = (la.amenities?.length ?? 0) - (lb.amenities?.length ?? 0);
          break;
        case "permit":
          cmp = (la.permitNumber || "").localeCompare(lb.permitNumber || "");
          break;
        case "furnished":
          cmp = (la.furnished || "").localeCompare(lb.furnished || "");
          break;
        case "completion":
          cmp = (la.completionStatus || "").localeCompare(lb.completionStatus || "");
          break;
        case "developer":
          cmp = (la.developer || "").localeCompare(lb.developer || "");
          break;
        case "subCommunity":
          cmp = (la.subCommunity || "").localeCompare(lb.subCommunity || "");
          break;
        case "lastUpdate":
          cmp = (la.lastUpdate || "").localeCompare(lb.lastUpdate || "");
          break;
        case "agentName":
          cmp = (la.agent?.name || "").localeCompare(lb.agent?.name || "");
          break;
        case "paymentMethod":
          cmp = (la.paymentMethod || "").localeCompare(lb.paymentMethod || "");
          break;
        case "importStatus": {
          const sa = statusById.get(importListingDiffKey(la)) ?? "";
          const sb = statusById.get(importListingDiffKey(lb)) ?? "";
          cmp = String(sa).localeCompare(String(sb));
          break;
        }
        default:
          cmp = 0;
      }
      if (cmp === 0) cmp = a.rowKey.localeCompare(b.rowKey);
      return cmp * dir;
    });
    return copy;
  }, [filtered, sortKey, sortDir, statusById]);

  const importDiffBreakdown = useMemo(() => {
    let newN = 0;
    let updatedN = 0;
    let unchangedN = 0;
    let removedN = 0;
    let duplicateN = 0;
    let noDiff = 0;
    for (const { listing: l } of filtered) {
      const st = statusById.get(importListingDiffKey(l));
      if (!st) noDiff += 1;
      else if (st === "new") newN += 1;
      else if (st === "updated") updatedN += 1;
      else if (st === "unchanged") unchangedN += 1;
      else if (st === "removed") removedN += 1;
      else if (st === "duplicate") duplicateN += 1;
    }
    return { newN, updatedN, unchangedN, removedN, duplicateN, noDiff };
  }, [filtered, statusById]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, purposeFilter, propertyTypeFilter, qualityFilter, importStateFilter, scope]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);
  const pageClamped = Math.min(page, totalPages);
  const pageSlice = sorted.slice((pageClamped - 1) * PAGE_SIZE, pageClamped * PAGE_SIZE);

  const toggleSort = useCallback(
    (key: SortKey) => {
      setPage(1);
      if (sortKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir(DATABASE_NUMERIC_SORT_DEFAULTS.includes(key) ? "desc" : "asc");
      }
    },
    [sortKey],
  );

  const exportFiltered = useCallback(() => {
    if (!sorted.length) {
      toast.error("Nothing to export");
      return;
    }
    exportListingsAsCsv(sorted.map((r) => r.listing));
    toast.success(`Exported ${sorted.length} listing${sorted.length === 1 ? "" : "s"}`);
  }, [sorted]);

  const issueCount = useMemo(() => rows.filter((r) => listingHasDataIssue(r.flags)).length, [rows]);

  const agencyNames = useMemo(() => Array.from(listingsByAgency.keys()).sort((a, b) => a.localeCompare(b)), [listingsByAgency]);

  const hiddenColCount = useMemo(
    () => COL_DEFS.filter((c) => visibleCols[c.key] === false).length,
    [visibleCols],
  );

  if (!tableSource.length) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="container max-w-3xl py-20 px-4 text-center">
          <DatabaseIcon className="w-14 h-14 mx-auto text-muted-foreground mb-4" aria-hidden />
          <h1 className="text-2xl font-bold font-heading text-foreground mb-2">Listing table</h1>
          <p className="text-muted-foreground mb-6">Upload an agency XML feed on Sources first. The database view is a dense, sortable table of every live listing.</p>
          <Button asChild>
            <Link to="/sources">Go to Sources</Link>
          </Button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background min-w-0">
      <AppHeader />
      <main className="container max-w-[1800px] min-w-0 w-full py-4 sm:py-5 px-3 sm:px-4 text-[13px]" aria-label="Listing table">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 mb-4">
          <div>
            <h1 className="text-lg sm:text-xl font-bold font-heading text-foreground tracking-tight flex items-center gap-1.5">
              <DatabaseIcon className="w-5 h-5 text-primary-text shrink-0" aria-hidden />
              Listing table
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl leading-snug">
              Every live listing in one sortable table — change status vs the previous version, specs, photos, permit and quality filters.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 shrink-0">
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 px-2.5" onClick={exportFiltered}>
              <Download className="w-3.5 h-3.5" aria-hidden />
              CSV
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs px-2.5" asChild>
              <Link to="/listings">Grid</Link>
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs px-2.5" asChild>
              <Link to="/validation">Validation</Link>
            </Button>
          </div>
        </div>

        <Collapsible className="mb-4">
          <CollapsibleTrigger className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground data-[state=open]:text-foreground transition-colors data-[state=open]:[&_svg]:rotate-180">
            <ChevronDown className="w-3.5 h-3.5 transition-transform shrink-0" />
            About this view
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 text-xs text-muted-foreground border border-border rounded-md p-3 bg-muted/20 space-y-2 leading-snug max-w-2xl">
            <p>
              <strong className="text-foreground">Tags</strong> (optional column) group sale/rent, type, and basics.
            </p>
            <p>
              <strong className="text-foreground">Data quality</strong> filters rows with missing media, map data, agent, title, or price — without showing a flag column.
            </p>
            <p>
              <strong className="text-foreground">Δ</strong> is import diff vs the previous run for the same agency.{" "}
              <strong className="text-foreground">—</strong> in that column means the listing has no change compared with the previous version of its source.
            </p>
            <p>
              Use <strong className="text-foreground">Import Δ</strong> to keep rows with a real diff, or isolate <strong className="text-foreground">new</strong>,{" "}
              <strong className="text-foreground">updated</strong>, or <strong className="text-foreground">unchanged</strong> (stable / “old”) listings.
            </p>
          </CollapsibleContent>
        </Collapsible>

        <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 mb-4">
          <Card className="shadow-sm">
            <CardHeader className="py-2 px-3 space-y-0">
              <CardDescription className="text-[10px]">Rows</CardDescription>
              <CardTitle className="text-lg tabular-nums leading-tight">{tableSource.length.toLocaleString()}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="shadow-sm">
            <CardHeader className="py-2 px-3 space-y-0">
              <CardDescription className="text-[10px]">Filtered</CardDescription>
              <CardTitle className="text-lg tabular-nums leading-tight">{sorted.length.toLocaleString()}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="shadow-sm">
            <CardHeader className="py-2 px-3 space-y-0">
              <CardDescription className="text-[10px]">Quality issues</CardDescription>
              <CardTitle className="text-lg tabular-nums text-warning leading-tight">{issueCount.toLocaleString()}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="shadow-sm transition-colors hover:bg-muted/30">
            <CardHeader className="py-2 px-3 space-y-0">
              <CardDescription className="text-[10px]">Favorites</CardDescription>
              <CardTitle className="text-lg tabular-nums leading-tight">
                <Link to="/favorites" className="hover:underline underline-offset-2">
                  {favorites.ids.size.toLocaleString()}
                </Link>
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Tabs value={dbTab} onValueChange={(v) => setDbTab(v as "table" | "summary")} className="w-full">
          <TabsList className="mb-4 grid h-auto w-full grid-cols-2 gap-1 rounded-lg p-1 sm:max-w-md sm:grid-cols-2">
            <TabsTrigger value="table" className="text-xs sm:text-sm">
              Data table
            </TabsTrigger>
            <TabsTrigger value="summary" className="text-xs sm:text-sm">
              Breakdown
            </TabsTrigger>
          </TabsList>

        <Card className="mb-4 border-border/80 shadow-sm">
          <CardContent className="pt-4 pb-3 space-y-3">
            <div className="flex flex-col xl:flex-row gap-3 xl:items-end">
              <div className="flex-1 space-y-1 min-w-0">
                <Label htmlFor="db-search" className="sr-only">
                  Search listings
                </Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" aria-hidden />
                  <Input
                    id="db-search"
                    placeholder="Search ref, title, city, type, agent…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8 h-8 text-xs"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2 items-end">
                <div className="space-y-0.5 min-w-0">
                  <Label className="text-[10px] text-muted-foreground">Scope</Label>
                  <Select
                    value={
                      scope.mode === "all" ? "all" : `agency:${scope.agencyName}`
                    }
                    onValueChange={(v) => {
                      if (v === "all") setScope({ mode: "all" });
                      else if (v.startsWith("agency:")) setScope({ mode: "agency", agencyName: v.slice(7) });
                    }}
                  >
                    <SelectTrigger className="w-[min(100vw-2rem,11rem)] h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All sources</SelectItem>
                      {agencyNames.map((name) => (
                        <SelectItem key={name} value={`agency:${name}`}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[10px] text-muted-foreground">Purpose</Label>
                  <Select value={purposeFilter} onValueChange={(v) => setPurposeFilter(v as typeof purposeFilter)}>
                    <SelectTrigger className="w-full min-w-0 sm:w-[6.5rem] max-w-full h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All purposes</SelectItem>
                      <SelectItem value="sale">Sale</SelectItem>
                      <SelectItem value="rent">Rent</SelectItem>
                      <SelectItem value="unknown">Unknown</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-0.5 min-w-0 max-w-[14rem]">
                  <Label className="text-[10px] text-muted-foreground">Property type</Label>
                  <Select
                    value={propertyTypeFilter}
                    onValueChange={(v) => setPropertyTypeFilter(v === "all" ? "all" : v)}
                  >
                    <SelectTrigger className="h-8 w-full text-xs">
                      <SelectValue placeholder="All types" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[min(280px,50vh)]">
                      <SelectItem value="all">All property types</SelectItem>
                      {propertyTypeOptions.map((pt) => (
                        <SelectItem key={pt} value={pt}>
                          {pt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Filter className="w-3 h-3" aria-hidden />
                    Quality
                  </Label>
                  <Select value={qualityFilter} onValueChange={(v) => setQualityFilter(v as QualityFilter)}>
                    <SelectTrigger className="w-full min-w-0 sm:w-[10.5rem] max-w-full h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All rows</SelectItem>
                      <SelectItem value="issues">Any quality flag</SelectItem>
                      <SelectItem value="no_images">No images</SelectItem>
                      <SelectItem value="no_geo">No map coordinates</SelectItem>
                      <SelectItem value="no_agent">No agent name</SelectItem>
                      <SelectItem value="thin_title">Weak title</SelectItem>
                      <SelectItem value="no_price">No price / POA</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-0.5 min-w-0">
                  <Label className="text-[10px] text-muted-foreground">Import Δ</Label>
                  <Select
                    value={importStateFilter}
                    onValueChange={(v) => setImportStateFilter(v as ImportStateFilter)}
                    disabled={!hasDiff}
                  >
                    <SelectTrigger className="w-full min-w-0 sm:w-[12.5rem] max-w-full h-8 text-xs">
                      <SelectValue placeholder={hasDiff ? "All rows" : "Needs an older version"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All rows</SelectItem>
                      <SelectItem value="has_diff">Changed since previous version</SelectItem>
                      <SelectItem value="no_diff">Unchanged</SelectItem>
                      <SelectItem value="new">New only</SelectItem>
                      <SelectItem value="updated">Updated</SelectItem>
                      <SelectItem value="unchanged">Unchanged (old)</SelectItem>
                      <SelectItem value="new_or_updated">New + updated</SelectItem>
                      <SelectItem value="removed">Removed</SelectItem>
                      <SelectItem value="duplicate">Duplicate</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowColumnPanel((v) => !v)}
                  className={cn(
                    "h-8 gap-1.5 rounded-xl border text-xs font-medium transition-all px-2.5",
                    showColumnPanel
                      ? "border-primary/40 bg-primary/10 text-foreground"
                      : "border-border bg-background text-muted-foreground hover:text-foreground hover:border-primary/25",
                  )}
                  aria-expanded={showColumnPanel}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" aria-hidden />
                  Columns
                  {hiddenColCount > 0 ? (
                    <span className="min-w-4 h-4 px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center tabular-nums">
                      {hiddenColCount}
                    </span>
                  ) : null}
                </Button>
              </div>
            </div>
            {showColumnPanel ? (
              <div className="rounded-xl border border-border bg-card/80 p-3 space-y-3 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-semibold text-foreground">Visible columns</h3>
                    <p className="text-[10px] text-muted-foreground mt-0.5 max-w-xl leading-snug">
                      Same idea as listing filters — open the panel and check the columns you want in the table.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5 shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-[10px] px-2"
                      onClick={() =>
                        setVisibleCols(Object.fromEntries(COL_DEFS.map((c) => [c.key, true])) as Record<string, boolean>)
                      }
                    >
                      Show all
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[10px] px-2"
                      onClick={() => {
                        const o: Record<string, boolean> = {};
                        for (const c of COL_DEFS) o[c.key] = c.defaultOn;
                        setVisibleCols(o);
                      }}
                    >
                      Reset defaults
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                  {COL_DEFS.map((c) => (
                    <div key={c.key} className="flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-muted/40">
                      <Checkbox
                        id={`db-col-${c.key}`}
                        checked={visibleCols[c.key] !== false}
                        onCheckedChange={(v) => setVisibleCols((prev) => ({ ...prev, [c.key]: v === true }))}
                      />
                      <Label htmlFor={`db-col-${c.key}`} className="text-[11px] font-normal cursor-pointer leading-tight">
                        {c.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground mr-0.5 shrink-0">Quality:</span>
                <ToggleGroup
                  type="single"
                  value={["issues", "no_images", "no_geo", "no_agent"].includes(qualityFilter) ? qualityFilter : ""}
                  onValueChange={(v) => setQualityFilter((v || "all") as QualityFilter)}
                  className="justify-start flex-wrap gap-1"
                >
                  <ToggleGroupItem value="issues" size="sm" aria-label="Filter rows with any quality flag" className="text-xs">
                    Issues
                  </ToggleGroupItem>
                  <ToggleGroupItem value="no_images" size="sm" className="text-xs">
                    No photos
                  </ToggleGroupItem>
                  <ToggleGroupItem value="no_geo" size="sm" className="text-xs">
                    No map
                  </ToggleGroupItem>
                  <ToggleGroupItem value="no_agent" size="sm" className="text-xs">
                    No agent
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
              {hasDiff ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground mr-0.5 shrink-0">Import Δ:</span>
                  <ToggleGroup
                    type="single"
                    value={
                      ["has_diff", "new", "updated", "unchanged", "new_or_updated"].includes(importStateFilter)
                        ? importStateFilter
                        : ""
                    }
                    onValueChange={(v) => setImportStateFilter((v || "all") as ImportStateFilter)}
                    className="justify-start flex-wrap gap-1"
                  >
                    <ToggleGroupItem value="has_diff" size="sm" className="text-xs" aria-label="Only rows changed since the previous version">
                      Changed only
                    </ToggleGroupItem>
                    <ToggleGroupItem value="new_or_updated" size="sm" className="text-xs">
                      New + upd
                    </ToggleGroupItem>
                    <ToggleGroupItem value="new" size="sm" className="text-xs">
                      New only
                    </ToggleGroupItem>
                    <ToggleGroupItem value="updated" size="sm" className="text-xs">
                      Updated
                    </ToggleGroupItem>
                    <ToggleGroupItem value="unchanged" size="sm" className="text-xs">
                      Old
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>
              ) : null}
              {(qualityFilter !== "all" ||
                importStateFilter !== "all" ||
                search ||
                propertyTypeFilter !== "all" ||
                purposeFilter !== "all") && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-xs self-start"
                  onClick={() => {
                    setQualityFilter("all");
                    setImportStateFilter("all");
                    setPropertyTypeFilter("all");
                    setPurposeFilter("all");
                    setSearch("");
                  }}
                >
                  Reset filters
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

          <TabsContent value="table" className="mt-0 space-y-4 focus-visible:outline-none">
        <ListingDatabaseTable
          rows={pageSlice.map(({ listing, tags, rowKey }) => ({ listing, tags, rowKey }))}
          visibleCols={visibleCols}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={toggleSort}
          statusById={statusById}
          resultCount={sorted.length}
        />

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mt-3">
          <p className="text-[10px] text-muted-foreground">
            {(pageClamped - 1) * PAGE_SIZE + 1}–{Math.min(pageClamped * PAGE_SIZE, sorted.length)} of {sorted.length.toLocaleString()}
          </p>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs px-2"
              disabled={pageClamped <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </Button>
            <span className="text-xs text-muted-foreground tabular-nums px-1">
              {pageClamped}/{totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs px-2"
              disabled={pageClamped >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground max-w-2xl leading-snug">
          Scroll inside the table area to keep the header row pinned to the top of that panel. Export uses filtered rows.
        </p>
          </TabsContent>

          <TabsContent value="summary" className="mt-0 space-y-4 focus-visible:outline-none">
            <p className="text-xs text-muted-foreground">
              Counts and the type table use the same filtered row set as the data table (filters above apply on both tabs).
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="shadow-sm">
                <CardHeader className="py-3 px-4 space-y-1">
                  <CardDescription className="text-[11px]">Total matching filters</CardDescription>
                  <CardTitle className="text-2xl font-bold tabular-nums">{purposeBreakdown.total.toLocaleString()}</CardTitle>
                </CardHeader>
              </Card>
              <Card className="shadow-sm border-emerald-500/20 bg-emerald-500/[0.04]">
                <CardHeader className="py-3 px-4 space-y-1">
                  <CardDescription className="text-[11px]">Sale</CardDescription>
                  <CardTitle className="text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                    {purposeBreakdown.sale.toLocaleString()}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card className="shadow-sm border-sky-500/20 bg-sky-500/[0.04]">
                <CardHeader className="py-3 px-4 space-y-1">
                  <CardDescription className="text-[11px]">Rent</CardDescription>
                  <CardTitle className="text-2xl font-bold tabular-nums text-sky-700 dark:text-sky-400">
                    {purposeBreakdown.rent.toLocaleString()}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card className="shadow-sm border-amber-500/20 bg-amber-500/[0.04]">
                <CardHeader className="py-3 px-4 space-y-1">
                  <CardDescription className="text-[11px]">Unknown purpose</CardDescription>
                  <CardTitle className="text-2xl font-bold tabular-nums text-amber-800 dark:text-amber-400">
                    {purposeBreakdown.unknown.toLocaleString()}
                  </CardTitle>
                </CardHeader>
              </Card>
            </div>
            {hasDiff ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <Card className="shadow-sm border-muted">
                  <CardHeader className="py-3 px-4 space-y-1">
                    <CardDescription className="text-[11px]">Unchanged (—)</CardDescription>
                    <CardTitle className="text-xl font-bold tabular-nums text-muted-foreground">
                      {importDiffBreakdown.noDiff.toLocaleString()}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card className="shadow-sm border-emerald-500/20 bg-emerald-500/[0.04]">
                  <CardHeader className="py-3 px-4 space-y-1">
                    <CardDescription className="text-[11px]">New</CardDescription>
                    <CardTitle className="text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                      {importDiffBreakdown.newN.toLocaleString()}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card className="shadow-sm border-primary/20 bg-primary/[0.06]">
                  <CardHeader className="py-3 px-4 space-y-1">
                    <CardDescription className="text-[11px]">Updated</CardDescription>
                    <CardTitle className="text-xl font-bold tabular-nums text-primary-text">
                      {importDiffBreakdown.updatedN.toLocaleString()}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card className="shadow-sm border-border bg-muted/30">
                  <CardHeader className="py-3 px-4 space-y-1">
                    <CardDescription className="text-[11px]">Unchanged (old)</CardDescription>
                    <CardTitle className="text-xl font-bold tabular-nums text-muted-foreground">
                      {importDiffBreakdown.unchangedN.toLocaleString()}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card className="shadow-sm border-destructive/20 bg-destructive/[0.06]">
                  <CardHeader className="py-3 px-4 space-y-1">
                    <CardDescription className="text-[11px]">Removed</CardDescription>
                    <CardTitle className="text-xl font-bold tabular-nums text-destructive-text">
                      {importDiffBreakdown.removedN.toLocaleString()}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card className="shadow-sm border-warning/25 bg-warning/[0.06]">
                  <CardHeader className="py-3 px-4 space-y-1">
                    <CardDescription className="text-[11px]">Duplicate</CardDescription>
                    <CardTitle className="text-xl font-bold tabular-nums text-warning">
                      {importDiffBreakdown.duplicateN.toLocaleString()}
                    </CardTitle>
                  </CardHeader>
                </Card>
              </div>
            ) : null}
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">By property type</CardTitle>
                <CardDescription>Sorted by count (desc), then name.</CardDescription>
              </CardHeader>
              <CardContent className="max-h-[min(52vh,480px)] overflow-auto pr-1">
                {propertyTypeBreakdown.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No rows match the current filters.</p>
                ) : (
                  <table className="w-full text-sm border-separate border-spacing-0">
                    <thead>
                      <tr className="border-b border-border text-left text-xs font-semibold text-muted-foreground">
                        <th className="sticky top-0 bg-card py-2 pr-4">Type</th>
                        <th className="sticky top-0 bg-card py-2 text-right w-24">Count</th>
                        <th className="sticky top-0 bg-card py-2 text-right w-28">Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {propertyTypeBreakdown.map(([name, count]) => {
                        const pct = purposeBreakdown.total ? (count / purposeBreakdown.total) * 100 : 0;
                        return (
                          <tr key={name} className="border-b border-border/50 hover:bg-muted/30">
                            <td className="py-2 pr-4 font-medium text-foreground align-middle">{name}</td>
                            <td className="py-2 text-right tabular-nums text-muted-foreground align-middle">
                              {count.toLocaleString()}
                            </td>
                            <td className="py-2 text-right tabular-nums text-muted-foreground align-middle">
                              {pct.toFixed(1)}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default DatabasePage;
