import { useListingsWithRawXml } from "@/hooks/useListingRawXml";
import { Fragment, useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  BarChart3,
  ClipboardList,
  FileDown,
  FileSearch,
  GitBranch,
  Image as ImageIconLucide,
  ImageOff,
  Layers,
  ListChecks,
  Loader2,
  PieChart as PieChartIcon,
  ScanSearch,
  ShieldAlert,
  Table2,
} from "lucide-react";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChartTableActions, Columns, DataTable, Donut, HBars, SERIES, type TableData } from "@/components/charts/ChartKit";
import {
  XML_EDA_MAX_PATHS_CEILING,
  computeFieldCoabsenceMatrix,
  computeFieldCoverageBuckets,
  computeFieldPresenceTable,
  computeImageCountDistribution,
  computeMissingFieldCountDistribution,
  computeSegmentQuality,
  countListingsAllRequiredFilled,
  countMissingListingFields,
  filterListingsByPurpose,
  groupXmlPathsByPrefix,
  isAgencyLogoPresent,
  isAgentPhotoMissing,
  isListingFieldFilled,
  LISTING_FIELD_QUALITY_KEYS,
  pickCoabsenceFieldKeys,
  type CoabsenceMatrix,
  type FieldPresenceRow,
  type PurposeAnalyticsFilter,
  type SegmentQualityKey,
} from "@/lib/listingFieldPresence";
import type { Listing } from "@/lib/types";
import { UI_FIELDS } from "@/lib/types";
import { NoSourceState, SourcePicker, VersionPicker } from "@/components/SourcePicker";
import { useVersionListings } from "@/hooks/useSources";
import { liveVersionOf, type SourceDTO, type VersionDTO } from "@/lib/sourcesApi";
import { useAppData } from "@/providers/DataProvider";
import { cn } from "@/lib/utils";
import { useDataProfile } from "@/hooks/useDataProfile";
import { profileInsights, type Insight } from "@/lib/dataProfile";
import {
  FieldProfilesPanel,
  IssuesPanel,
  KeyInsights,
  ProfilingNote,
  QualityScorecard,
  ValueFormatsCard,
  XmlSummary,
  XmlTreePanel,
} from "@/components/quality/ProfilePanels";

const LISTINGS = [{ key: "count", label: "Listings", color: SERIES[0] }];
const COVERAGE = [{ key: "pct", label: "Coverage %", color: SERIES[0] }];
const pctFmt = (n: number) => `${Math.round(n)}%`;
type DashboardTab = "overview" | "fields" | "issues" | "mapped" | "xml" | "segments" | "patterns" | "report";
type SortKey = "label" | "filled" | "missing" | "pct";
type SortDir = "asc" | "desc";
type XmlPathTableSortKey = "path" | "withValue" | "withPath" | "pctSample" | "pctWhenPresent";
type MissingDistOrder = "byGaps" | "byCountDesc" | "byCountAsc";
type CoverageFieldScope = "all" | "required";

/** Display order for coverage bar rows (same N fields; order only). */
type CoverageChartOrderBy =
  | "pct_asc"
  | "pct_desc"
  | "label_asc"
  | "label_desc"
  | "filled_desc"
  | "filled_asc"
  | "missing_desc"
  | "missing_asc";

type CoverageBarRow = { label: string; pct: number; filled: number; missing: number };

function applyCoverageBarOrder(rows: CoverageBarRow[], order: CoverageChartOrderBy): CoverageBarRow[] {
  const out = [...rows];
  out.sort((a, b) => {
    switch (order) {
      case "pct_asc":
        return a.pct - b.pct || a.label.localeCompare(b.label);
      case "pct_desc":
        return b.pct - a.pct || a.label.localeCompare(b.label);
      case "label_asc":
        return a.label.localeCompare(b.label);
      case "label_desc":
        return b.label.localeCompare(a.label);
      case "filled_desc":
        return b.filled - a.filled || a.label.localeCompare(b.label);
      case "filled_asc":
        return a.filled - b.filled || a.label.localeCompare(b.label);
      case "missing_desc":
        return b.missing - a.missing || a.label.localeCompare(b.label);
      case "missing_asc":
        return a.missing - b.missing || a.label.localeCompare(b.label);
      default:
        return 0;
    }
  });
  return out;
}

const COVERAGE_ORDER_SELECT_ITEMS: { value: CoverageChartOrderBy; label: string }[] = [
  { value: "pct_asc", label: "Coverage % (low → high)" },
  { value: "pct_desc", label: "Coverage % (high → low)" },
  { value: "label_asc", label: "Field name (A–Z)" },
  { value: "label_desc", label: "Field name (Z–A)" },
  { value: "filled_desc", label: "Filled count (high → low)" },
  { value: "filled_asc", label: "Filled count (low → high)" },
  { value: "missing_desc", label: "Empty count (high → low)" },
  { value: "missing_asc", label: "Empty count (low → high)" },
];


function csvCell(v: string): string {
  const s = String(v).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadTextFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const XML_PATH_PRESETS = [40, 80, 120, 200] as const;

export default function FieldQualityPage() {
  const { selectedSource } = useAppData();
  const [pickedVersionId, setPickedVersionId] = useState("live");
  useEffect(() => {
    setPickedVersionId("live");
  }, [selectedSource?.id]);
  const live = selectedSource ? liveVersionOf(selectedSource) : null;
  const version = selectedSource
    ? (pickedVersionId === "live" ? live : selectedSource.versions.find((v) => v.id === pickedVersionId)) ?? live
    : null;
  const listingsQ = useListingsWithRawXml(version);

  if (!selectedSource || !version) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="container py-8">
          <SourcePicker className="mb-4" />
          {!selectedSource ? (
            <NoSourceState what="field coverage" />
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">
              This source has no versions yet.{" "}
              <Link to={`/sources?source=${selectedSource.id}`} className="text-primary-text underline">
                Go to Sources
              </Link>
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <FieldQualityBody
      source={selectedSource}
      version={version}
      listings={listingsQ.data ?? null}
      failed={!!listingsQ.error}
      onVersionChange={setPickedVersionId}
    />
  );
}

function FieldQualityBody({
  source,
  version,
  listings: versionListings,
  failed,
  onVersionChange,
}: {
  source: SourceDTO;
  version: VersionDTO;
  listings: Listing[] | null;
  failed: boolean;
  onVersionChange: (id: string) => void;
}) {
  const [dashTab, setDashTab] = useState<DashboardTab>("overview");
  const [focusField, setFocusField] = useState<string | undefined>();
  const [xmlMaxPaths, setXmlMaxPaths] = useState(80);
  const [prefixDepth, setPrefixDepth] = useState<1 | 2 | 3>(2);
  const [xmlPathSearch, setXmlPathSearch] = useState("");
  const [segmentKey, setSegmentKey] = useState<SegmentQualityKey>("propertyType");
  const [mappedSearch, setMappedSearch] = useState("");
  const [requiredOnly, setRequiredOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("pct");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [purposeFilter, setPurposeFilter] = useState<PurposeAnalyticsFilter>("all");
  const [coverageBarLimit, setCoverageBarLimit] = useState<12 | 24 | 36 | 48>(24);
  const [coverageFieldScope, setCoverageFieldScope] = useState<CoverageFieldScope>("all");
  const [lowestCoverageOrderBy, setLowestCoverageOrderBy] = useState<CoverageChartOrderBy>("pct_asc");
  const [highestCoverageOrderBy, setHighestCoverageOrderBy] = useState<CoverageChartOrderBy>("pct_desc");
  const [segmentTopK, setSegmentTopK] = useState<8 | 14 | 20 | 30>(14);
  const [missingDistOrder, setMissingDistOrder] = useState<MissingDistOrder>("byGaps");
  const [xmlPathSortKey, setXmlPathSortKey] = useState<XmlPathTableSortKey>("pctSample");
  const [xmlPathSortDir, setXmlPathSortDir] = useState<SortDir>("asc");
  const [heatmapKeyLimit, setHeatmapKeyLimit] = useState<12 | 18 | 24>(18);
  const [prefixSortKey, setPrefixSortKey] = useState<"prefix" | "paths" | "avg" | "minmax">("avg");

  const sessionSnapshotLoading = versionListings === null && !failed;
  const resolvedListings = useMemo(() => versionListings ?? [], [versionListings]);

  const analyticsListings = useMemo(
    () => filterListingsByPurpose(resolvedListings, purposeFilter),
    [resolvedListings, purposeFilter],
  );

  const presenceRows = useMemo(() => computeFieldPresenceTable(analyticsListings), [analyticsListings]);
  const missingDist = useMemo(() => computeMissingFieldCountDistribution(analyticsListings), [analyticsListings]);
  const isLiveVersion = version.id === liveVersionOf(source)?.id;
  const { profile, xml: xmlProfile, progress: profileProgress, running: profiling, error: profileError } = useDataProfile(
    analyticsListings,
    `${version.id}:${purposeFilter}:${analyticsListings.length}`,
  );
  const insights = useMemo(() => {
    if (!profile) return [];
    const out = profileInsights(profile);
    if (xmlProfile?.unusedWithData) {
      const names = xmlProfile.paths.filter((p) => p.warnings.includes("Has data the app does not use")).map((p) => p.short);
      out.push({ severity: "info", text: `${xmlProfile.unusedWithData} raw XML path${xmlProfile.unusedWithData === 1 ? " has" : "s have"} data the app does not read: ${names.slice(0, 4).join(", ")}${names.length > 4 ? "…" : ""}.`, go: "xml" });
    }
    const mixed = xmlProfile?.paths.filter((p) => p.mixedTypes) ?? [];
    if (mixed.length) out.push({ severity: "warning", text: `${mixed.length} XML path${mixed.length === 1 ? " mixes" : "s mix"} value types (e.g. numbers and text): ${mixed.slice(0, 3).map((p) => p.short).join(", ")}.`, go: "xml" });
    return out;
  }, [profile, xmlProfile]);
  const goTo = (tab: NonNullable<Insight["go"]>, field?: string) => {
    setFocusField(field);
    setDashTab(tab);
  };
  const xmlEda = useMemo(() => {
    const all = (xmlProfile?.paths ?? []).filter((p) => !p.isAttribute);
    const rowsFull = all
      .map((p) => ({
        path: p.path,
        listingsWithPath: p.listingsWithPath,
        listingsWithValue: p.listingsWithValue,
        pctOfSampleWithValue: Math.round(p.fillPct * 10) / 10,
        pctOfAppearancesFilled: Math.round(p.filledWhenPresentPct * 10) / 10,
      }))
      .sort((a, b) => a.pctOfSampleWithValue - b.pctOfSampleWithValue || b.listingsWithPath - a.listingsWithPath);
    const rows = rowsFull.slice(0, xmlMaxPaths);
    return {
      rows,
      sampleSize: xmlProfile?.sampleSize ?? 0,
      truncatedListings: false,
      listingsSkippedNoRawXml: xmlProfile?.skippedNoXml ?? 0,
      totalPathsDiscovered: rowsFull.length,
      pathsShown: rows.length,
      pathsTruncated: rowsFull.length > rows.length,
    };
  }, [xmlProfile, xmlMaxPaths]);

  const coabsenceKeys = useMemo(
    () => pickCoabsenceFieldKeys(presenceRows, heatmapKeyLimit),
    [presenceRows, heatmapKeyLimit],
  );
  const coabsence = useMemo(
    () => computeFieldCoabsenceMatrix(analyticsListings, coabsenceKeys),
    [analyticsListings, coabsenceKeys],
  );

  const segmentRows = useMemo(
    () => computeSegmentQuality(analyticsListings, segmentKey, segmentTopK),
    [analyticsListings, segmentKey, segmentTopK],
  );

  const prefixGroups = useMemo(
    () => groupXmlPathsByPrefix(xmlEda.rows, prefixDepth),
    [xmlEda.rows, prefixDepth],
  );

  const filteredXmlRows = useMemo(() => {
    const q = xmlPathSearch.trim().toLowerCase();
    if (!q) return xmlEda.rows;
    return xmlEda.rows.filter((r) => r.path.toLowerCase().includes(q));
  }, [xmlEda.rows, xmlPathSearch]);

  const sortedXmlDetailRows = useMemo(() => {
    const rows = [...filteredXmlRows];
    const mult = xmlPathSortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      switch (xmlPathSortKey) {
        case "path":
          return mult * a.path.localeCompare(b.path);
        case "withValue":
          return mult * (a.listingsWithValue - b.listingsWithValue);
        case "withPath":
          return mult * (a.listingsWithPath - b.listingsWithPath);
        case "pctSample":
          return mult * (a.pctOfSampleWithValue - b.pctOfSampleWithValue);
        case "pctWhenPresent":
          return mult * (a.pctOfAppearancesFilled - b.pctOfAppearancesFilled);
        default:
          return 0;
      }
    });
    return rows;
  }, [filteredXmlRows, xmlPathSortKey, xmlPathSortDir]);

  const sortedPrefixGroups = useMemo(() => {
    const g = [...prefixGroups];
    switch (prefixSortKey) {
      case "prefix":
        return g.sort((a, b) => a.prefix.localeCompare(b.prefix));
      case "paths":
        return g.sort((a, b) => b.distinctPaths - a.distinctPaths);
      case "avg":
        return g.sort((a, b) => a.avgPctSampleWithValue - b.avgPctSampleWithValue);
      case "minmax":
        return g.sort(
          (a, b) =>
            a.minPctSampleWithValue - b.minPctSampleWithValue ||
            b.maxPctSampleWithValue - a.maxPctSampleWithValue,
        );
      default:
        return g;
    }
  }, [prefixGroups, prefixSortKey]);

  const requiredKeySet = useMemo(
    () =>
      new Set(
        UI_FIELDS.filter((f) => f.required && f.key !== "id" && f.key !== "rawXml").map((f) => f.key),
      ),
    [],
  );

  const coverageBaseRows = useMemo(() => {
    if (coverageFieldScope === "required") {
      return presenceRows.filter((r) => requiredKeySet.has(r.key));
    }
    return presenceRows;
  }, [presenceRows, coverageFieldScope, requiredKeySet]);

  const fieldCoverageBuckets = useMemo(() => computeFieldCoverageBuckets(presenceRows), [presenceRows]);
  const imageCountBuckets = useMemo(() => computeImageCountDistribution(analyticsListings), [analyticsListings]);
  const segmentBars = useMemo(
    () =>
      segmentRows.map((r) => ({
        label: r.segment.length > 28 ? `${r.segment.slice(0, 26)}…` : r.segment,
        meanMissing: r.meanMissing,
        avgCoveragePct: r.avgCoveragePct,
        count: r.count,
      })),
    [segmentRows],
  );

  const missingDistSorted = useMemo(() => {
    const arr = [...missingDist];
    if (missingDistOrder === "byCountDesc") {
      return arr.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    }
    if (missingDistOrder === "byCountAsc") {
      return arr.sort((a, b) => a.count - b.count || a.label.localeCompare(b.label));
    }
    return arr;
  }, [missingDist, missingDistOrder]);

  const sortedMappedRows = useMemo(() => {
    let rows = presenceRows;
    if (requiredOnly) rows = rows.filter((r) => requiredKeySet.has(r.key));
    const q = mappedSearch.trim().toLowerCase();
    if (q) rows = rows.filter((r) => r.label.toLowerCase().includes(q));
    const mult = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sortKey === "label") return mult * a.label.localeCompare(b.label);
      if (sortKey === "filled") return mult * (a.filled - b.filled);
      if (sortKey === "missing") return mult * (a.missing - b.missing);
      return mult * (a.pct - b.pct);
    });
  }, [presenceRows, requiredOnly, requiredKeySet, mappedSearch, sortKey, sortDir]);

  const worstListingsByGaps = useMemo(() => {
    return [...analyticsListings]
      .map((l) => ({ l, gaps: countMissingListingFields(l) }))
      .sort((a, b) => b.gaps - a.gaps)
      .slice(0, 8);
  }, [analyticsListings]);

  const kpis = useMemo(() => {
    const n = analyticsListings.length;
    if (!n) {
      return {
        n: 0,
        meanMissing: 0,
        complete: 0,
        noPhotos: 0,
        noPriceNoPoa: 0,
        missingAgentPhoto: 0,
        avgCompletenessPct: 0,
        rawXmlEmpty: 0,
      };
    }
    let sumM = 0;
    let complete = 0;
    let noPhotos = 0;
    let noPriceNoPoa = 0;
    let missingAgentPhoto = 0;
    let sumCoverage = 0;
    let rawXmlEmpty = 0;
    const fieldCount = LISTING_FIELD_QUALITY_KEYS.length || 1;
    for (const l of analyticsListings) {
      const m = countMissingListingFields(l);
      sumM += m;
      sumCoverage += ((fieldCount - m) / fieldCount) * 100;
      if (m === 0) complete++;
      if (!l.images?.length) noPhotos++;
      const hasPrice = typeof l.price === "number" && l.price > 0;
      const poa =
        String(l.priceOnApplication ?? "")
          .trim()
          .toLowerCase() === "yes";
      if (!hasPrice && !poa) noPriceNoPoa++;
      if (isAgentPhotoMissing(l)) missingAgentPhoto++;
      if (!l.rawXml?.trim()) rawXmlEmpty++;
    }
    return {
      n,
      meanMissing: Math.round((sumM / n) * 10) / 10,
      complete,
      noPhotos,
      noPriceNoPoa,
      missingAgentPhoto,
      avgCompletenessPct: Math.round((sumCoverage / n) * 10) / 10,
      rawXmlEmpty,
    };
  }, [analyticsListings]);

  const requiredCompliance = useMemo(() => countListingsAllRequiredFilled(analyticsListings), [analyticsListings]);

  const coverageLowestPool = useMemo((): CoverageBarRow[] => {
    return [...coverageBaseRows]
      .sort((a, b) => a.pct - b.pct || a.label.localeCompare(b.label))
      .slice(0, coverageBarLimit)
      .map((r) => ({ label: r.label, pct: r.pct, filled: r.filled, missing: r.missing }));
  }, [coverageBaseRows, coverageBarLimit]);

  const coverageHighestPool = useMemo((): CoverageBarRow[] => {
    return [...coverageBaseRows]
      .sort((a, b) => b.pct - a.pct || a.label.localeCompare(b.label))
      .slice(0, coverageBarLimit)
      .map((r) => ({ label: r.label, pct: r.pct, filled: r.filled, missing: r.missing }));
  }, [coverageBaseRows, coverageBarLimit]);

  const coverageLowest = useMemo(
    () => applyCoverageBarOrder(coverageLowestPool, lowestCoverageOrderBy),
    [coverageLowestPool, lowestCoverageOrderBy],
  );

  const coverageHighest = useMemo(
    () => applyCoverageBarOrder(coverageHighestPool, highestCoverageOrderBy),
    [coverageHighestPool, highestCoverageOrderBy],
  );

  const pieRequiredData = useMemo(
    () => [
      { name: "All required fields OK", value: requiredCompliance.pass },
      { name: "Missing ≥1 required", value: requiredCompliance.fail },
    ],
    [requiredCompliance],
  );

  const logoForHeader = isAgencyLogoPresent(source.agencyInfo ?? undefined);

  const worstFiveFields = useMemo(
    () => [...presenceRows].sort((a, b) => a.pct - b.pct).slice(0, 5),
    [presenceRows],
  );

  const reportBullets = useMemo(() => {
    if (!kpis.n) return [];
    const lines: string[] = [
      `${kpis.n.toLocaleString()} listings in analysis scope (${source.name} v${version.number})${purposeFilter !== "all" ? `; purpose filter: ${purposeFilter} (${resolvedListings.length} in dataset before filter)` : ""}.`,
      `Average completeness: ${kpis.avgCompletenessPct}% of mapped fields filled per listing; mean empty fields per listing: ${kpis.meanMissing}.`,
      `${kpis.complete.toLocaleString()} listings (${Math.round((kpis.complete / kpis.n) * 100)}%) have no empty mapped fields.`,
      `Required-field rule pass: ${requiredCompliance.pass.toLocaleString()} (${kpis.n ? Math.round((requiredCompliance.pass / kpis.n) * 100) : 0}%), fail: ${requiredCompliance.fail.toLocaleString()}.`,
      `${kpis.noPhotos.toLocaleString()} listings with no images; ${kpis.noPriceNoPoa.toLocaleString()} without numeric price and not marked POA.`,
      `Weakest mapped fields by coverage: ${worstFiveFields.map((r) => `${r.label} (${r.pct}%)`).join("; ")}.`,
    ];
    if (xmlEda.sampleSize > 0) {
      lines.push(
        `Raw XML path scan: ${xmlEda.sampleSize} listings sampled, ${xmlEda.totalPathsDiscovered} distinct paths found, table shows ${xmlEda.pathsShown}${xmlEda.pathsTruncated ? ` (truncated from ${xmlEda.totalPathsDiscovered})` : ""}.`,
      );
      if (xmlEda.listingsSkippedNoRawXml > 0) {
        lines.push(`${xmlEda.listingsSkippedNoRawXml} sampled rows had no raw XML stored.`);
      }
    }
    if (kpis.rawXmlEmpty > 0) {
      lines.push(`${kpis.rawXmlEmpty} listings in scope have empty raw XML (path EDA may be limited).`);
    }
    return lines;
  }, [kpis, source.name, version.number, purposeFilter, requiredCompliance, resolvedListings.length, worstFiveFields, xmlEda]);

  const exportPresenceCsv = () => {
    const headers = ["field_key", "label", "filled", "empty", "pct_filled"];
    const lines = [
      headers.join(","),
      ...presenceRows.map((r) =>
        [csvCell(String(r.key)), csvCell(r.label), r.filled, r.missing, r.pct].join(","),
      ),
    ];
    downloadTextFile(`field-quality-mapped-${Date.now()}.csv`, lines.join("\n"), "text/csv;charset=utf-8");
  };

  const exportXmlPathsCsv = () => {
    const headers = [
      "path",
      "listings_with_value",
      "listings_with_path",
      "pct_of_sample_with_value",
      "pct_when_path_present",
    ];
    const lines = [
      headers.join(","),
      ...xmlEda.rows.map((r) =>
        [
          csvCell(r.path),
          r.listingsWithValue,
          r.listingsWithPath,
          r.pctOfSampleWithValue,
          r.pctOfAppearancesFilled,
        ].join(","),
      ),
    ];
    downloadTextFile(`field-quality-xml-paths-${Date.now()}.csv`, lines.join("\n"), "text/csv;charset=utf-8");
  };

  const exportCombinedCsv = () => {
    exportPresenceCsv();
    exportXmlPathsCsv();
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir(key === "label" ? "asc" : key === "pct" ? "asc" : "desc");
    } else {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    }
  };

  const toggleXmlPathSort = (key: XmlPathTableSortKey) => {
    if (xmlPathSortKey !== key) {
      setXmlPathSortKey(key);
      setXmlPathSortDir(
        key === "path" ? "asc" : key === "pctSample" || key === "pctWhenPresent" ? "asc" : "desc",
      );
    } else {
      setXmlPathSortDir((d) => (d === "asc" ? "desc" : "asc"));
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-primary-text">
            <ScanSearch className="w-6 h-6 shrink-0" />
            <h1 className="text-2xl font-extrabold font-heading tracking-tight">Field coverage &amp; feed EDA</h1>
          </div>
          <p className="text-sm text-muted-foreground max-w-4xl leading-relaxed">
            Exploratory analysis of mapped listing fields and raw XML paths: coverage, missingness patterns, segments, and
            exportable reports. Switch dataset scope below, then use the tabs for each analysis area.
          </p>
        </div>

        <Card className="border-primary/15 shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-heading flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary-text" />
              Dataset
            </CardTitle>
            <CardDescription>
              Pick a version of this source, then optionally narrow analysis by listing purpose (sale / rent / unknown).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-4 sm:items-end">
              <div className="space-y-2 min-w-[200px]">
                <Label className="text-xs text-muted-foreground">Purpose filter (analysis scope)</Label>
                <Select value={purposeFilter} onValueChange={(v) => setPurposeFilter(v as PurposeAnalyticsFilter)}>
                  <SelectTrigger className="rounded-xl w-full sm:w-[220px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All purposes</SelectItem>
                    <SelectItem value="sale">Sale only</SelectItem>
                    <SelectItem value="rent">Rent only</SelectItem>
                    <SelectItem value="unknown">Unknown purpose only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <VersionPicker source={source} label="Version" value={version.id} onChange={onVersionChange} />

            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="rounded-full border border-border px-3 py-1 bg-accent/40 tabular-nums inline-flex items-center gap-1.5">
                {sessionSnapshotLoading ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin shrink-0 text-primary-text" aria-hidden />
                    Loading version…
                  </>
                ) : (
                  <>{resolvedListings.length.toLocaleString()} in dataset</>
                )}
              </span>
              {!sessionSnapshotLoading &&
                (purposeFilter !== "all" ? (
                  <span className="rounded-full border border-primary/25 px-3 py-1 bg-primary/5 tabular-nums font-medium text-foreground">
                    {analyticsListings.length.toLocaleString()} analyzed ({purposeFilter})
                  </span>
                ) : (
                  <span className="rounded-full border border-border px-3 py-1 bg-muted/50 tabular-nums">
                    {analyticsListings.length.toLocaleString()} analyzed
                  </span>
                ))}
              <span
                className={cn(
                  "rounded-full border px-3 py-1 font-medium",
                  logoForHeader
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
                    : "border-amber-500/35 bg-amber-500/10 text-amber-900 dark:text-amber-100",
                )}
              >
                Agency logo: {logoForHeader ? "present" : "missing"}
              </span>
            </div>
          </CardContent>
        </Card>

        {sessionSnapshotLoading ? (
          <Card className="border-dashed border-primary/20">
            <CardContent className="py-16 flex flex-col items-center justify-center gap-3 text-muted-foreground text-sm">
              <Loader2 className="h-9 w-9 animate-spin text-primary-text" aria-hidden />
              <p role="status">Loading version listings…</p>
            </CardContent>
          </Card>
        ) : resolvedListings.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center text-muted-foreground text-sm space-y-2">
              <p>{failed ? "Could not load this version's listings." : "No listings in this version."}</p>
            </CardContent>
          </Card>
        ) : analyticsListings.length === 0 ? (
          <Card className="border-dashed border-amber-500/30">
            <CardContent className="py-16 text-center space-y-3">
              <p className="text-sm text-muted-foreground">
                No listings match the current purpose filter ({purposeFilter}). {resolvedListings.length.toLocaleString()}{" "}
                listing{resolvedListings.length === 1 ? "" : "s"} in the dataset.
              </p>
              <Button variant="outline" className="rounded-xl" onClick={() => setPurposeFilter("all")}>
                Reset to all purposes
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Tabs value={dashTab} onValueChange={(v) => setDashTab(v as DashboardTab)} className="space-y-6">
            <TabsList className="flex flex-wrap h-auto w-full justify-start gap-1 p-1 bg-muted/40">
              <TabsTrigger value="overview" className="text-xs sm:text-sm gap-1.5">
                <BarChart3 className="w-3.5 h-3.5 opacity-70" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="fields" className="text-xs sm:text-sm gap-1.5">
                <FileSearch className="w-3.5 h-3.5 opacity-70" />
                Field profiles
              </TabsTrigger>
              <TabsTrigger value="issues" className="text-xs sm:text-sm gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 opacity-70" />
                Issues
                {profile && profile.rules.some((r) => r.severity === "error" && r.count > 0) && (
                  <span className="rounded-full bg-destructive/15 px-1.5 text-[10px] font-semibold text-destructive tabular-nums">
                    {profile.rules.filter((r) => r.severity === "error" && r.count > 0).length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="mapped" className="text-xs sm:text-sm gap-1.5">
                <Table2 className="w-3.5 h-3.5 opacity-70" />
                Mapped schema
              </TabsTrigger>
              <TabsTrigger value="xml" className="text-xs sm:text-sm gap-1.5">
                <GitBranch className="w-3.5 h-3.5 opacity-70" />
                Raw XML paths
              </TabsTrigger>
              <TabsTrigger value="segments" className="text-xs sm:text-sm gap-1.5">
                <ListChecks className="w-3.5 h-3.5 opacity-70" />
                Segments
              </TabsTrigger>
              <TabsTrigger value="patterns" className="text-xs sm:text-sm gap-1.5">
                <ScanSearch className="w-3.5 h-3.5 opacity-70" />
                Patterns
              </TabsTrigger>
              <TabsTrigger value="report" className="text-xs sm:text-sm gap-1.5">
                <ClipboardList className="w-3.5 h-3.5 opacity-70" />
                Report
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6 outline-none mt-0">
              {profileError && <p className="text-sm text-destructive">Full analysis failed: {profileError}</p>}
              {profiling && !profile && <ProfilingNote progress={profileProgress} n={analyticsListings.length} />}
              {profile && (
                <div className="grid gap-6 xl:grid-cols-[1.15fr_1fr]">
                  <QualityScorecard profile={profile} xml={xmlProfile} />
                  <KeyInsights insights={insights} onGo={goTo} />
                </div>
              )}
              <Card className="border-primary/12 bg-muted/15 shadow-none">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-heading">Interactive coverage settings</CardTitle>
                  <CardDescription>
                    These options only affect the lowest/highest <strong>field coverage</strong> bar charts. KPIs and other tabs
                    always use the full analysis listing set (dataset + purpose filter).
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
                  <div className="space-y-2 min-w-[180px]">
                    <Label className="text-xs text-muted-foreground">Bars per coverage chart</Label>
                    <Select
                      value={String(coverageBarLimit)}
                      onValueChange={(v) => setCoverageBarLimit(Number(v) as 12 | 24 | 36 | 48)}
                    >
                      <SelectTrigger className="rounded-xl w-[160px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="12">12 fields</SelectItem>
                        <SelectItem value="24">24 fields</SelectItem>
                        <SelectItem value="36">36 fields</SelectItem>
                        <SelectItem value="48">48 fields</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 min-w-[220px]">
                    <Label className="text-xs text-muted-foreground">Field set for those charts</Label>
                    <Select
                      value={coverageFieldScope}
                      onValueChange={(v) => setCoverageFieldScope(v as CoverageFieldScope)}
                    >
                      <SelectTrigger className="rounded-xl w-full sm:w-[240px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All mapped fields</SelectItem>
                        <SelectItem value="required">Required fields only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              <div className="grid sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4 gap-4">
                <Kpi
                  label="Avg completeness"
                  value={`${kpis.avgCompletenessPct}%`}
                  hint="Mean share of mapped fields filled per listing"
                />
                <Kpi label="Mean empty fields / listing" value={String(kpis.meanMissing)} hint="Across all mapped fields" />
                <Kpi
                  label="Fully populated rows"
                  value={`${kpis.complete.toLocaleString()} (${Math.round((kpis.complete / kpis.n) * 100)}%)`}
                  hint="Zero missing mapped fields"
                />
                <Kpi
                  label="Required fields OK"
                  value={`${requiredCompliance.pass.toLocaleString()} (${Math.round((requiredCompliance.pass / kpis.n) * 100)}%)`}
                  hint="Reference, title, price/POA, purpose, type"
                />
                <Kpi label="No photos" value={kpis.noPhotos.toLocaleString()} hint="Empty image list" />
                <Kpi
                  label="No price & not POA"
                  value={kpis.noPriceNoPoa.toLocaleString()}
                  hint="Numeric price absent and POA ≠ yes"
                />
                <Kpi label="Agent photo missing" value={kpis.missingAgentPhoto.toLocaleString()} hint="Name but no photo URL" />
                <Kpi
                  label="Raw XML scanned"
                  value={xmlProfile ? `${xmlProfile.sampleSize.toLocaleString()} listings` : "…"}
                  hint={xmlProfile ? `All listings in scope · ${xmlProfile.paths.length} paths found` : "Scanning every listing"}
                />
              </div>

              <div className="grid lg:grid-cols-2 gap-6 min-w-0">
                <ChartCard
                  title="Lowest field coverage"
                  description={`The ${coverageBarLimit} weakest mapped fields by % of listings with a value (${coverageFieldScope === "required" ? "required fields only" : "full schema"}). Order by only changes bar sequence—the same fields stay in the chart.`}
                  footnote="Each bar is the percentage of listings in the current analysis scope where this field is considered filled (see mapped schema rules). Compare with “Highest field coverage” to see whether gaps are concentrated in a few attributes or spread across many."
                  icon={ListChecks}
                
                  table={{ columns: ["Field", "Coverage %", "Filled", "Empty"], rows: coverageLowest.map((r) => [r.label, r.pct, r.filled, r.missing]) }}
                >
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <Label className="text-xs text-muted-foreground shrink-0">Order by</Label>
                    <Select
                      value={lowestCoverageOrderBy}
                      onValueChange={(v) => setLowestCoverageOrderBy(v as CoverageChartOrderBy)}
                    >
                      <SelectTrigger className="rounded-xl h-9 text-xs w-full min-w-0 sm:max-w-[280px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COVERAGE_ORDER_SELECT_ITEMS.map((it) => (
                          <SelectItem key={it.value} value={it.value}>
                            {it.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                                    <HBars data={coverageLowest} labelKey="label" series={COVERAGE} valueFormat={pctFmt} max={100} />
                </ChartCard>

                <ChartCard
                  title="Highest field coverage"
                  description={`The ${coverageBarLimit} strongest mapped fields by the same coverage definition as the lowest chart. Order by only reorders bars; the set of fields is still the top ${coverageBarLimit} by coverage.`}
                  footnote="High bars are expected for core identifiers (reference, title). If optional marketing fields also score high, the feed is rich; if only a handful are high, prioritize mapping the long tail in the lowest-coverage chart."
                  icon={ListChecks}
                
                  table={{ columns: ["Field", "Coverage %", "Filled", "Empty"], rows: coverageHighest.map((r) => [r.label, r.pct, r.filled, r.missing]) }}
                >
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <Label className="text-xs text-muted-foreground shrink-0">Order by</Label>
                    <Select
                      value={highestCoverageOrderBy}
                      onValueChange={(v) => setHighestCoverageOrderBy(v as CoverageChartOrderBy)}
                    >
                      <SelectTrigger className="rounded-xl h-9 text-xs w-full min-w-0 sm:max-w-[280px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COVERAGE_ORDER_SELECT_ITEMS.map((it) => (
                          <SelectItem key={it.value} value={it.value}>
                            {it.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                                    <HBars data={coverageHighest} labelKey="label" series={COVERAGE} valueFormat={pctFmt} max={100} />
                </ChartCard>
              </div>

              <div className="grid lg:grid-cols-2 gap-6 min-w-0">
                <ChartCard
                  title="Missing-field count"
                  description="Per-listing count of empty mapped fields; bucket labels match the mapped schema rules."
                  footnote="Re-ordering only changes bar sequence, not values. “Complete (0 gaps)” means every mapped field (except id/rawXml) passes fill rules. A heavy tail toward high gap counts signals systematic mapping or source issues."
                  icon={AlertTriangle}
                
                  table={{ columns: ["Empty fields", "Listings"], rows: missingDistSorted.map((r) => [r.label, r.count]) }}
                >
                  <div className="flex flex-wrap justify-end gap-2 mb-2">
                    <Select value={missingDistOrder} onValueChange={(v) => setMissingDistOrder(v as MissingDistOrder)}>
                      <SelectTrigger className="rounded-xl w-full sm:w-[220px] h-9 text-xs">
                        <SelectValue placeholder="Bucket order" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="byGaps">Order by gap count (0 → N)</SelectItem>
                        <SelectItem value="byCountDesc">Order by listings (most common first)</SelectItem>
                        <SelectItem value="byCountAsc">Order by listings (rarest first)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                                    <Columns data={missingDistSorted.map((r) => ({ label: r.label, count: r.count }))} xKey="label" series={LISTINGS} height={280} />
                </ChartCard>

                <ChartCard
                  title="Required-field compliance"
                  description="Share of listings where reference, title, price (or POA), purpose, and property type all validate."
                  footnote="This is a strict gate for “publishable minimum” data, not overall richness. A large red slice means many rows fail at least one required attribute—fix those before worrying about optional media or amenities."
                  icon={PieChartIcon}
                
                  table={{ columns: ["Status", "Listings"], rows: pieRequiredData.map((r) => [r.name, r.value]) }}
                >
                                    <div className="flex min-h-56 items-center">
                    <Donut
                      centerLabel="listings"
                      data={pieRequiredData.map((r, i) => ({ label: r.name, value: r.value, color: SERIES[i] }))}
                    />
                  </div>
                </ChartCard>
              </div>

              <div className="grid lg:grid-cols-2 gap-6 min-w-0">
                <ChartCard
                  title="Schema coverage bands"
                  description="Counts how many mapped fields fall into each population band (% of listings with that field filled)."
                  footnote="One row per schema field, grouped by its coverage percentage. Many fields in the left bands mean the feed is globally thin; a tall 80–100% bar with small counts elsewhere means only a few weak fields need attention."
                  icon={BarChart3}
                
                  table={{ columns: ["Coverage band", "Mapped fields"], rows: fieldCoverageBuckets.map((b) => [b.band, b.fieldCount]) }}
                >
                                    <Columns
                    data={fieldCoverageBuckets.map((b) => ({ label: b.band, fields: b.fieldCount }))}
                    xKey="label"
                    series={[{ key: "fields", label: "Mapped fields", color: SERIES[0] }]}
                  />
                </ChartCard>

                <ChartCard
                  title="Image URL depth"
                  description="How many listings fall into each image-count bucket (length of the images array)."
                  footnote="Granular media depth: 0 photos blocks most portals; 6+ often indicates a full marketing set. Compare before/after imports or between sale vs rent using the purpose filter in Dataset."
                  icon={ImageIconLucide}
                
                  table={{ columns: ["Photos", "Listings"], rows: imageCountBuckets.map((b) => [b.label, b.count]) }}
                >
                                    <Columns data={imageCountBuckets.map((b) => ({ label: b.label, count: b.count }))} xKey="label" series={LISTINGS} />
                </ChartCard>
              </div>

            </TabsContent>

            <TabsContent value="fields" className="space-y-4 outline-none mt-0">
              {profile ? (
                <FieldProfilesPanel key={focusField ?? "all"} profile={profile} linkable={isLiveVersion} focus={focusField} />
              ) : (
                <ProfilingNote progress={profileProgress} n={analyticsListings.length} />
              )}
            </TabsContent>

            <TabsContent value="issues" className="space-y-4 outline-none mt-0">
              {profile ? <IssuesPanel profile={profile} linkable={isLiveVersion} /> : <ProfilingNote progress={profileProgress} n={analyticsListings.length} />}
              {profile && !isLiveVersion && (
                <p className="text-xs text-muted-foreground">Listing links are available on the live version only; this is an older version.</p>
              )}
            </TabsContent>

            <TabsContent value="mapped" className="space-y-4 outline-none mt-0">
              <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                <div className="flex-1 space-y-2">
                  <Label className="text-xs text-muted-foreground">Search fields</Label>
                  <Input
                    className="rounded-xl max-w-md"
                    placeholder="Filter by label…"
                    value={mappedSearch}
                    onChange={(e) => setMappedSearch(e.target.value)}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={requiredOnly} onCheckedChange={(c) => setRequiredOnly(c === true)} />
                  Required fields only
                </label>
              </div>
              <Card className="border-primary/12 shadow-none">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-heading">Mapped fields</CardTitle>
                  <CardDescription>Click a column header to sort. Required fields are marked.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[min(32rem,60vh)] rounded-lg border border-border">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-card border-b border-border z-[1]">
                        <tr>
                          <th className="text-left px-3 py-2 font-semibold text-muted-foreground w-8">Req</th>
                          <th
                            aria-sort={sortKey === "label" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                            className="text-left px-3 py-2"
                          >
                            <button
                              type="button"
                              className="font-semibold text-muted-foreground hover:text-foreground rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/40"
                              onClick={() => toggleSort("label")}
                            >
                              Field {sortKey === "label" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                            </button>
                          </th>
                          <th
                            aria-sort={sortKey === "filled" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                            className="text-right px-3 py-2"
                          >
                            <button
                              type="button"
                              className="font-semibold text-muted-foreground hover:text-foreground rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/40"
                              onClick={() => toggleSort("filled")}
                            >
                              Filled {sortKey === "filled" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                            </button>
                          </th>
                          <th
                            aria-sort={sortKey === "missing" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                            className="text-right px-3 py-2"
                          >
                            <button
                              type="button"
                              className="font-semibold text-muted-foreground hover:text-foreground rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/40"
                              onClick={() => toggleSort("missing")}
                            >
                              Empty {sortKey === "missing" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                            </button>
                          </th>
                          <th
                            aria-sort={sortKey === "pct" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                            className="text-right px-3 py-2"
                          >
                            <button
                              type="button"
                              className="font-semibold text-muted-foreground hover:text-foreground rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/40"
                              onClick={() => toggleSort("pct")}
                            >
                              % {sortKey === "pct" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                            </button>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {sortedMappedRows.map((r) => (
                          <tr key={String(r.key)} className={r.pct < 50 ? "bg-amber-500/5" : undefined}>
                            <td className="px-3 py-2 text-center text-muted-foreground">
                              {requiredKeySet.has(r.key) ? "•" : ""}
                            </td>
                            <td className="px-3 py-2 font-medium text-foreground">{r.label}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.filled.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.missing.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold">{r.pct}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="xml" className="space-y-4 outline-none mt-0">
              {xmlProfile ? (
                <>
                  <XmlSummary xml={xmlProfile} />
                  <XmlTreePanel xml={xmlProfile} />
                </>
              ) : (
                <ProfilingNote progress={profileProgress} n={analyticsListings.length} />
              )}
              <Card className="border-primary/12 shadow-none">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-heading flex items-center gap-2">
                    <ImageOff className="w-4 h-4 text-primary-text" />
                    Raw XML path scan
                  </CardTitle>
                  <CardDescription>
                    Flattened paths from the property XML of <strong>every</strong> listing in scope (
                    {xmlEda.sampleSize.toLocaleString()} scanned), so the numbers are exact, not estimates. Up to{" "}
                    {XML_EDA_MAX_PATHS_CEILING} paths are listed in the table below.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <div className="flex flex-wrap gap-4 items-end">
                    <div className="space-y-2 min-w-[160px]">
                      <Label className="text-xs text-muted-foreground">Max paths in table</Label>
                      <Select value={String(xmlMaxPaths)} onValueChange={(v) => setXmlMaxPaths(Number(v))}>
                        <SelectTrigger className="rounded-xl w-[180px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {XML_PATH_PRESETS.map((n) => (
                            <SelectItem key={n} value={String(n)}>
                              {n}
                              {n === XML_EDA_MAX_PATHS_CEILING ? " (max)" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 min-w-[140px]">
                      <Label className="text-xs text-muted-foreground">Prefix rollup depth</Label>
                      <Select
                        value={String(prefixDepth)}
                        onValueChange={(v) => setPrefixDepth(Number(v) as 1 | 2 | 3)}
                      >
                        <SelectTrigger className="rounded-xl w-[120px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1 segment</SelectItem>
                          <SelectItem value="2">2 segments</SelectItem>
                          <SelectItem value="3">3 segments</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-1 min-w-[200px] space-y-2">
                      <Label className="text-xs text-muted-foreground">Filter paths</Label>
                      <Input
                        className="rounded-xl"
                        placeholder="Substring match…"
                        value={xmlPathSearch}
                        onChange={(e) => setXmlPathSearch(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground space-y-1">
                    <p>
                      Sample: <span className="font-medium text-foreground">{xmlEda.sampleSize}</span> listings
                      {xmlEda.truncatedListings ? ` (of ${analyticsListings.length} in analysis scope)` : ""}. Skipped no raw XML:{" "}
                      <span className="font-medium text-foreground">{xmlEda.listingsSkippedNoRawXml}</span>. Distinct paths
                      found: <span className="font-medium text-foreground">{xmlEda.totalPathsDiscovered}</span>. Table shows{" "}
                      <span className="font-medium text-foreground">{xmlEda.pathsShown}</span>
                      {xmlEda.pathsTruncated ? ` (worst-coverage paths; ${xmlEda.totalPathsDiscovered} total)` : ""}.
                    </p>
                    <p>
                      &quot;% when present&quot; is non-empty values divided by listings where that path appears in the tree.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-primary/12 shadow-none">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-heading">Path prefix groups</CardTitle>
                  <CardDescription>
                    Rollup of the paths currently shown in the table (after path limit), by dot-separated prefix. Sort is
                    reactive and does not re-run the XML scan.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2 items-center">
                    <Label className="text-xs text-muted-foreground shrink-0">Sort groups by</Label>
                    <Select
                      value={prefixSortKey}
                      onValueChange={(v) => setPrefixSortKey(v as "prefix" | "paths" | "avg" | "minmax")}
                    >
                      <SelectTrigger className="rounded-xl w-full sm:w-[260px] h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="avg">Avg % of sample (low → high)</SelectItem>
                        <SelectItem value="paths">Path count (high → low)</SelectItem>
                        <SelectItem value="prefix">Prefix A–Z</SelectItem>
                        <SelectItem value="minmax">Worst min %, then best max %</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <ScrollArea className="h-[min(14rem,35vh)] rounded-lg border border-border">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-card border-b border-border z-[1]">
                        <tr>
                          <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Prefix</th>
                          <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Paths</th>
                          <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Avg % sample</th>
                          <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Min / max</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border font-mono">
                        {sortedPrefixGroups.map((g) => (
                          <tr key={g.prefix}>
                            <td className="px-3 py-2 text-[10px] break-all text-muted-foreground">{g.prefix}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{g.distinctPaths}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{g.avgPctSampleWithValue}%</td>
                            <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                              {g.minPctSampleWithValue}% / {g.maxPctSampleWithValue}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ScrollArea>
                </CardContent>
              </Card>

              <Card className="border-primary/12 shadow-none">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-heading">Path detail</CardTitle>
                  <CardDescription>
                    Default order is worst “% of sample” first (from the server-side scan). Use column headers to re-sort the
                    visible rows; text filter still applies first.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[min(28rem,55vh)] rounded-lg border border-border">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-card border-b border-border z-[1]">
                        <tr>
                          <th
                            aria-sort={xmlPathSortKey === "path" ? (xmlPathSortDir === "asc" ? "ascending" : "descending") : "none"}
                            className="text-left px-3 py-2"
                          >
                            <button
                              type="button"
                              className="font-semibold text-muted-foreground hover:text-foreground text-left rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/40"
                              onClick={() => toggleXmlPathSort("path")}
                            >
                              Path {xmlPathSortKey === "path" ? (xmlPathSortDir === "asc" ? "↑" : "↓") : ""}
                            </button>
                          </th>
                          <th
                            aria-sort={xmlPathSortKey === "withValue" ? (xmlPathSortDir === "asc" ? "ascending" : "descending") : "none"}
                            className="text-right px-3 py-2"
                          >
                            <button
                              type="button"
                              className="font-semibold text-muted-foreground hover:text-foreground rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/40"
                              onClick={() => toggleXmlPathSort("withValue")}
                            >
                              With value {xmlPathSortKey === "withValue" ? (xmlPathSortDir === "asc" ? "↑" : "↓") : ""}
                            </button>
                          </th>
                          <th
                            aria-sort={xmlPathSortKey === "withPath" ? (xmlPathSortDir === "asc" ? "ascending" : "descending") : "none"}
                            className="text-right px-3 py-2"
                          >
                            <button
                              type="button"
                              className="font-semibold text-muted-foreground hover:text-foreground rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/40"
                              onClick={() => toggleXmlPathSort("withPath")}
                            >
                              Has path {xmlPathSortKey === "withPath" ? (xmlPathSortDir === "asc" ? "↑" : "↓") : ""}
                            </button>
                          </th>
                          <th
                            aria-sort={xmlPathSortKey === "pctSample" ? (xmlPathSortDir === "asc" ? "ascending" : "descending") : "none"}
                            className="text-right px-3 py-2"
                          >
                            <button
                              type="button"
                              className="font-semibold text-muted-foreground hover:text-foreground rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/40"
                              onClick={() => toggleXmlPathSort("pctSample")}
                            >
                              % sample {xmlPathSortKey === "pctSample" ? (xmlPathSortDir === "asc" ? "↑" : "↓") : ""}
                            </button>
                          </th>
                          <th
                            aria-sort={xmlPathSortKey === "pctWhenPresent" ? (xmlPathSortDir === "asc" ? "ascending" : "descending") : "none"}
                            className="text-right px-3 py-2"
                          >
                            <button
                              type="button"
                              className="font-semibold text-muted-foreground hover:text-foreground rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/40"
                              onClick={() => toggleXmlPathSort("pctWhenPresent")}
                            >
                              % when present {xmlPathSortKey === "pctWhenPresent" ? (xmlPathSortDir === "asc" ? "↑" : "↓") : ""}
                            </button>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border font-mono">
                        {sortedXmlDetailRows.map((r) => (
                          <tr key={r.path} className={r.pctOfAppearancesFilled < 40 ? "bg-amber-500/5" : undefined}>
                            <td className="px-3 py-2 text-[10px] break-all text-muted-foreground align-top">{r.path}</td>
                            <td className="px-3 py-2 text-right tabular-nums align-top">{r.listingsWithValue.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right tabular-nums align-top">{r.listingsWithPath.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right tabular-nums align-top">{r.pctOfSampleWithValue}%</td>
                            <td className="px-3 py-2 text-right tabular-nums align-top">{r.pctOfAppearancesFilled}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ScrollArea>
                  {sortedXmlDetailRows.length === 0 && (
                    <p className="text-sm text-muted-foreground py-4 text-center">No paths match the filter.</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="segments" className="space-y-4 outline-none mt-0">
              <div className="flex flex-wrap gap-4 items-end">
                <div className="space-y-2 min-w-[200px]">
                  <Label className="text-xs text-muted-foreground">Segment by</Label>
                  <Select value={segmentKey} onValueChange={(v) => setSegmentKey(v as SegmentQualityKey)}>
                    <SelectTrigger className="rounded-xl w-[220px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="propertyType">Property type</SelectItem>
                      <SelectItem value="purpose">Purpose (sale/rent)</SelectItem>
                      <SelectItem value="community">Community</SelectItem>
                      <SelectItem value="city">City</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 min-w-[200px]">
                  <Label className="text-xs text-muted-foreground">Top segments (by volume)</Label>
                  <Select
                    value={String(segmentTopK)}
                    onValueChange={(v) => setSegmentTopK(Number(v) as 8 | 14 | 20 | 30)}
                  >
                    <SelectTrigger className="rounded-xl w-[160px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="8">8 segments</SelectItem>
                      <SelectItem value="14">14 segments</SelectItem>
                      <SelectItem value="20">20 segments</SelectItem>
                      <SelectItem value="30">30 segments</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid xl:grid-cols-3 gap-6 min-w-0">
                <ChartCard
                  title="Mean empty fields by segment"
                  description={`Top ${segmentTopK} segments by listing count in the current analysis scope. Bar length = average missing mapped fields per listing in that segment.`}
                  footnote="Compare segments with similar volume (see listing-count chart). A high mean-missing bar on a large segment is more urgent than the same bar on a tiny niche segment."
                  icon={BarChart3}
                
                  table={{ columns: ["Segment", "Mean empty fields", "Listings"], rows: segmentRows.map((r) => [r.segment, r.meanMissing, r.count]) }}
                >
                                    <HBars
                    data={segmentBars}
                    labelKey="label"
                    series={[{ key: "meanMissing", label: "Mean empty fields", color: SERIES[0] }]}
                  />
                </ChartCard>

                <ChartCard
                  title="Avg coverage % by segment"
                  description="Same segments as the previous chart: mean percentage of mapped fields filled per listing within each segment."
                  footnote="100% would mean every listing in that segment fills every mapped field. Rent vs sale (purpose filter + segment) often diverges here if feeds treat tenancies differently."
                  icon={ListChecks}
                
                  table={{ columns: ["Segment", "Avg coverage %", "Listings"], rows: segmentRows.map((r) => [r.segment, r.avgCoveragePct, r.count]) }}
                >
                                    <HBars
                    data={segmentBars}
                    labelKey="label"
                    series={[{ key: "avgCoveragePct", label: "Avg coverage %", color: SERIES[0] }]}
                    valueFormat={pctFmt}
                    max={100}
                  />
                </ChartCard>

                <ChartCard
                  title="Listing volume by segment"
                  description="How many listings fall into each displayed segment (same ordering as the other two charts)."
                  footnote="Use this as a weighting key: sparse segments can look noisy in mean-missing charts. “—” and long-tail cities/communities often appear when data is messy."
                  icon={BarChart3}
                
                  table={{ columns: ["Segment", "Listings"], rows: segmentRows.map((r) => [r.segment, r.count]) }}
                >
                                    <HBars data={segmentBars} labelKey="label" series={LISTINGS} />
                </ChartCard>
              </div>

              <Card className="border-primary/12 shadow-none">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-heading">Segment table</CardTitle>
                  <CardDescription>
                    Sortable source numbers behind the charts. Segment labels match the dimension you selected (property type,
                    purpose, community, or city).
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[min(16rem,40vh)] rounded-lg border border-border">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-card border-b border-border">
                        <tr>
                          <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Segment</th>
                          <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Listings</th>
                          <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Mean empty</th>
                          <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Avg coverage</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {segmentRows.map((r) => (
                          <tr key={r.segment}>
                            <td className="px-3 py-2 font-medium">{r.segment}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{r.count.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{r.meanMissing}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{r.avgCoveragePct}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="patterns" className="space-y-6 outline-none mt-0">
              {profile && <ValueFormatsCard profile={profile} />}
              <Card className="border-primary/12 shadow-none">
                <CardHeader>
                  <CardTitle className="text-base font-heading">Co-missing fields</CardTitle>
                  <CardDescription>
                    Diagonal: % of listings where that field is missing. Off-diagonal: % of listings where{" "}
                    <em>both</em> fields are missing. Darker cells mean more shared absence—useful to spot systematic gaps (e.g.
                    geo and floor plan missing together). Fields are always all required keys first, then the lowest-coverage
                    optionals, up to the matrix size you choose.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <Label className="text-xs text-muted-foreground shrink-0">Matrix size (fields)</Label>
                    <Select
                      value={String(heatmapKeyLimit)}
                      onValueChange={(v) => setHeatmapKeyLimit(Number(v) as 12 | 18 | 24)}
                    >
                      <SelectTrigger className="rounded-xl w-[140px] h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="12">12 fields</SelectItem>
                        <SelectItem value="18">18 fields</SelectItem>
                        <SelectItem value="24">24 fields</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <CoabsenceHeatmap matrix={coabsence} />
                </CardContent>
              </Card>

              <Card className="border-primary/12 shadow-none">
                <CardHeader>
                  <CardTitle className="text-base font-heading">Listings with the most empty fields</CardTitle>
                  <CardDescription>Open a listing to inspect raw XML and mapped values.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    {worstListingsByGaps.map(({ l, gaps }) => (
                      <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 border border-border rounded-lg px-3 py-2">
                        <div className="min-w-0">
                          <Link
                            to={`/listing/${encodeURIComponent(l.id)}`}
                            className="font-medium text-primary-text hover:underline truncate block"
                          >
                            {l.reference || l.title || l.id.slice(0, 12)}
                          </Link>
                          <span className="text-xs text-muted-foreground tabular-nums">{gaps} empty mapped fields</span>
                        </div>
                        <Button variant="outline" size="sm" className="rounded-lg shrink-0" asChild>
                          <Link to={`/listing/${encodeURIComponent(l.id)}`}>View</Link>
                        </Button>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="report" className="space-y-6 outline-none mt-0">
              {profile && (
                <div className="grid gap-6 xl:grid-cols-[1.15fr_1fr]">
                  <QualityScorecard profile={profile} xml={xmlProfile} />
                  <KeyInsights insights={insights} onGo={goTo} />
                </div>
              )}
              <Card className="border-primary/12 shadow-none">
                <CardHeader>
                  <CardTitle className="text-base font-heading">Narrative summary</CardTitle>
                  <CardDescription>Auto-generated from the current scope and settings.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground leading-relaxed">
                    {reportBullets.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
              <Card className="border-primary/12 shadow-none">
                <CardHeader>
                  <CardTitle className="text-base font-heading">Export</CardTitle>
                  <CardDescription>Download CSV for spreadsheets or archival. Combined export triggers two files.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-3">
                  <Button variant="outline" className="rounded-xl gap-2" onClick={exportPresenceCsv}>
                    <FileDown className="w-4 h-4" />
                    Mapped fields CSV
                  </Button>
                  <Button variant="outline" className="rounded-xl gap-2" onClick={exportXmlPathsCsv}>
                    <FileDown className="w-4 h-4" />
                    XML paths CSV
                  </Button>
                  <Button className="rounded-xl gap-2" onClick={exportCombinedCsv}>
                    <FileDown className="w-4 h-4" />
                    Download both
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div className="text-lg font-bold tabular-nums text-foreground mt-1">{value}</div>
      {hint ? <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug">{hint}</p> : null}
    </div>
  );
}

function ChartCard({
  title,
  description,
  footnote,
  icon: Icon,
  table,
  children,
}: {
  title: string;
  description: string;
  /** How to read the chart and what actions to take — shown under the plot. */
  footnote?: string;
  icon: ComponentType<{ className?: string }>;
  /** Table view + CSV of the plotted numbers. */
  table?: TableData;
  children: ReactNode;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <Card className="border-primary/12 shadow-none overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
        <div className="min-w-0 space-y-1.5">
          <CardTitle className="text-base font-heading flex items-center gap-2">
            <Icon className="w-4 h-4 text-primary-text" />
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {table ? (
          <div className="flex shrink-0 items-center gap-1">
            <ChartTableActions title={title} table={table} asTable={asTable} onToggle={() => setAsTable((v) => !v)} />
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="pb-4">
        {asTable && table ? <DataTable table={table} /> : children}
        {footnote ? (
          <p className="text-[11px] text-muted-foreground leading-relaxed border-t border-border/60 mt-3 pt-3">{footnote}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function CoabsenceHeatmap({ matrix }: { matrix: CoabsenceMatrix }) {
  const { labels, matrix: m, n } = matrix;
  if (n === 0 || labels.length === 0) {
    return <p className="text-sm text-muted-foreground">Not enough data.</p>;
  }

  const flat = m.flat();
  const maxV = Math.max(1, ...flat);

  return (
    <div className="overflow-x-auto pb-2">
      <div
        className="inline-grid gap-px bg-border rounded-lg border border-border p-px min-w-0"
        style={{
          gridTemplateColumns: `minmax(120px,1.2fr) repeat(${labels.length}, minmax(28px, 36px))`,
        }}
      >
        <div className="bg-muted/50 rounded-tl-md" />
        {labels.map((lab, j) => (
          <div
            key={j}
            className="bg-muted/50 text-[9px] leading-tight font-medium text-muted-foreground p-1 text-center flex items-end justify-center [writing-mode:vertical-rl] rotate-180 max-h-[120px]"
            title={lab}
          >
            <span className="truncate max-h-[100px]">{lab}</span>
          </div>
        ))}
        {labels.map((lab, i) => (
          <Fragment key={`heatmap-row-${i}`}>
            <div
              className="bg-muted/30 text-[10px] font-medium text-muted-foreground px-2 py-1 flex items-center truncate"
              title={lab}
            >
              {lab}
            </div>
            {labels.map((_, j) => {
              const v = m[i]![j] ?? 0;
              const intensity = v / maxV;
              const alpha = 0.08 + intensity * 0.72;
              const isDiag = i === j;
              return (
                <div
                  key={`c-${i}-${j}`}
                  className="aspect-square min-h-[28px] min-w-[28px] flex items-center justify-center text-[9px] tabular-nums font-medium text-foreground/90"
                  style={{
                    backgroundColor: isDiag
                      ? `hsl(var(--sb-rose) / ${alpha})`
                      : `hsl(var(--primary) / ${alpha})`,
                  }}
                  title={
                    isDiag
                      ? `${lab}: ${v}% listings missing this field`
                      : `${labels[i]} & ${labels[j]}: ${v}% listings missing both`
                  }
                >
                  {v >= 20 ? Math.round(v) : v >= 5 ? v.toFixed(0) : ""}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground mt-3">
        {labels.length} fields × {labels.length} fields · based on {n.toLocaleString()} listings. Rose diagonal = single-field
        missing rate; primary off-diagonal = joint missing rate. Resize the matrix above to balance detail vs readability.
      </p>
    </div>
  );
}
