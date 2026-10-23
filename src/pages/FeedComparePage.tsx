import AppHeader from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FeedComparePairPanel } from "@/components/FeedComparePairPanel";
import { WorkflowCompareLinks } from "@/components/WorkflowCompareLinks";
import {
  compareCrossImportFeeds,
  crossImportPairKindBadgeVariant,
  crossImportPairKindLabel,
  type CrossImportCompareOptions,
  type CrossImportResult,
  type WithinFeedDuplicateReport,
} from "@/lib/crossImportCompare";
import { NoSourceState, VersionPicker } from "@/components/SourcePicker";
import { useAppData } from "@/providers/DataProvider";
import { useVersionListings } from "@/hooks/useSources";
import { liveVersionOf, type SourceDTO, type VersionDTO } from "@/lib/sourcesApi";
import type { Listing } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowRightLeft,
  ChevronDown,
  Copy,
  ExternalLink,
  GitCompare,
  ImageIcon,
  Layers,
  Loader2,
  Rows3,
  Sparkles,
  Table2,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "@/components/ui/sonner";

const FEED_COMPARE_TABS = [
  "changed",
  "pairs",
  "removed",
  "added",
  "dupes",
  "fuzzy-dupes",
  "ambiguous",
] as const;

type CompareTab = (typeof FEED_COMPARE_TABS)[number];

function tabFromHash(): CompareTab {
  if (typeof window === "undefined") return "changed";
  const raw = window.location.hash.replace(/^#/, "");
  return (FEED_COMPARE_TABS as readonly string[]).includes(raw) ? (raw as CompareTab) : "changed";
}

/** Resolves a URL value ("live" or a version id) to a version of the source. */
function resolveVersion(source: SourceDTO, value: string | null): VersionDTO | null {
  if (!value || value === "live") return liveVersionOf(source);
  return source.versions.find((v) => v.id === value) ?? null;
}

export default function FeedComparePage() {
  const { sources, isLoading } = useAppData();
  const [params, setParams] = useSearchParams();
  const sourceId = params.get("source");
  const source = sources.find((s) => s.id === sourceId) ?? null;

  const live = source ? liveVersionOf(source) : null;
  const versionB = source ? (params.get("b") ? resolveVersion(source, params.get("b")) : live) : null;
  const versionA = source
    ? params.get("a")
      ? resolveVersion(source, params.get("a"))
      : (source.versions[source.versions.findIndex((v) => v.id === versionB?.id) + 1] ?? versionB)
    : null;

  const setParam = (key: string, value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set(key, value);
        return next;
      },
      { replace: true },
    );
  const pickSource = (id: string) => setParams({ source: id }, { replace: true });

  const [matchPermit, setMatchPermit] = useState(true);
  const [fuzzyPriceBand, setFuzzyPriceBand] = useState<CrossImportCompareOptions["fuzzyPriceBand"]>("strict");
  const [looseFuzzySecondPass, setLooseFuzzySecondPass] = useState(true);

  const qA = useVersionListings(versionA);
  const qB = useVersionListings(versionB);
  const loadedA = qA.data ?? null;
  const loadedB = qB.data ?? null;
  const qLive = useVersionListings(live);
  const loadingA = qA.isLoading;
  const loadingB = qB.isLoading;

  const labelA = versionA ? `${source?.name} v${versionA.number}` : "Feed A";
  const labelB = versionB ? `${source?.name} v${versionB.number}` : "Feed B";

  const compareOptions = useMemo(
    (): Partial<CrossImportCompareOptions> => ({
      matchPermit,
      fuzzyPriceBand,
      looseFuzzySecondPass: fuzzyPriceBand === "strict" && looseFuzzySecondPass,
    }),
    [matchPermit, fuzzyPriceBand, looseFuzzySecondPass],
  );

  const result: CrossImportResult | null = useMemo(() => {
    if (loadedA === null || loadedB === null) return null;
    if (loadingA || loadingB) return null;
    return compareCrossImportFeeds(loadedA, loadedB, { a: labelA, b: labelB }, compareOptions);
  }, [loadedA, loadedB, loadingA, loadingB, labelA, labelB, compareOptions]);

  const [compareTab, setCompareTab] = useState<CompareTab>(() => tabFromHash());
  const [pairFilter, setPairFilter] = useState<"all" | "changed" | "unchanged">("all");

  useEffect(() => {
    const next = `#${compareTab}`;
    if (typeof window !== "undefined" && window.location.hash !== next) {
      window.history.replaceState(null, "", next);
    }
  }, [compareTab]);

  const sameSourceSelected = !!versionA && !!versionB && versionA.id === versionB.id;

  const changedPairs = useMemo(() => (result ? result.pairs.filter((p) => p.changedKeys.length > 0) : []), [result]);

  const filteredPairs = useMemo(() => {
    if (!result) return [];
    switch (pairFilter) {
      case "changed":
        return result.pairs.filter((p) => p.changedKeys.length > 0);
      case "unchanged":
        return result.pairs.filter((p) => p.changedKeys.length === 0);
      default:
        return result.pairs;
    }
  }, [result, pairFilter]);

  const exactDupesCount = result
    ? result.withinA.exactReferenceGroups.length + result.withinB.exactReferenceGroups.length
    : 0;
  const fuzzyDupesCount = result ? result.withinA.fuzzyGroups.length + result.withinB.fuzzyGroups.length : 0;

  const liveIdSet = useMemo(() => new Set((live ? qLive.data : null)?.map((l) => l.id) ?? []), [live, qLive.data]);
  const listingInWorkspace = useCallback((id: string) => liveIdSet.has(id), [liveIdSet]);

  const busy = loadingA || loadingB;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <a
        href="#feed-compare-main"
        className={cn(
          "sr-only",
          "focus:fixed focus:left-4 focus:top-4 focus:z-[100]",
          "focus:m-0 focus:inline-flex focus:h-auto focus:w-auto focus:overflow-visible focus:whitespace-normal focus:p-0 focus:clip-auto",
          "focus:rounded-md focus:bg-primary focus:px-4 focus:py-2.5 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background",
        )}
      >
        Skip to main content
      </a>
      <AppHeader />
      <main
        id="feed-compare-main"
        tabIndex={-1}
        className="flex-1 container max-w-[min(100%,96rem)] py-8 px-4 sm:px-6 space-y-8 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-prose space-y-2">
            <h1
              className="text-2xl sm:text-3xl font-bold font-heading tracking-tight flex items-center gap-3"
              data-testid="feed-compare-title"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/12 ring-1 ring-primary/20">
                <ArrowRightLeft className="w-7 h-7 text-primary-text" aria-hidden />
              </span>
              Feed compare
            </h1>
            <p className="text-muted-foreground text-base leading-relaxed">
              Compare two feeds at listing level: <span className="text-foreground font-medium">reference</span>, optional{" "}
              <span className="text-foreground font-medium">permit / Trakheesi</span> match, then{" "}
              <span className="text-foreground font-medium">fuzzy</span> (location + title + price band, strict or loose).
              Tune matching under Sources. Unpaired rows show in Only in A/B; many-to-one fuzzy collisions land in Ambiguous.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <WorkflowCompareLinks current="feed-compare" className="max-w-xl text-[11px] sm:text-xs" heading="Related workflows" />
          <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 shrink-0">
            <span className="font-medium text-foreground">Also</span>
            <span className="opacity-40" aria-hidden>
              ·
            </span>
            <Link to="/sources" className="text-primary-text hover:underline inline-flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded-sm">
              <Layers className="w-3 h-3 shrink-0" aria-hidden />
              Sources
            </Link>
          </p>
        </div>

        <Card role="region" aria-labelledby="feed-compare-sources-heading">
          <CardHeader className="pb-3">
            <CardTitle id="feed-compare-sources-heading" className="text-lg">
              Versions
            </CardTitle>
            <CardDescription className="text-sm leading-relaxed max-w-prose">
              Compare two versions of one source. Version A is the baseline (“before”); version B is the comparison
              (“after”).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-1.5 max-w-xs">
              <Label htmlFor="feed-compare-source" className="text-xs font-medium text-muted-foreground">
                Source
              </Label>
              <Select value={source?.id ?? ""} onValueChange={pickSource}>
                <SelectTrigger id="feed-compare-source" className="min-h-11">
                  <SelectValue placeholder="Choose a source…" />
                </SelectTrigger>
                <SelectContent>
                  {sources.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {source && (
              <>
                <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-start">
                  <div className="flex items-center gap-3 min-h-10">
                    <Switch id="feed-match-permit" checked={matchPermit} onCheckedChange={setMatchPermit} />
                    <Label htmlFor="feed-match-permit" className="text-sm cursor-pointer leading-snug max-w-[18rem]">
                      Match permit / Trakheesi IDs (after reference)
                    </Label>
                  </div>
                  <div className="flex flex-col gap-1.5 min-w-[14rem]">
                    <Label htmlFor="feed-fuzzy-price" className="text-xs font-medium text-muted-foreground">
                      Fuzzy price band
                    </Label>
                    <Select
                      value={fuzzyPriceBand}
                      onValueChange={(v) => setFuzzyPriceBand(v as CrossImportCompareOptions["fuzzyPriceBand"])}
                    >
                      <SelectTrigger id="feed-fuzzy-price" className="h-9 w-full sm:w-[220px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="strict">Strict (~2.5% — default)</SelectItem>
                        <SelectItem value="loose">Loose (~6% — price often differs)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-3 min-h-10">
                    <Switch
                      id="feed-loose-second"
                      checked={looseFuzzySecondPass}
                      onCheckedChange={setLooseFuzzySecondPass}
                      disabled={fuzzyPriceBand === "loose"}
                    />
                    <Label
                      htmlFor="feed-loose-second"
                      className={cn(
                        "text-sm leading-snug max-w-[20rem]",
                        fuzzyPriceBand === "loose" ? "text-muted-foreground cursor-not-allowed" : "cursor-pointer",
                      )}
                    >
                      Second pass: looser price on leftovers (only when fuzzy band is strict)
                    </Label>
                  </div>
                </div>

                {sameSourceSelected && (
                  <p
                    className="text-sm rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-950 dark:text-amber-100"
                    role="status"
                  >
                    Versions A and B are the same — comparison will show no differences unless duplicates exist inside
                    the feed.
                  </p>
                )}

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-3 rounded-lg border border-border p-4 bg-card/40">
                    <VersionPicker
                      source={source}
                      label="Version A (before)"
                      value={versionA?.id ?? ""}
                      onChange={(v) => setParam("a", v)}
                      className="w-full"
                    />
                    {loadingA && <Loader2 className="w-4 h-4 animate-spin text-primary-text" aria-hidden />}
                  </div>
                  <div className="space-y-3 rounded-lg border border-border p-4 bg-card/40">
                    <VersionPicker
                      source={source}
                      label="Version B (after)"
                      value={versionB?.id ?? ""}
                      onChange={(v) => setParam("b", v)}
                      className="w-full"
                    />
                    {loadingB && <Loader2 className="w-4 h-4 animate-spin text-primary-text" aria-hidden />}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {!source && <NoSourceState what="feed compare" />}

        {busy && (
          <p
            className="text-base text-muted-foreground flex items-center gap-3 py-2"
            role="status"
            aria-live="polite"
            aria-busy="true"
          >
            <Loader2 className="w-5 h-5 shrink-0 animate-spin text-primary-text" aria-hidden />
            <span>Loading version listings…</span>
          </p>
        )}

        {result && !busy && (
          <>
            <div className="space-y-3" role="region" aria-label="Comparison summary and navigation">
              <div className="rounded-xl border border-border bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                <span>
                  <span className="font-medium text-foreground">Feed A</span>{" "}
                  <span className="tabular-nums">{result.summary.countA}</span> listings
                </span>
                <span>
                  <span className="font-medium text-foreground">Feed B</span>{" "}
                  <span className="tabular-nums">{result.summary.countB}</span> listings
                </span>
                <span>
                  <span className="font-medium text-foreground">Match quality</span>{" "}
                  {result.summary.matchedByReference} ref
                  {result.summary.matchedByPermit ? ` · ${result.summary.matchedByPermit} permit` : ""}
                  {` · ${result.summary.matchedByFuzzy} fuzzy`}
                  {result.summary.matchedByFuzzyLoose
                    ? ` · ${result.summary.matchedByFuzzyLoose} fuzzy (loose 2nd)`
                    : ""}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-9 gap-2">
                <StatCard title="Listings (A | B)" a={result.summary.countA} b={result.summary.countB} />
                <CompareNavCard
                  active={compareTab === "changed"}
                  icon={Table2}
                  label="Changed"
                  description="Pairs with field diffs"
                  count={changedPairs.length}
                  onSelect={() => {
                    setCompareTab("changed");
                    setPairFilter("all");
                  }}
                />
                <CompareNavCard
                  active={compareTab === "pairs" && pairFilter === "unchanged"}
                  icon={Layers}
                  label="Unchanged"
                  description="Matched · same fields"
                  count={result.summary.unchangedCount}
                  onSelect={() => {
                    setCompareTab("pairs");
                    setPairFilter("unchanged");
                  }}
                />
                <CompareNavCard
                  active={compareTab === "pairs" && pairFilter === "all"}
                  icon={Rows3}
                  label="All pairs"
                  description="Every A↔B match"
                  count={result.pairs.length}
                  onSelect={() => {
                    setCompareTab("pairs");
                    setPairFilter("all");
                  }}
                />
                <CompareNavCard
                  active={compareTab === "removed"}
                  icon={GitCompare}
                  label="Only in A"
                  description={`In ${result.labelA} only`}
                  count={result.onlyInA.length}
                  onSelect={() => setCompareTab("removed")}
                />
                <CompareNavCard
                  active={compareTab === "added"}
                  icon={GitCompare}
                  label="Only in B"
                  description={`In ${result.labelB} only`}
                  count={result.onlyInB.length}
                  onSelect={() => setCompareTab("added")}
                />
                <CompareNavCard
                  active={compareTab === "dupes"}
                  icon={Copy}
                  label="Dupes"
                  description="Same reference ×2+"
                  count={exactDupesCount}
                  onSelect={() => setCompareTab("dupes")}
                />
                <CompareNavCard
                  active={compareTab === "fuzzy-dupes"}
                  icon={Sparkles}
                  label="Fuzzy dupes"
                  description="Same fuzzy key"
                  count={fuzzyDupesCount}
                  onSelect={() => setCompareTab("fuzzy-dupes")}
                />
                <CompareNavCard
                  active={compareTab === "ambiguous"}
                  icon={AlertTriangle}
                  label="Ambiguous"
                  description="Fuzzy collisions"
                  count={result.ambiguousFuzzy.length}
                  onSelect={() => setCompareTab("ambiguous")}
                />
              </div>
            </div>

            <Tabs
              value={compareTab}
              onValueChange={(v) => {
                const next = v as CompareTab;
                setCompareTab(next);
                if (next !== "pairs") setPairFilter("all");
              }}
              className="space-y-4"
              aria-label="Feed comparison results"
            >
              <TabsList className="flex flex-wrap h-auto gap-1 p-1 w-full justify-start" aria-label="Choose a result view">
                <TabsTrigger value="changed" className="gap-1.5 min-h-9">
                  <Table2 className="w-4 h-4 shrink-0" aria-hidden />
                  Changed ({changedPairs.length})
                </TabsTrigger>
                <TabsTrigger value="pairs" className="gap-1.5 min-h-9">
                  <Rows3 className="w-4 h-4 shrink-0" aria-hidden />
                  All pairs ({result.pairs.length})
                </TabsTrigger>
                <TabsTrigger value="removed">Only in A ({result.onlyInA.length})</TabsTrigger>
                <TabsTrigger value="added">Only in B ({result.onlyInB.length})</TabsTrigger>
                <TabsTrigger value="dupes">
                  Dupes
                  <Badge variant="secondary" className="ml-1 tabular-nums">
                    {exactDupesCount}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="fuzzy-dupes">
                  Fuzzy dupes
                  <Badge variant="secondary" className="ml-1 tabular-nums">
                    {fuzzyDupesCount}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="ambiguous">
                  Ambiguous
                  <Badge variant="secondary" className="ml-1 tabular-nums">
                    {result.ambiguousFuzzy.length}
                  </Badge>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="changed" className="space-y-3">
                <p className="text-sm text-muted-foreground leading-relaxed max-w-prose">
                  Side-by-side preview, open listing detail pages, numeric criteria (images, text length, XML size),
                  Git-style line diffs for title/description, a full field matrix, and every column including raw XML.
                </p>
                {changedPairs.length === 0 ? (
                  <p className="text-sm text-muted-foreground" role="status">
                    No changed pairs for this comparison.
                  </p>
                ) : (
                  <ScrollArea className="h-[min(70vh,720px)] pr-3">
                    <div className="space-y-4 pb-2">
                      {changedPairs.map((pair, idx) => (
                        <FeedComparePairPanel
                          key={`${pair.listingA.id}-${pair.listingB.id}-${idx}`}
                          pair={pair}
                          labelA={result!.labelA}
                          labelB={result!.labelB}
                          listingInWorkspace={listingInWorkspace}
                          defaultOpen={idx < 4}
                        />
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </TabsContent>

              <TabsContent value="pairs" className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Every A↔B pair. Filter by match status or open each listing.
                </p>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Filter pairs list">
                  <Button
                    type="button"
                    size="sm"
                    variant={pairFilter === "all" ? "default" : "outline"}
                    className="h-8 text-xs"
                    onClick={() => setPairFilter("all")}
                  >
                    All ({result.pairs.length})
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={pairFilter === "changed" ? "default" : "outline"}
                    className="h-8 text-xs"
                    onClick={() => setPairFilter("changed")}
                  >
                    Changed ({changedPairs.length})
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={pairFilter === "unchanged" ? "default" : "outline"}
                    className="h-8 text-xs"
                    onClick={() => setPairFilter("unchanged")}
                  >
                    Unchanged ({result.summary.unchangedCount})
                  </Button>
                </div>
                <ScrollArea className="h-[min(60vh,560px)]">
                  <div className="space-y-2 text-sm pr-3">
                    {filteredPairs.map((p, i) => (
                      <div
                        key={`${p.listingA.id}-${p.listingB.id}-${i}`}
                        className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card/50 px-2 py-2"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1 sm:flex-initial">
                          <FeedCompareListingThumb listing={p.listingA} side="A" />
                          <span className="font-mono text-xs truncate">{p.listingA.reference || p.listingA.id}</span>
                        </div>
                        <Badge variant={crossImportPairKindBadgeVariant(p.kind)} className="shrink-0">
                          {crossImportPairKindLabel(p.kind)}
                        </Badge>
                        <div className="flex items-center gap-2 min-w-0 flex-1 sm:flex-initial sm:justify-end">
                          <span className="font-mono text-xs truncate text-right">{p.listingB.reference || p.listingB.id}</span>
                          <FeedCompareListingThumb listing={p.listingB} side="B" />
                        </div>
                        <span className="text-muted-foreground text-xs w-full sm:w-auto sm:ml-auto">
                          {p.changedKeys.length ? `${p.changedKeys.length} changes` : "unchanged"}
                        </span>
                        <span className="flex gap-1 shrink-0 w-full sm:w-auto justify-end">
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" asChild>
                            <Link
                              to={`/listing/${encodeURIComponent(p.listingA.id)}`}
                              aria-label={`Open listing A (${p.listingA.reference || p.listingA.id}) in detail view`}
                            >
                              <ExternalLink className="w-3 h-3" aria-hidden />
                              A
                            </Link>
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" asChild>
                            <Link
                              to={`/listing/${encodeURIComponent(p.listingB.id)}`}
                              aria-label={`Open listing B (${p.listingB.reference || p.listingB.id}) in detail view`}
                            >
                              <ExternalLink className="w-3 h-3" aria-hidden />
                              B
                            </Link>
                          </Button>
                        </span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="removed">
                <ListingList title={`In ${result.labelA} only`} listings={result.onlyInA} empty="Nothing only in A." />
              </TabsContent>
              <TabsContent value="added">
                <ListingList title={`In ${result.labelB} only`} listings={result.onlyInB} empty="Nothing only in B." />
              </TabsContent>

              <TabsContent value="dupes" className="space-y-4">
                <WithinFeedDupesPanel label={result.labelA} report={result.withinA} kind="exact_reference" />
                <WithinFeedDupesPanel label={result.labelB} report={result.withinB} kind="exact_reference" />
              </TabsContent>

              <TabsContent value="fuzzy-dupes" className="space-y-4">
                <Collapsible defaultOpen className="rounded-lg border border-border bg-muted/15">
                  <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium hover:bg-muted/40 rounded-t-lg">
                    <ChevronDown className="w-4 h-4 shrink-0 transition-transform data-[state=open]:rotate-180" aria-hidden />
                    About within-feed fuzzy duplicates
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <p className="text-sm text-muted-foreground px-3 pb-3 leading-relaxed border-t border-border/60 pt-2">
                      Same normalized location + title + price band, but different references (or missing refs) inside one
                      feed — possible duplicate listings. Expand each group to review photos and open detail pages.
                    </p>
                  </CollapsibleContent>
                </Collapsible>
                <WithinFeedDupesPanel label={result.labelA} report={result.withinA} kind="fuzzy" />
                <WithinFeedDupesPanel label={result.labelB} report={result.withinB} kind="fuzzy" />
              </TabsContent>

              <TabsContent value="ambiguous" className="space-y-3">
                <Collapsible defaultOpen className="rounded-lg border border-border bg-muted/15">
                  <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium hover:bg-muted/40 rounded-t-lg">
                    <ChevronDown className="w-4 h-4 shrink-0 transition-transform data-[state=open]:rotate-180" aria-hidden />
                    About ambiguous fuzzy clusters
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <p className="text-sm text-muted-foreground px-3 pb-3 leading-relaxed border-t border-border/60 pt-2">
                      Several listings on one or both sides share the same fuzzy key — manual review helps decide which rows
                      should pair. Expand a cluster to see thumbnails and open each listing.
                    </p>
                  </CollapsibleContent>
                </Collapsible>
                {result.ambiguousFuzzy.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No ambiguous fuzzy clusters.</p>
                ) : (
                  <div className="space-y-3">
                    {result.ambiguousFuzzy.map((cl, idx) => (
                      <Collapsible key={`${cl.fuzzyKey}:${idx}`} defaultOpen={idx < 2} className="rounded-xl border border-border bg-card shadow-sm">
                        <CollapsibleTrigger className="flex w-full items-start gap-2 px-3 py-3 text-left hover:bg-muted/40 rounded-t-xl">
                          <ChevronDown
                            className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground transition-transform data-[state=open]:rotate-180"
                            aria-hidden
                          />
                          <div className="min-w-0 flex-1 space-y-1">
                            <p className="text-xs font-mono break-all text-foreground">{cl.fuzzyKey}</p>
                            <p className="text-xs text-muted-foreground">
                              {cl.listingsA.length} in A · {cl.listingsB.length} in B
                            </p>
                          </div>
                          <Badge variant="secondary" className="shrink-0 tabular-nums">
                            {cl.listingsA.length + cl.listingsB.length}
                          </Badge>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="grid gap-4 md:grid-cols-2 border-t border-border px-3 pb-3 pt-2 text-sm">
                            <div className="space-y-2">
                              <p className="text-xs font-semibold text-muted-foreground">Side A</p>
                              <ul className="space-y-2">
                                {cl.listingsA.map((l) => (
                                  <ListingDupRow key={l.id} listing={l} />
                                ))}
                              </ul>
                            </div>
                            <div className="space-y-2">
                              <p className="text-xs font-semibold text-muted-foreground">Side B</p>
                              <ul className="space-y-2">
                                {cl.listingsB.map((l) => (
                                  <ListingDupRow key={l.id} listing={l} />
                                ))}
                              </ul>
                            </div>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>
    </div>
  );
}

function StatCard(props: {
  title: string;
  subtitle?: string;
  a: number;
  b: number;
  foot?: string;
}) {
  return (
    <Card className="shadow-none bg-muted/25 border-dashed" role="group" aria-label={props.title}>
      <CardHeader className="py-3 space-y-0 pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{props.title}</CardTitle>
        {props.subtitle && <CardDescription className="text-[11px]">{props.subtitle}</CardDescription>}
      </CardHeader>
      <CardContent className="pt-0 space-y-1 pb-3">
        <div className="flex items-baseline gap-2 text-xl font-semibold tabular-nums">
          <span>{props.a}</span>
          <span className="text-muted-foreground text-base">/</span>
          <span>{props.b}</span>
        </div>
        {props.foot && <p className="text-[11px] text-muted-foreground">{props.foot}</p>}
      </CardContent>
    </Card>
  );
}

function CompareNavCard(props: {
  icon: LucideIcon;
  label: string;
  description: string;
  count: number;
  active: boolean;
  onSelect: () => void;
}) {
  const Icon = props.icon;
  return (
    <button
      type="button"
      onClick={props.onSelect}
      className={cn(
        "rounded-xl border bg-card text-left shadow-sm transition-all hover:border-primary/50 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        props.active ? "border-primary ring-2 ring-primary/25 bg-primary/[0.06]" : "border-border",
      )}
      aria-current={props.active ? "true" : undefined}
    >
      <div className="flex flex-col gap-1 p-3 min-h-[5.25rem]">
        <div className="flex items-start justify-between gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary-text ring-1 ring-primary/15">
            <Icon className="w-4 h-4" aria-hidden />
          </span>
          <span className="text-lg font-bold tabular-nums leading-none text-foreground">{props.count}</span>
        </div>
        <div className="space-y-0.5 min-w-0">
          <p className="text-xs font-semibold text-foreground leading-tight">{props.label}</p>
          <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">{props.description}</p>
        </div>
      </div>
    </button>
  );
}

function FeedCompareListingThumb({ listing, side }: { listing: Listing; side: "A" | "B" | "neutral" }) {
  const src = listing.images?.[0]?.trim();
  const tone =
    side === "A"
      ? "ring-sky-500/35 bg-sky-500/[0.06]"
      : side === "B"
        ? "ring-emerald-500/35 bg-emerald-500/[0.06]"
        : "ring-border bg-muted/50";
  return (
    <span
      className={cn(
        "relative block h-10 w-10 shrink-0 overflow-hidden rounded-md ring-2 ring-offset-2 ring-offset-background",
        tone,
      )}
      aria-hidden={!src}
    >
      {src ? (
        <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
      ) : (
        <span className="flex h-full w-full items-center justify-center bg-muted">
          <ImageIcon className="w-4 h-4 text-muted-foreground opacity-60" aria-hidden />
        </span>
      )}
    </span>
  );
}

function ListingDupRow({ listing }: { listing: Listing }) {
  return (
    <li className="flex items-center gap-2 rounded-lg border border-border/80 bg-muted/20 px-2 py-1.5">
      <FeedCompareListingThumb listing={listing} side="neutral" />
      <div className="min-w-0 flex-1">
        <p className="font-mono text-xs truncate">{listing.reference || listing.id}</p>
        <p className="text-[11px] text-muted-foreground line-clamp-2">{listing.title || "—"}</p>
      </div>
      <Button variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-[11px]" asChild>
        <Link to={`/listing/${encodeURIComponent(listing.id)}`} aria-label={`Open listing ${listing.reference || listing.id}`}>
          Open
          <ExternalLink className="w-3 h-3 ml-0.5" aria-hidden />
        </Link>
      </Button>
    </li>
  );
}

function ListingList(props: { title: string; listings: Listing[]; empty: string }) {
  const headingId = useId();
  if (!props.listings.length) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        {props.empty}
      </p>
    );
  }
  return (
    <section className="space-y-2" aria-labelledby={headingId}>
      <h3 id={headingId} className="text-sm font-semibold text-foreground">
        {props.title}
      </h3>
      <ScrollArea className="h-[min(50vh,480px)] rounded-md border border-border">
        <ul className="p-2 text-sm space-y-2">
          {props.listings.map((l) => (
            <ListingDupRow key={l.id} listing={l} />
          ))}
        </ul>
      </ScrollArea>
    </section>
  );
}

function WithinFeedDupesPanel(props: {
  label: string;
  report: WithinFeedDuplicateReport;
  kind: "exact_reference" | "fuzzy";
}) {
  const groups =
    props.kind === "exact_reference" ? props.report.exactReferenceGroups : props.report.fuzzyGroups;
  if (!groups.length) {
    return (
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">{props.label}</CardTitle>
          <CardDescription>No {props.kind === "exact_reference" ? "reference" : "fuzzy"} duplicate groups.</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  return (
    <Card className="overflow-hidden">
      <CardHeader className="py-3">
        <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
          <span>{props.label}</span>
          <Badge variant="outline">{groups.length} group{groups.length === 1 ? "" : "s"}</Badge>
        </CardTitle>
        <CardDescription>
          {props.kind === "exact_reference"
            ? "Same normalized reference appears more than once."
            : "Same fuzzy signature (location + title + price band) with different references."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 pb-4">
        {groups.map((g, idx) => (
          <Collapsible key={`${g.key}:${idx}`} defaultOpen={idx < 3} className="rounded-xl border border-border bg-card/60">
            <CollapsibleTrigger className="flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-muted/50 rounded-t-xl">
              <ChevronDown
                className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground transition-transform data-[state=open]:rotate-180"
                aria-hidden
              />
              <div className="min-w-0 flex-1 font-mono text-[11px] break-all leading-snug">
                {props.kind === "exact_reference" ? (
                  <span>ref: {g.key}</span>
                ) : (
                  <span>{g.key}</span>
                )}
              </div>
              <Badge variant="secondary" className="shrink-0 tabular-nums">
                {g.listings.length}×
              </Badge>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="space-y-2 border-t border-border px-3 py-2">
                {g.listings.map((l) => (
                  <ListingDupRow key={l.id} listing={l} />
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        ))}
      </CardContent>
    </Card>
  );
}
