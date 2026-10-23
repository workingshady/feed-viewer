import { FeedChecksCard } from "@/components/sources/FeedChecks";
import { checkFeed } from "@/lib/feedValidation";
import { timeAgo } from "@/components/sources/format";
import AppHeader from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { NoSourceState, SourcePicker, VersionPicker, olderVersion } from "@/components/SourcePicker";
import { useVersionListings } from "@/hooks/useSources";
import { computeMappingConflicts, computeMissingRequiredFields, importListingDiffKey } from "@/lib/importAnalysis";
import { liveVersionOf } from "@/lib/sourcesApi";
import { diffListings } from "@/lib/versionDiff";
import { UI_FIELDS, type ImportListingDiff, type ImportListingStatus, type ImportSession } from "@/lib/types";
import { useAppData } from "@/providers/DataProvider";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Copy,
  FileWarning,
  HelpCircle,
  LayoutDashboard,
  Link2,
  ListTree,
  Search,
  ShieldAlert,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { markHomeWorkflowValidationVisited } from "@/lib/homeWorkflowProgress";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "@/components/ui/sonner";
import {
  RECHARTS_BAR_CURSOR,
  RECHARTS_TOOLTIP_CONTENT,
  RECHARTS_TOOLTIP_PROPS,
} from "@/lib/chartTheme";
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

/** Values that occur more than once, in first-seen order. */
function duplicatesBy<T>(rows: T[], key: (row: T) => string): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const r of rows) {
    const k = key(r)?.trim();
    if (!k) continue;
    if (seen.has(k)) dupes.add(k);
    seen.add(k);
  }
  return [...dupes];
}

const DIFF_PAGE_SIZE = 50;

const STATUS_OPTIONS: ImportListingStatus[] = [
  "new",
  "updated",
  "unchanged",
  "removed",
  "duplicate",
];

type OverviewStatId = ImportListingStatus | "issues";

const PIE_COLORS: Record<string, string> = {
  New: "hsl(var(--primary))",
  Updated: "hsl(var(--sb-slate))",
  Unchanged: "hsl(var(--muted-foreground) / 0.65)",
  Removed: "hsl(var(--destructive))",
  Duplicate: "hsl(var(--warning))",
};

function StatHint({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* Not a button: these hints sit inside clickable stat cards, and buttons can't nest. */}
        <span
          className="inline-flex rounded-full p-1 text-muted-foreground hover:text-primary-text hover:bg-primary/10 transition-colors"
          aria-hidden
        >
          <HelpCircle className="w-4 h-4 shrink-0" strokeWidth={2} />
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        align="center"
        sideOffset={10}
        className={cn(
          "z-[100] w-max min-w-[12rem] max-w-[min(calc(100vw-1.5rem),22rem)]",
          "border border-border bg-card text-card-foreground shadow-xl",
          "px-3.5 py-2.5 text-[13px] leading-relaxed antialiased",
        )}
      >
        {children}
      </TooltipContent>
    </Tooltip>
  );
}

const ValidationPage = () => {
  const { selectedSource: source } = useAppData();
  const navigate = useNavigate();
  const mappingConfig = source?.mapping ?? null;

  useEffect(() => {
    markHomeWorkflowValidationVisited();
  }, []);

  const live = source ? liveVersionOf(source) : null;
  const [pickedVersionId, setPickedVersionId] = useState<string>("live");
  useEffect(() => {
    setPickedVersionId("live");
  }, [source?.id]);
  const version = source
    ? (pickedVersionId === "live" ? live : source.versions.find((v) => v.id === pickedVersionId)) ?? live
    : null;
  const prevVersion = source ? olderVersion(source, version) : null;
  const listingsQ = useVersionListings(version);
  const prevQ = useVersionListings(prevVersion);
  const versionListings = listingsQ.data;
  const feedChecks = useMemo(() => (versionListings ? checkFeed(versionListings) : null), [versionListings]);
  const dataReady = !!versionListings && (!prevVersion || !!prevQ.data);

  const diff = useMemo(
    () => (versionListings ? diffListings(prevQ.data ?? [], versionListings) : null),
    [versionListings, prevQ.data],
  );

  const missingRequiredEffective = useMemo(() => {
    if (!versionListings) return [];
    return computeMissingRequiredFields(mappingConfig?.mappings, { listings: versionListings });
  }, [mappingConfig?.mappings, versionListings]);

  /** Validation report for the picked version, shaped like the old import-session summary. */
  const importSession = useMemo<ImportSession | null>(() => {
    if (!source || !version || !versionListings || !diff) return null;
    const changedByKey = new Map(diff.changed.map((c) => [importListingDiffKey(c.after), c.keys]));
    const addedKeys = new Set(diff.added.map((l) => importListingDiffKey(l)));
    const dupKeys = new Set(diff.duplicates);
    const byId: Record<string, ImportListingDiff> = {};
    for (const l of versionListings) {
      const k = importListingDiffKey(l);
      const status: ImportListingStatus = dupKeys.has(k)
        ? "duplicate"
        : addedKeys.has(k)
          ? "new"
          : changedByKey.has(k)
            ? "updated"
            : "unchanged";
      byId[l.id] = { id: l.id, reference: l.reference, status, changedKeys: changedByKey.get(k) ?? [] };
    }
    for (const l of diff.removed) {
      byId[`removed:${l.id}`] = { id: l.id, reference: l.reference, status: "removed", changedKeys: [] };
    }
    const count = (st: ImportListingStatus) => Object.values(byId).filter((d) => d.status === st).length;
    return {
      id: version.id,
      createdAt: version.createdAt,
      fileName: version.fileName,
      strictMode: false,
      agencyInfo: source.agencyInfo ?? undefined,
      listingCount: version.listingCount,
      warnings: version.warnings?.warnings ?? [],
      errors: version.warnings?.errors ?? [],
      conflicts: {
        duplicateIds: diff.duplicates,
        duplicateReferences: duplicatesBy(versionListings ?? [], (l) => l.reference),
        mappingConflicts: computeMappingConflicts(mappingConfig?.mappings),
        missingRequiredFields: [],
      },
      diffSummary: {
        newCount: count("new"),
        updatedCount: count("updated"),
        unchangedCount: count("unchanged"),
        removedCount: count("removed"),
        duplicateCount: count("duplicate"),
      },
      listingDiffById: byId,
    };
  }, [source, version, versionListings, diff, mappingConfig?.mappings]);

  const [mainTab, setMainTab] = useState<"overview" | "issues" | "conflicts" | "listings">("overview");
  const [statusQ, setStatusQ] = useState<ImportListingStatus | "all">("all");
  const [diffPage, setDiffPage] = useState(1);
  const [refSearch, setRefSearch] = useState("");

  const healthChartData = useMemo(
    () =>
      [...(source?.versions ?? [])].slice(0, 15).reverse().map((s) => ({
        label: new Date(s.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        fullDate: new Date(s.createdAt).toLocaleString(),
        fileName: s.fileName,
        listings: s.listingCount,
        errs: s.warnings?.errors.length ?? 0,
        warns: s.warnings?.warnings.length ?? 0,
        issues: (s.warnings?.errors.length ?? 0) + (s.warnings?.warnings.length ?? 0),
      })),
    [source],
  );

  const diffs = useMemo(() => {
    const raw = importSession?.listingDiffById ?? {};
    return Object.values(raw);
  }, [importSession]);

  const filteredDiffs = useMemo(() => {
    if (statusQ === "all") return diffs;
    return diffs.filter((d) => d.status === statusQ);
  }, [diffs, statusQ]);

  const searchedDiffs = useMemo(() => {
    const q = refSearch.trim().toLowerCase();
    if (!q) return filteredDiffs;
    return filteredDiffs.filter(
      (d) => d.reference.toLowerCase().includes(q) || d.id.toLowerCase().includes(q),
    );
  }, [filteredDiffs, refSearch]);

  useEffect(() => {
    setDiffPage(1);
  }, [statusQ, refSearch, importSession?.id]);

  const diffTotalPagesForClamp = Math.max(1, Math.ceil(searchedDiffs.length / DIFF_PAGE_SIZE));
  useEffect(() => {
    setDiffPage((p) => Math.min(p, diffTotalPagesForClamp));
  }, [diffTotalPagesForClamp]);

  const diffTotalPages = diffTotalPagesForClamp;
  const effectiveDiffPage = Math.min(Math.max(1, diffPage), diffTotalPages);
  const pagedDiffs = searchedDiffs.slice(
    (effectiveDiffPage - 1) * DIFF_PAGE_SIZE,
    effectiveDiffPage * DIFF_PAGE_SIZE,
  );

  const allNewFirstImport = useMemo(() => {
    if (!importSession) return false;
    const ds = importSession.diffSummary;
    return (
      diffs.length > 0 &&
      diffs.every((d) => d.status === "new") &&
      ds.updatedCount === 0 &&
      ds.unchangedCount === 0
    );
  }, [importSession, diffs]);

  const pieData = useMemo(() => {
    if (!importSession) return [] as { name: string; value: number; status: ImportListingStatus }[];
    const ds = importSession.diffSummary;
    const rows = [
      { name: "New" as const, value: ds.newCount, status: "new" as const },
      { name: "Updated" as const, value: ds.updatedCount, status: "updated" as const },
      { name: "Unchanged" as const, value: ds.unchangedCount, status: "unchanged" as const },
      { name: "Removed" as const, value: ds.removedCount, status: "removed" as const },
      { name: "Duplicate" as const, value: ds.duplicateCount, status: "duplicate" as const },
    ];
    return rows.filter((r) => r.value > 0);
  }, [importSession]);

  const issueBreakdownData = useMemo(() => {
    if (!importSession) return [] as { name: string; count: number; hint: string }[];
    const { errors, warnings, conflicts } = importSession;
    return [
      { name: "Parser errors", count: errors.length, hint: "Hard problems during parse or mapping that may drop data." },
      { name: "Parser warnings", count: warnings.length, hint: "Soft issues: missing optional fields, sanitization, etc." },
      { name: "Duplicate IDs", count: conflicts.duplicateIds.length, hint: "Same listing id appears more than once in the feed." },
      { name: "Duplicate refs", count: conflicts.duplicateReferences.length, hint: "Same reference string used for multiple rows." },
      { name: "Field mapping conflicts", count: conflicts.mappingConflicts.length, hint: "Two XML paths target the same UI field." },
      {
        name: "Missing required map",
        count: missingRequiredEffective.length,
        hint: "Required fields with no explicit mapping and no usable values in parsed listings (see Conflicts tab).",
      },
    ];
  }, [importSession, missingRequiredEffective.length]);

  const onStatActivate = useCallback(
    (id: OverviewStatId) => {
      if (id === "issues") {
        setMainTab("issues");
        return;
      }
      setStatusQ(id);
      setMainTab("listings");
    },
    [],
  );

  const copyText = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Could not copy");
    }
  };

  if (!source) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="container py-8 max-w-lg mx-auto px-4">
          <SourcePicker className="mb-4" />
          <NoSourceState what="validation" />
        </div>
      </div>
    );
  }

  if (!version) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="container py-20 text-center max-w-lg mx-auto px-4">
          <ClipboardList className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h1 className="text-2xl font-bold font-heading text-foreground mb-2">No versions yet</h1>
          <p className="text-muted-foreground mb-4">Upload a feed for {source.name} to see its validation report.</p>
          <Button asChild>
            <Link to={`/sources?source=${source.id}`}>Go to Sources</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!importSession || !dataReady) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="container py-20 text-center text-sm text-muted-foreground">
          {listingsQ.error || prevQ.error ? "Could not load this version's listings." : "Loading validation data…"}
        </div>
      </div>
    );
  }

  const { conflicts, diffSummary, errors, warnings, fileName, createdAt, listingCount } = importSession;
  const issueCount =
    (errors?.length ?? 0) +
    (warnings?.length ?? 0) +
    (conflicts.duplicateIds?.length ?? 0) +
    (conflicts.duplicateReferences?.length ?? 0) +
    (conflicts.mappingConflicts?.length ?? 0) +
    missingRequiredEffective.length;

  const conflictStructuralCount =
    conflicts.duplicateIds.length +
    conflicts.duplicateReferences.length +
    conflicts.mappingConflicts.length +
    missingRequiredEffective.length;

  const hasBlockingErrors = errors.length > 0;
  const hasOnlyWarnings = !hasBlockingErrors && (warnings.length > 0 || conflictStructuralCount > 0);

  const statCards: {
    id: OverviewStatId;
    label: string;
    value: number;
    hint: ReactNode;
    accent?: string;
  }[] = [
    {
      id: "new",
      label: "New",
      value: diffSummary.newCount,
      hint: "Listings not present in the previous version of this source. The first version marks everything as new.",
    },
    {
      id: "updated",
      label: "Updated",
      value: diffSummary.updatedCount,
      hint: "Same listing id as before, but at least one compared field changed (price, title, images, etc.).",
    },
    {
      id: "unchanged",
      label: "Unchanged",
      value: diffSummary.unchangedCount,
      hint: "Listing id existed before and all tracked fields match the previous snapshot.",
    },
    {
      id: "removed",
      label: "Removed",
      value: diffSummary.removedCount,
      hint: "Was in the previous snapshot but missing from this file—often delistings or trimmed feed.",
    },
    {
      id: "duplicate",
      label: "Duplicate",
      value: diffSummary.duplicateCount,
      hint: "Rows that share an id with another row in the same import; later rows can overwrite earlier ones.",
    },
    {
      id: "issues",
      label: "All issues",
      value: issueCount,
      hint: "Sum of parser errors & warnings plus structural conflicts (duplicates, mapping clashes, missing required mappings).",
      accent: issueCount > 0 ? "border-warning/40 bg-warning/5" : "border-primary/25 bg-primary/5",
    },
  ];

  return (
    <TooltipProvider delayDuration={200}>
      <div className="dashboard-page">
        <AppHeader />
        <div className="container py-6 sm:py-8 max-w-6xl px-4 sm:px-6">
          <div className="flex flex-col gap-6 mb-8">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="dashboard-eyebrow mb-2">Quality</p>
                <h1 className="text-2xl sm:text-3xl font-extrabold font-heading text-foreground tracking-tight [text-shadow:0_1px_28px_hsl(var(--primary)/0.14)]">
                  Validation
                </h1>
                <p className="text-sm text-muted-foreground mt-2 max-w-2xl leading-relaxed">
                  Quality report for one version of a source: feed checks, parser messages, structural conflicts and the
                  listing-by-listing diff against the previous version.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <Button asChild variant="outline" size="sm" className="border-primary/20 hover:bg-primary/10">
                  <Link to={`/sources?source=${source.id}`}>Manage source</Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="border-primary/20 hover:bg-primary/10">
                  <Link to="/field-mapping">XML field mapping</Link>
                </Button>
                <Button asChild variant="default" size="sm" className="shadow-[0_8px_28px_-10px_hsl(var(--primary)/0.45)]">
                  <Link to="/listings">Listings</Link>
                </Button>
              </div>
            </div>

            <Card className="dashboard-card shadow-none border-primary/12">
              <CardHeader className="pb-3 space-y-1">
                <CardTitle className="text-base font-semibold">Version</CardTitle>
                <CardDescription>
                  Validation is computed for one version of {source.name}, compared with the next-older version.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-end gap-3">
                  <VersionPicker
                    source={source}
                    label="Version"
                    value={version.id}
                    onChange={setPickedVersionId}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{fileName}</span>
                  <span aria-hidden>·</span>
                  <time dateTime={createdAt} title={new Date(createdAt).toLocaleString()}>
                    {timeAgo(createdAt)}
                  </time>
                  <span aria-hidden>·</span>
                  <span>{listingCount} listings in file</span>
                  {importSession.agencyInfo?.name && (
                    <>
                      <span aria-hidden>·</span>
                      <span>Agency: {importSession.agencyInfo.name}</span>
                    </>
                  )}
                  <span aria-hidden>·</span>
                  <span>{prevVersion ? `Compared with v${prevVersion.number}` : "No older version: all listings count as new"}</span>
                </div>
              </CardContent>
            </Card>

            <div
              className={`rounded-xl border px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 text-sm ${
                hasBlockingErrors
                  ? "border-destructive/40 bg-destructive/10 text-destructive-text"
                  : hasOnlyWarnings
                    ? "border-warning/35 bg-warning/10 text-foreground"
                    : "border-primary/30 bg-primary/5 text-foreground"
              }`}
              role="status"
            >
              {hasBlockingErrors ? (
                <>
                  <ShieldAlert className="w-5 h-5 shrink-0" />
                  <span>
                    <strong>Parser errors present.</strong> Fix XML or mapping and re-import; some listings may be
                    incomplete or skipped.
                  </span>
                </>
              ) : hasOnlyWarnings ? (
                <>
                  <FileWarning className="w-5 h-5 shrink-0 text-warning" />
                  <span>
                    <strong>No blocking errors,</strong> but warnings or structural issues remain—review the Issues and
                    Conflicts tabs.
                  </span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-success" />
                  <span>
                    <strong>Parsed cleanly:</strong> no parser errors or structural conflicts. Content problems, if any, are in
                    the feed checks below.
                  </span>
                </>
              )}
            </div>
          </div>

          {feedChecks && (
            <FeedChecksCard
              result={feedChecks}
              title={`Feed checks · v${version.number}`}
              fileName={`${source.name}-v${version.number}-feed-checks.csv`}
              exampleHref={(ref) => `/listing/${encodeURIComponent(`${source.id}:${ref}`)}`}
            />
          )}

          <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as typeof mainTab)} className="space-y-6">
            <TabsList className="dashboard-tabs-list flex h-auto min-h-10 w-full flex-wrap justify-start gap-1 sm:inline-flex sm:w-auto">
              <TabsTrigger value="overview" className="gap-1.5 rounded-lg data-[state=inactive]:border-transparent">
                <LayoutDashboard className="w-3.5 h-3.5" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="issues" className="gap-1.5 rounded-lg data-[state=inactive]:border-transparent">
                <AlertTriangle className="w-3.5 h-3.5" />
                Issues
                {(errors.length > 0 || warnings.length > 0) && (
                  <Badge variant="secondary" className="ml-1 tabular-nums px-1.5 py-0 text-[10px]">
                    {errors.length + warnings.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="conflicts" className="gap-1.5 rounded-lg data-[state=inactive]:border-transparent">
                <Link2 className="w-3.5 h-3.5" />
                Conflicts
                {conflictStructuralCount > 0 && (
                  <Badge variant="destructive" className="ml-1 tabular-nums px-1.5 py-0 text-[10px]">
                    {conflictStructuralCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="listings" className="gap-1.5 rounded-lg data-[state=inactive]:border-transparent">
                <ListTree className="w-3.5 h-3.5" />
                Listing diffs
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-8 mt-6 outline-none">
              <section aria-labelledby="metrics-heading">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <h2 id="metrics-heading" className="text-lg font-bold font-heading text-foreground">
                    Snapshot metrics
                  </h2>
                  <Collapsible>
                    <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground rounded-md px-2 py-1 -mr-2 data-[state=open]:[&_svg]:rotate-180">
                      How to read these
                      <ChevronDown className="w-3.5 h-3.5 transition-transform" />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="text-xs text-muted-foreground border border-border rounded-lg p-3 mt-2 bg-muted/20 leading-relaxed">
                      Numbers come from comparing this version to the <strong className="text-foreground">previous version</strong>{" "}
                      of the <strong className="text-foreground">same source</strong>. Click a card to jump to the
                      listing diff table filtered by that status, or open all parser/structural issues.
                    </CollapsibleContent>
                  </Collapsible>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
                  {statCards.map(({ id, label, value, hint, accent }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onStatActivate(id)}
                      className={`text-left rounded-xl border p-3 sm:p-4 transition-all hover:bg-accent/50 hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99] ${
                        accent ?? "border-border bg-card"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="text-[11px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          {label}
                        </span>
                        <StatHint>{hint}</StatHint>
                      </div>
                      <div className="text-xl sm:text-2xl font-bold text-foreground tabular-nums">{value}</div>
                      <p className="text-[10px] text-muted-foreground mt-1.5 hidden sm:block">
                        {id === "issues" ? "Open issues tab" : "Filter listing table"}
                      </p>
                    </button>
                  ))}
                </div>
              </section>


              <div className="grid lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <BarChart3 className="w-4 h-4" />
                      Change mix (this import)
                    </CardTitle>
                    <CardDescription>
                      Share of listings by diff outcome. Click a slice or a legend row to filter the listing table.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {pieData.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-8 text-center">No listing diff data.</p>
                    ) : (
                      <div className="h-64 w-full min-w-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={pieData as { name: string; value: number; status: ImportListingStatus }[]}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              innerRadius={52}
                              outerRadius={80}
                              paddingAngle={2}
                              onClick={(_, index) => {
                                const row = typeof index === "number" ? pieData[index] : undefined;
                                if (row) {
                                  setStatusQ(row.status);
                                  setMainTab("listings");
                                }
                              }}
                              className="cursor-pointer outline-none"
                            >
                              {pieData.map((entry) => (
                                <Cell key={entry.name} fill={PIE_COLORS[entry.name] ?? "hsl(var(--primary))"} strokeWidth={0} />
                              ))}
                            </Pie>
                            <RechartsTooltip
                              {...RECHARTS_TOOLTIP_PROPS}
                              cursor={false}
                              contentStyle={{
                                ...RECHARTS_TOOLTIP_CONTENT,
                                maxWidth: "min(100vw - 1.5rem, 20rem)",
                                whiteSpace: "normal",
                                wordBreak: "break-word",
                              }}
                              formatter={(v: number) => [v, "Listings"]}
                            />
                            <Legend verticalAlign="bottom" formatter={(value) => <span className="text-xs text-foreground">{value}</span>} wrapperStyle={{ paddingTop: 12 }} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="flex flex-wrap justify-center gap-2 mt-3" role="group" aria-label="Filter listing table by diff status">
                          {pieData.map((row) => (
                            <Button
                              key={row.name}
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs gap-2"
                              onClick={() => {
                                setStatusQ(row.status);
                                setMainTab("listings");
                              }}
                            >
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ background: PIE_COLORS[row.name] ?? "hsl(var(--primary))" }}
                                aria-hidden
                              />
                              {row.name} ({row.value})
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                  <CardFooter className="border-t border-border/50 pt-3">
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      Compares this import to the previous snapshot: new, updated, unchanged, removed, or duplicate rows.
                      Slices are counts of listings, not XML nodes — use the buttons to filter the table below.
                    </p>
                  </CardFooter>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Issue breakdown</CardTitle>
                    <CardDescription>
                      Counts each <strong className="text-foreground">category</strong> separately so you can see whether
                      problems are parser-level or mapping/structure.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64 w-full min-w-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={issueBreakdownData}
                          layout="vertical"
                          margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
                        >
                          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                          <YAxis
                            type="category"
                            dataKey="name"
                            width={118}
                            tick={{ fontSize: 10 }}
                            interval={0}
                          />
                          <RechartsTooltip
                            {...RECHARTS_TOOLTIP_PROPS}
                            cursor={RECHARTS_BAR_CURSOR as any}
                            formatter={(v: number) => [v, "Count"]}
                            labelFormatter={(_, payload) => {
                              const p = payload?.[0]?.payload as { hint?: string; name?: string } | undefined;
                              return p?.hint ? `${p.name}: ${p.hint}` : (p?.name ?? "");
                            }}
                          />
                          <Bar
                            dataKey="count"
                            name="Issues"
                            radius={[0, 4, 4, 0]}
                            className="cursor-pointer outline-none"
                            fill="hsl(var(--primary))"
                            onClick={(data: { name?: string } | undefined) => {
                              const name = data?.name;
                              if (!name) return;
                              if (name === "Parser errors" || name === "Parser warnings") setMainTab("issues");
                              else setMainTab("conflicts");
                            }}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-2">Click a bar to open Issues or Conflicts.</p>
                  </CardContent>
                  <CardFooter className="border-t border-border/50 pt-3">
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      Each category is counted independently — one listing can contribute to parser errors and mapping
                      conflicts. Long labels in the tooltip explain what we grouped together.
                    </p>
                  </CardFooter>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Feed health trend</CardTitle>
                  <CardDescription>
                    Recent imports: <strong className="text-foreground">listing volume</strong> vs{" "}
                    <strong className="text-foreground">parser errors</strong>. Use it to spot sudden drops or rising
                    failures.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {source.versions.length < 2 ? (
                    <p className="text-sm text-muted-foreground py-6 border border-dashed border-border rounded-lg px-4 text-center">
                      Upload at least two versions to compare runs. The selected version still appears in the issue charts
                      above.
                    </p>
                  ) : (
                    <div className="h-56 w-full min-w-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={healthChartData} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                          <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={50} />
                          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={36} />
                          <RechartsTooltip
                            cursor={RECHARTS_BAR_CURSOR as any}
                            content={({ active, payload }) => {
                              if (!active || !payload?.length) return null;
                              const row = payload[0].payload as (typeof healthChartData)[0];
                              return (
                                <div
                                  className={cn(
                                    "rounded-[0.625rem] border px-3.5 py-2.5 text-[12px] leading-snug antialiased",
                                    "border-[hsl(var(--chart-tooltip-border))] bg-[hsl(var(--chart-tooltip-surface))]",
                                    "text-[hsl(var(--popover-foreground))] shadow-[var(--chart-tooltip-shadow)]",
                                    "max-w-[min(calc(100vw-1.5rem),18rem)]",
                                  )}
                                >
                                  <p className="font-semibold text-[hsl(var(--chart-tooltip-title))] mb-1 break-words">
                                    {row.fileName}
                                  </p>
                                  <p className="text-[hsl(var(--chart-tooltip-value))]/80 mb-2 text-[11px]">{row.fullDate}</p>
                                  <ul className="space-y-1 tabular-nums text-[hsl(var(--chart-tooltip-value))]">
                                    <li>
                                      <span className="font-medium text-[hsl(var(--chart-tooltip-title))]">Listings</span>{" "}
                                      {row.listings}
                                    </li>
                                    <li>
                                      <span className="font-medium text-[hsl(var(--chart-tooltip-title))]">Parser errors</span>{" "}
                                      {row.errs}
                                    </li>
                                    <li>
                                      <span className="font-medium text-[hsl(var(--chart-tooltip-title))]">Parser warnings</span>{" "}
                                      {row.warns}
                                    </li>
                                    <li>
                                      <span className="font-medium text-[hsl(var(--chart-tooltip-title))]">All issues</span>{" "}
                                      {row.issues}
                                    </li>
                                  </ul>
                                </div>
                              );
                            }}
                          />
                          <Legend />
                          <Bar dataKey="listings" name="Listings" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="errs" name="Parser errors" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
                {source.versions.length >= 2 ? (
                  <CardFooter className="border-t border-border/50 pt-3">
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      Each cluster is one past import run. Green bars are listing volume; red overlay is parser error
                      count on that file. Rising errors with flat volume can mean a regressing source file, not just more
                      listings.
                    </p>
                  </CardFooter>
                ) : null}
              </Card>
            </TabsContent>

            <TabsContent value="issues" className="space-y-6 mt-6 outline-none">
              <p className="text-sm text-muted-foreground max-w-3xl">
                <strong className="text-foreground">Errors</strong> usually mean the file could not be fully read or rows
                were skipped. <strong className="text-foreground">Warnings</strong> flag data quality problems that did
                not stop the import.
              </p>
              <div className="grid md:grid-cols-2 gap-4">
                <Card className={errors.length ? "border-destructive/35" : ""}>
                  <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2 text-destructive-text">
                        <AlertTriangle className="w-4 h-4" />
                        Errors ({errors.length})
                      </CardTitle>
                      <CardDescription>Parser or validation failures recorded for this run.</CardDescription>
                    </div>
                    {errors.length > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0 gap-1"
                        onClick={() => copyText("Errors", errors.join("\n"))}
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Copy all
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent>
                    {errors.length === 0 ? (
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                        No parser errors for this session.
                      </p>
                    ) : (
                      <ScrollArea className="h-[min(50vh,280px)] pr-3">
                        <ol className="text-sm text-foreground space-y-2 list-decimal pl-4 marker:text-muted-foreground">
                          {errors.map((e, i) => (
                            <li key={i} className="pl-1 break-words">
                              {e}
                            </li>
                          ))}
                        </ol>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <FileWarning className="w-4 h-4 text-warning" />
                        Warnings ({warnings.length})
                      </CardTitle>
                      <CardDescription>Non-fatal issues: missing optional fields, sanitization, image gaps, etc.</CardDescription>
                    </div>
                    {warnings.length > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0 gap-1"
                        onClick={() => copyText("Warnings", warnings.join("\n"))}
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Copy all
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent>
                    {warnings.length === 0 ? (
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                        No parser warnings for this session.
                      </p>
                    ) : (
                      <ScrollArea className="h-[min(50vh,280px)] pr-3">
                        <ol className="text-sm text-foreground space-y-2 list-decimal pl-4 marker:text-muted-foreground">
                          {warnings.map((w, i) => (
                            <li key={i} className="pl-1 break-words">
                              {w}
                            </li>
                          ))}
                        </ol>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="conflicts" className="space-y-6 mt-6 outline-none">
              <p className="text-sm text-muted-foreground max-w-3xl">
                Conflicts are computed from <strong className="text-foreground">this file’s rows</strong> and your{" "}
                <strong className="text-foreground">current field mapping</strong>. They do not include per-listing
                diff status (that is under Listing diffs).
              </p>

              {conflicts.duplicateIds.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Duplicate listing IDs ({conflicts.duplicateIds.length})</CardTitle>
                    <CardDescription>
                      The same id appears more than once. Only one row typically wins in the grid—deduplicate in XML or
                      fix the mapping that produces ids.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-40">
                      <div className="flex flex-wrap gap-1.5">
                        {conflicts.duplicateIds.map((id) => (
                          <Badge key={id} variant="secondary" className="font-mono text-xs cursor-default">
                            {id}
                          </Badge>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}

              {conflicts.duplicateReferences.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Duplicate references ({conflicts.duplicateReferences.length})</CardTitle>
                    <CardDescription>
                      Reference strings should be unique per listing; duplicates often break comparisons and CRM sync.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-40">
                      <div className="flex flex-wrap gap-1.5">
                        {conflicts.duplicateReferences.map((ref) => (
                          <Badge key={ref} variant="secondary" className="font-mono text-xs cursor-default">
                            {ref}
                          </Badge>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}

              {conflicts.mappingConflicts.length > 0 && (
                <Card className="border-destructive/25 bg-destructive/5">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Link2 className="w-4 h-4" />
                      Field mapping conflicts ({conflicts.mappingConflicts.length})
                    </CardTitle>
                    <CardDescription>
                      Multiple XML paths are assigned to one UI field. The importer may pick an arbitrary winner—remove
                      extra mappings on the XML field mapping page.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-3 text-sm">
                      {conflicts.mappingConflicts.map((c) => (
                        <li key={String(c.uiField)} className="border border-border rounded-lg p-3 bg-background/80">
                          <span className="font-medium text-foreground">
                            {UI_FIELDS.find((f) => f.key === c.uiField)?.label ?? String(c.uiField)}
                          </span>
                          <div className="font-mono text-xs text-muted-foreground break-all mt-1">{c.xmlPaths.join(" · ")}</div>
                          <Button asChild variant="link" className="h-auto p-0 text-xs mt-2">
                            <Link to="/field-mapping">Edit field mapping</Link>
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {missingRequiredEffective.length > 0 && (
                <Card className="border-destructive/25 bg-destructive/5">
                  <CardHeader>
                    <CardTitle className="text-base">
                      Missing required field mappings ({missingRequiredEffective.length})
                    </CardTitle>
                    <CardDescription>
                      These fields are required in the app, but your saved mapping does not assign an XML path to them{" "}
                      <em>and</em> the parsed listings for this import do not show usable values (so built-in defaults did
                      not fill them). Map the correct tags on the XML field mapping page, or fix the feed.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-wrap gap-1.5">
                      {missingRequiredEffective.map((k) => (
                        <Badge key={String(k)} variant="destructive" className="text-xs">
                          {UI_FIELDS.find((f) => f.key === k)?.label ?? String(k)}
                        </Badge>
                      ))}
                    </div>
                    <Collapsible>
                      <CollapsibleTrigger className="group flex items-center gap-2 text-sm font-medium text-primary-text hover:underline">
                        <ChevronDown className="w-4 h-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
                        Detailed example
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-3 space-y-3 text-sm text-muted-foreground leading-relaxed">
                        <p>
                          The importer can fill many feeds <strong className="text-foreground">without</strong> any saved
                          mapping because it looks for common tag names (for example{" "}
                          <code className="text-xs bg-muted px-1 py-0.5 rounded">property.reference_number</code> →
                          Reference). This warning only appears when there is <strong className="text-foreground">no</strong>{" "}
                          mapping row for that UI field <strong className="text-foreground">and</strong> the listing data
                          still looks empty or invalid for that field.
                        </p>
                        <div className="rounded-lg border border-border bg-muted/40 p-3 font-mono text-[11px] text-foreground whitespace-pre-wrap overflow-x-auto">
                          {`<property>
  <!-- Standard names → often no mapping needed -->
  <reference_number>PA-1813</reference_number>
  <title_en>3 Bed Villa</title_en>
  <price>425000</price>
  <offering_type>RR</offering_type>
  <property_type>VH</property_type>
</property>`}
                        </div>
                        <p>
                          On <strong className="text-foreground">XML field mapping</strong>, each row links one XML path (left) to
                          one app field (right). For Reference you might set{" "}
                          <code className="text-xs bg-muted px-1 py-0.5 rounded">property.reference_number</code> →{" "}
                          <em>Reference</em>. If your feed uses odd names (e.g.{" "}
                          <code className="text-xs bg-muted px-1 py-0.5 rounded">property.listing_ref</code>) and the
                          parser does not guess them, you must add that mapping or the field stays empty and this check
                          fails.
                        </p>
                      </CollapsibleContent>
                    </Collapsible>
                    <Button asChild variant="outline" size="sm">
                      <Link to="/field-mapping">Open field mapping</Link>
                    </Button>
                  </CardContent>
                </Card>
              )}

              {conflictStructuralCount === 0 && (
                <div className="flex items-start gap-2 text-sm text-muted-foreground rounded-xl border border-border bg-card p-4">
                  <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                  <span>No duplicate ids/refs, mapping clashes, or missing required mappings for this session.</span>
                </div>
              )}
            </TabsContent>

            <TabsContent value="listings" className="space-y-4 mt-6 outline-none">
              {allNewFirstImport && diffs.length > DIFF_PAGE_SIZE && (
                <p className="text-sm text-muted-foreground rounded-lg border border-border bg-muted/30 px-3 py-2">
                  Every listing is <strong className="text-foreground">new</strong> for this diff (no earlier import from
                  the same agency to compare). The table is paginated ({DIFF_PAGE_SIZE} per page). Use{" "}
                  <Link to="/listings" className="text-primary-text font-medium underline underline-offset-2">
                    Listings
                  </Link>{" "}
                  for the full grid.
                </p>
              )}

              <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-3">
                <span className="text-sm font-medium text-foreground shrink-0">Filter by status</span>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant={statusQ === "all" ? "default" : "outline"}
                    onClick={() => setStatusQ("all")}
                    className="transition-transform active:scale-[0.98]"
                  >
                    All ({diffs.length})
                  </Button>
                  {STATUS_OPTIONS.map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant={statusQ === s ? "default" : "outline"}
                      onClick={() => setStatusQ(s)}
                      className="capitalize transition-transform active:scale-[0.98]"
                    >
                      {s} ({diffs.filter((d) => d.status === s).length})
                    </Button>
                  ))}
                </div>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Filter by reference or id…"
                  value={refSearch}
                  onChange={(e) => setRefSearch(e.target.value)}
                  className="pl-9 max-w-md"
                  aria-label="Filter listing diffs"
                />
              </div>

              {searchedDiffs.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Showing {(effectiveDiffPage - 1) * DIFF_PAGE_SIZE + 1}–
                  {Math.min(effectiveDiffPage * DIFF_PAGE_SIZE, searchedDiffs.length)} of {searchedDiffs.length}
                  {searchedDiffs.length !== filteredDiffs.length && ` (filtered from ${filteredDiffs.length})`}
                </p>
              )}

              <ScrollArea className="h-[min(55vh,480px)] rounded-xl border border-border -mx-px">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/90 backdrop-blur border-b border-border z-10">
                    <tr>
                      <th className="text-left p-2 sm:p-3 font-medium">Reference</th>
                      <th className="text-left p-2 sm:p-3 font-medium">Status</th>
                      <th className="text-left p-2 sm:p-3 font-medium hidden md:table-cell">Changed fields</th>
                      <th className="text-left p-2 sm:p-3 font-medium w-20">Open</th>
                    </tr>
                  </thead>
                  <tbody>
                    {searchedDiffs.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-8 text-center text-muted-foreground">
                          No rows for this filter.
                        </td>
                      </tr>
                    ) : (
                      pagedDiffs.map((d) => (
                        <tr
                          key={d.id}
                          className="border-b border-border/60 hover:bg-accent/50 cursor-pointer transition-colors"
                          onClick={() => navigate(`/listing/${d.id}`)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              navigate(`/listing/${d.id}`);
                            }
                          }}
                          tabIndex={0}
                          role="link"
                          aria-label={`Open listing ${d.reference}`}
                        >
                          <td className="p-2 sm:p-3 font-mono text-xs align-top">{d.reference}</td>
                          <td className="p-2 sm:p-3 align-top">
                            <Badge variant="outline" className="text-xs capitalize">
                              {d.status}
                            </Badge>
                          </td>
                          <td className="p-2 sm:p-3 text-xs text-muted-foreground align-top hidden md:table-cell">
                            {d.changedKeys?.length
                              ? d.changedKeys
                                  .map((k) => UI_FIELDS.find((f) => f.key === k)?.label ?? String(k))
                                  .join(", ")
                              : "—"}
                          </td>
                          <td className="p-2 sm:p-3 align-top">
                            <Button
                              asChild
                              variant="link"
                              size="sm"
                              className="h-auto p-0 text-xs"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Link to={`/listing/${d.id}`}>View</Link>
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </ScrollArea>

              {diffTotalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={effectiveDiffPage <= 1}
                    onClick={() => setDiffPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground tabular-nums px-2">
                    Page {effectiveDiffPage} / {diffTotalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={effectiveDiffPage >= diffTotalPages}
                    onClick={() => setDiffPage((p) => Math.min(diffTotalPages, p + 1))}
                  >
                    Next
                  </Button>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </TooltipProvider>
  );
};

export default ValidationPage;
