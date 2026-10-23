import AppHeader from "@/components/AppHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/AuthProvider";
import {
  Columns2,
  Download,
  GitCompare,
  Keyboard,
  ListTree,
  PieChart,
  RefreshCw,
  Table2,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";

const EXPORT_HUB_TAB_KEY = "feedview.exportHub.tab";

type HubTabId = "data" | "compare" | "sync";

function readStoredHubTab(): HubTabId | null {
  try {
    const raw = sessionStorage.getItem(EXPORT_HUB_TAB_KEY);
    if (raw === "data" || raw === "compare" || raw === "sync") return raw;
  } catch {
    /* ignore */
  }
  return null;
}

type ExportCard = {
  title: string;
  description: string;
  to: string;
  icon: typeof Table2;
  requiresAuth?: boolean;
  tab: HubTabId;
};

const CARDS: ExportCard[] = [
  {
    tab: "data",
    title: "Listing database (CSV)",
    description:
      "From the listing table, export the current result set as CSV — useful for spreadsheets, QA, and handoffs.",
    to: "/database",
    icon: Table2,
    requiresAuth: true,
  },
  {
    tab: "compare",
    title: "Compare two imports",
    description: "Diff two feed snapshots with fuzzy matching, thumbnails, and hash-focused tabs.",
    to: "/feed-compare",
    icon: GitCompare,
    requiresAuth: true,
  },
  {
    tab: "compare",
    title: "Compare tray (listings)",
    description: "Pick listings from grids and compare selected units side by side.",
    to: "/compare",
    icon: Columns2,
    requiresAuth: true,
  },
  {
    tab: "sync",
    title: "Version reports",
    description:
      "Per version: feed checks, quality issues, added/removed/changed listings, field completeness, market insights, and agents JSON (ZibaAi format).",
    to: "/sources?tab=versions",
    icon: RefreshCw,
    requiresAuth: true,
  },
];

export default function ExportHubPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<HubTabId>(() => readStoredHubTab() ?? "data");

  const persistTab = useCallback((v: string) => {
    const next = v as HubTabId;
    setTab(next);
    try {
      sessionStorage.setItem(EXPORT_HUB_TAB_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const cardsByTab = useMemo(() => {
    const m: Record<HubTabId, ExportCard[]> = { data: [], compare: [], sync: [] };
    for (const c of CARDS) m[c.tab].push(c);
    return m;
  }, []);

  const renderCards = (list: ExportCard[]) => (
    <ul className="grid gap-4 sm:grid-cols-2">
      {list.map((c) => {
        const Icon = c.icon;
        const locked = c.requiresAuth && !user;
        return (
          <li key={c.to}>
            <Card
              className={cn(
                "h-full transition-colors",
                locked ? "opacity-75 border-dashed" : "hover:border-primary/25 hover:bg-accent/30",
              )}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted ring-1 ring-border">
                    <Icon className="h-5 w-5 text-primary-text" aria-hidden />
                  </span>
                  <div className="min-w-0 space-y-1">
                    <CardTitle className="text-base leading-snug">{c.title}</CardTitle>
                    <CardDescription className="text-xs leading-relaxed">{c.description}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {locked ? (
                  <span className="text-xs text-muted-foreground">Available after sign-in.</span>
                ) : (
                  <Link
                    to={c.to}
                    className="text-sm font-medium text-primary-text underline underline-offset-2 hover:text-primary-text/90"
                  >
                    Open → <code className="text-[11px] font-mono text-muted-foreground">{c.to}</code>
                  </Link>
                )}
              </CardContent>
            </Card>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppHeader />
      <main className="flex-1 container max-w-[min(100%,56rem)] py-8 px-4 sm:px-6 space-y-8 pb-16">
        <header className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-bold font-heading tracking-tight flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/12 ring-1 ring-primary/20">
              <Download className="w-6 h-6 text-primary-text" aria-hidden />
            </span>
            Export hub
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed max-w-prose">
            Grouped by intent: tabular exports, compare tools, and account sync. Your last tab is remembered for this browser
            session.
          </p>
        </header>

        {!user ? (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Sign in to export</CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                Export paths below require an authenticated workspace. You can still browse{" "}
                <Link to="/sitemap" className="text-primary-text underline underline-offset-2">
                  the site map
                </Link>{" "}
                or{" "}
                <Link to="/shortcuts" className="text-primary-text underline underline-offset-2">
                  keyboard shortcuts
                </Link>
                .
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Link
                to="/login"
                className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Sign in
              </Link>
              <Link
                to="/signup"
                className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-accent/50"
              >
                Create account
              </Link>
            </CardContent>
          </Card>
        ) : null}

        <Tabs value={tab} onValueChange={persistTab} className="w-full space-y-6">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/40 p-1 sm:inline-flex sm:w-auto">
            <TabsTrigger value="data" className="gap-2 rounded-lg">
              <Table2 className="w-4 h-4 shrink-0 opacity-70" aria-hidden />
              Data out
            </TabsTrigger>
            <TabsTrigger value="compare" className="gap-2 rounded-lg">
              <GitCompare className="w-4 h-4 shrink-0 opacity-70" aria-hidden />
              Compare
            </TabsTrigger>
            <TabsTrigger value="sync" className="gap-2 rounded-lg">
              <RefreshCw className="w-4 h-4 shrink-0 opacity-70" aria-hidden />
              Reports
            </TabsTrigger>
          </TabsList>

          <TabsContent value="data" className="mt-0 outline-none focus-visible:outline-none">
            <p className="text-xs text-muted-foreground mb-4 max-w-prose">
              Spreadsheet-friendly exports from the dense listing database — respects filters you set on that page.
            </p>
            {renderCards(cardsByTab.data)}
          </TabsContent>

          <TabsContent value="compare" className="mt-0 outline-none focus-visible:outline-none">
            <p className="text-xs text-muted-foreground mb-4 max-w-prose">
              Revision checks and shortlist matrices — combine with Feed compare when validating supplier updates.
            </p>
            {renderCards(cardsByTab.compare)}
          </TabsContent>

          <TabsContent value="sync" className="mt-0 outline-none focus-visible:outline-none">
            <p className="text-xs text-muted-foreground mb-4 max-w-prose">
              Server-backed workspace state for backups and continuity across devices.
            </p>
            {renderCards(cardsByTab.sync)}
          </TabsContent>
        </Tabs>

        <Card className="border-dashed bg-muted/15">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <PieChart className="w-5 h-5 text-primary-text shrink-0" aria-hidden />
              Connect the workflow
            </CardTitle>
            <CardDescription className="text-xs leading-relaxed">
              Exports fit between validation and stakeholder handoff — use insights for scope-aware KPIs and the site map when
              you need the full route index.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3 text-sm pb-6">
            <Link
              to="/workspace-insights"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-sm hover:bg-accent/50 hover:border-primary/25"
            >
              <PieChart className="w-4 h-4 text-muted-foreground" aria-hidden />
              Workspace insights
            </Link>
            <Link
              to="/sitemap"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-sm hover:bg-accent/50 hover:border-primary/25"
            >
              <ListTree className="w-4 h-4 text-muted-foreground" aria-hidden />
              Site map
            </Link>
            <Link
              to="/shortcuts"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-sm hover:bg-accent/50 hover:border-primary/25"
            >
              <Keyboard className="w-4 h-4 text-muted-foreground" aria-hidden />
              Keyboard shortcuts
            </Link>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
