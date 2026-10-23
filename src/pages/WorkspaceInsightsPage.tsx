import AppHeader from "@/components/AppHeader";
import ListingAnalyticsDashboard from "@/components/analytics/ListingAnalyticsDashboard";
import { WorkflowCompareLinks } from "@/components/WorkflowCompareLinks";
import { WorkspacePlaybook } from "@/components/WorkspacePlaybook";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { buildWorkspaceDigestMarkdown } from "@/lib/workspaceDigest";
import { cn } from "@/lib/utils";
import { useAppData } from "@/providers/DataProvider";
import {
  ArrowRightLeft,
  BarChart3,
  ClipboardCheck,
  ClipboardList,
  Database,
  Download,
  Gauge,
  GitCompare,
  Keyboard,
  Layers,
  LayoutGrid,
  Link2,
  ListTree,
  Map,
  PieChart,
  ScanSearch,
  Shuffle,
  FileText,
} from "lucide-react";
import { useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { toast } from "@/components/ui/sonner";

type Shortcut = {
  to: string;
  title: string;
  description: string;
  icon: typeof Database;
};

const SHORTCUTS: Shortcut[] = [
  {
    to: "/database",
    title: "Listing table",
    description: "Dense grid, import Δ, CSV export",
    icon: Database,
  },
  {
    to: "/feed-compare",
    title: "Feed compare",
    description: "Diff two imports field-by-field",
    icon: ArrowRightLeft,
  },
  {
    to: "/cross-agency-dupes",
    title: "Cross-agency dupes",
    description: "Fuzzy clusters across agencies",
    icon: Link2,
  },
  {
    to: "/validation",
    title: "Validation",
    description: "Sessions, conflicts, warnings",
    icon: ClipboardList,
  },
  {
    to: "/field-quality",
    title: "Field coverage",
    description: "EDA over mapped paths",
    icon: ScanSearch,
  },
  {
    to: "/mapping-qa",
    title: "Mapping & XML QA",
    description: "Path audit, checklist, spot checks",
    icon: ClipboardCheck,
  },
  {
    to: "/listings/map",
    title: "Map",
    description: "Geo scatter for listings",
    icon: Map,
  },
  {
    to: "/export-hub",
    title: "Export hub",
    description: "CSV, compares, workspace sync",
    icon: Download,
  },
  {
    to: "/shortcuts",
    title: "Shortcuts",
    description: "Palette keys & navigation tips",
    icon: Keyboard,
  },
  {
    to: "/sitemap",
    title: "Site map",
    description: "Every route & redirect alias",
    icon: ListTree,
  },
  {
    to: "/random-listing",
    title: "Surprise listing",
    description: "Jump to a random unit for spot QA",
    icon: Shuffle,
  },
];

export default function WorkspaceInsightsPage() {
  const {
    listings,
    scope,
    setScope,
    listingsByAgency,
    sources,
    selectedSource,
    selectedLiveVersion,
  } = useAppData();
  const allVersions = useMemo(
    () => sources.flatMap((s) => s.versions.map((v) => ({ source: s, version: v }))),
    [sources],
  );
  const mappingConfig = selectedSource?.mapping ?? null;
  const importTime = selectedLiveVersion?.createdAt ?? null;

  const scopeLabel = useMemo(() => {
    if (scope.mode === "all") return "All agencies (merged)";
    return scope.agencyName;
  }, [scope]);

  const agencyNames = useMemo(
    () => Array.from(listingsByAgency.keys()).sort((a, b) => a.localeCompare(b)),
    [listingsByAgency],
  );

  const contextSubtitle = `${listings.length.toLocaleString()} listings · ${scopeLabel}`;

  const copyWorkspaceDigest = useCallback(async () => {
    const md = buildWorkspaceDigestMarkdown({
      scopeLabel,
      listingsCount: listings.length,
      agenciesInWorkspace: listingsByAgency.size,
      versionsCount: allVersions.length,
      mappingConfig,
      importTime,
      liveVersionSummary: selectedLiveVersion
        ? `${selectedSource?.name ?? "Source"} · v${selectedLiveVersion.number} · ${selectedLiveVersion.fileName} · ${selectedLiveVersion.listingCount} rows`
        : null,
    });
    try {
      await navigator.clipboard.writeText(md);
      toast.success("Workspace digest copied", {
        description: "Paste into Slack, Linear, or email when reporting feed issues.",
      });
    } catch {
      toast.error("Could not copy to clipboard");
    }
  }, [
    scopeLabel,
    listings.length,
    listingsByAgency.size,
    allVersions.length,
    mappingConfig,
    importTime,
    selectedSource,
    selectedLiveVersion,
  ]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppHeader />
      <main className="flex-1 container max-w-[min(100%,96rem)] py-6 px-4 sm:px-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="space-y-2 max-w-3xl">
            <h1 className="text-2xl sm:text-3xl font-bold font-heading tracking-tight flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/12 ring-1 ring-primary/20">
                <PieChart className="w-6 h-6 text-primary-text" aria-hidden />
              </span>
              Workspace insights
            </h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Charts and coverage for your current listings scope, plus a playbook of links for sources, validation, compare,
              and dedupe workflows.
            </p>
          </div>
          <div className="flex flex-col gap-2 min-w-[14rem]">
            <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Listings scope</Label>
            <Select
              value={
                scope.mode === "all" ? "all" : `agency:${scope.agencyName}`
              }
              onValueChange={(v) => {
                if (v === "all") setScope({ mode: "all" });
                else if (v.startsWith("agency:")) setScope({ mode: "agency", agencyName: v.slice(7) });
              }}
            >
              <SelectTrigger className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All agencies (merged)</SelectItem>
                {agencyNames.map((name) => (
                  <SelectItem key={name} value={`agency:${name}`}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-muted/25 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <WorkflowCompareLinks heading="Compare & analysis" className="text-xs" />
          <Badge variant="secondary" className="shrink-0 font-mono text-[11px] w-fit">
            {contextSubtitle}
          </Badge>
        </div>

        <Card className="border-dashed bg-muted/15 overflow-hidden">
          <CardHeader className="pb-2 sm:flex-row sm:items-center sm:justify-between gap-4 space-y-0">
            <div className="space-y-1 min-w-0">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary-text shrink-0" aria-hidden />
                Handoff digest
              </CardTitle>
              <CardDescription className="text-xs leading-relaxed max-w-prose">
                One-click Markdown snapshot: scope, counts, mapping fingerprint, and active session — for incidents and QA
                threads without another screenshot.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="shrink-0 gap-2"
              onClick={() => void copyWorkspaceDigest()}
            >
              <FileText className="w-3.5 h-3.5" aria-hidden />
              Copy digest
            </Button>
          </CardHeader>
        </Card>

        <section aria-labelledby="insights-shortcuts-heading">
          <h2 id="insights-shortcuts-heading" className="sr-only">
            Quick navigation
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
            {SHORTCUTS.map((s) => (
              <Link
                key={s.to}
                to={s.to}
                className={cn(
                  "group rounded-xl border border-border bg-card p-4 shadow-sm transition-all",
                  "hover:border-primary/45 hover:bg-accent/40 hover:shadow-md",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                )}
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary-text ring-1 ring-primary/15">
                    <s.icon className="w-5 h-5" aria-hidden />
                  </span>
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-semibold text-foreground group-hover:text-primary-text transition-colors">{s.title}</p>
                    <p className="text-[11px] text-muted-foreground leading-snug">{s.description}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <Tabs defaultValue="charts" className="w-full space-y-6">
          <TabsList className="flex flex-wrap h-auto w-full justify-start gap-1 p-1 bg-muted/40">
            <TabsTrigger value="charts" className="gap-2 data-[state=active]:bg-background">
              <BarChart3 className="w-4 h-4 shrink-0" aria-hidden />
              Charts & KPIs
            </TabsTrigger>
            <TabsTrigger value="playbook" className="gap-2 data-[state=active]:bg-background">
              <Gauge className="w-4 h-4 shrink-0" aria-hidden />
              Playbook & workflows
            </TabsTrigger>
            <TabsTrigger value="sessions" className="gap-2 data-[state=active]:bg-background">
              <Layers className="w-4 h-4 shrink-0" aria-hidden />
              Recent versions
            </TabsTrigger>
          </TabsList>

          <TabsContent value="charts" className="space-y-4 mt-2 outline-none focus-visible:outline-none">
            <ListingAnalyticsDashboard
              listings={listings}
              contextTitle="Workspace"
              contextSubtitle={contextSubtitle}
              sectionLabels={{
                overview: "Overview",
                market: "Market",
                inventory: "Inventory",
                quality: "Coverage",
              }}
            />
          </TabsContent>

          <TabsContent value="playbook" className="mt-2 outline-none focus-visible:outline-none">
            <WorkspacePlaybook />
          </TabsContent>

          <TabsContent value="sessions" className="mt-2 outline-none focus-visible:outline-none">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <GitCompare className="w-4 h-4 text-muted-foreground" aria-hidden />
                  Feed versions
                </CardTitle>
                <CardDescription>
                  Latest uploaded versions across all sources.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {allVersions.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded-lg">
                    No feeds yet.
                  </p>
                ) : (
                  <ul className="divide-y divide-border rounded-lg border border-border max-h-[min(50vh,360px)] overflow-auto">
                    {[...allVersions]
                      .sort((a, b) => b.version.createdAt.localeCompare(a.version.createdAt))
                      .slice(0, 25)
                      .map(({ source, version }) => (
                        <li key={version.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted/40">
                          <span className="font-medium text-foreground truncate min-w-0 flex-1">
                            {source.name} · v{version.number} · {version.fileName}
                          </span>
                          <span className="text-[11px] text-muted-foreground tabular-nums">{version.listingCount} rows</span>
                          <Link to={`/sources?source=${source.id}`} className="text-xs text-primary-text hover:underline shrink-0">
                            Manage
                          </Link>
                        </li>
                      ))}
                  </ul>
                )}
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" asChild>
                    <Link to="/sources">
                      <LayoutGrid className="w-3.5 h-3.5" aria-hidden />
                      Go to Sources
                    </Link>
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 text-xs" asChild>
                    <Link to="/feed-compare">Feed compare</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
