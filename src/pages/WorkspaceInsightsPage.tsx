import AppHeader from "@/components/AppHeader";
import ListingAnalyticsDashboard from "@/components/analytics/ListingAnalyticsDashboard";
import { WorkspacePlaybook } from "@/components/WorkspacePlaybook";
import { SourceComparisonTable } from "@/components/SourceComparisonTable";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { buildWorkspaceDigestMarkdown } from "@/lib/workspaceDigest";
import { useAppData } from "@/providers/DataProvider";
import { BarChart3, FileText, Gauge, GitCompare, Layers, LayoutGrid, PieChart } from "lucide-react";
import { useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { toast } from "@/components/ui/sonner";

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
    if (scope.mode === "all") return "All sources";
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
      toast.success("Summary copied", { description: "Paste it into a chat, email or ticket." });
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
              Insights
            </h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              How the live listings compare across sources, plus market, inventory and coverage charts for the scope you pick.
            </p>
          </div>
          <div className="flex flex-col gap-2 min-w-[14rem]">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Charts scope</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs"
                onClick={() => void copyWorkspaceDigest()}
                title="Copy a Markdown summary of this scope for a chat or ticket"
              >
                <FileText className="h-3.5 w-3.5" aria-hidden /> Copy summary
              </Button>
            </div>
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
                <SelectItem value="all">All sources</SelectItem>
                {agencyNames.map((name) => (
                  <SelectItem key={name} value={`agency:${name}`}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <SourceComparisonTable sources={sources} />

        <Tabs defaultValue="charts" className="w-full space-y-6">
          <TabsList className="flex flex-wrap h-auto w-full justify-start gap-1 p-1 bg-muted/40">
            <TabsTrigger value="charts" className="gap-2 data-[state=active]:bg-background">
              <BarChart3 className="w-4 h-4 shrink-0" aria-hidden />
              Charts & KPIs
            </TabsTrigger>
            <TabsTrigger value="playbook" className="gap-2 data-[state=active]:bg-background">
              <Gauge className="w-4 h-4 shrink-0" aria-hidden />
              Workflows
            </TabsTrigger>
            <TabsTrigger value="sessions" className="gap-2 data-[state=active]:bg-background">
              <Layers className="w-4 h-4 shrink-0" aria-hidden />
              Recent versions
            </TabsTrigger>
          </TabsList>

          <TabsContent value="charts" className="space-y-4 mt-2 outline-none focus-visible:outline-none">
            <ListingAnalyticsDashboard
              listings={listings}
              contextTitle="Live listings"
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
