import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  ArrowRightLeft,
  Building2,
  ChevronDown,
  ClipboardCheck,
  Database,
  Gauge,
  Keyboard,
  Link2,
  ListTree,
  Download,
  ScanSearch,
  Upload,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";

type Step = {
  title: string;
  description: string;
  to: string;
  cta: string;
};

type Section = {
  id: string;
  title: string;
  hint: string;
  icon: LucideIcon;
  steps: Step[];
};

const PLAYBOOK_SECTIONS: Section[] = [
  {
    id: "ingest",
    title: "Feeds & ingestion",
    hint: "Upload agency feeds and control which version is live.",
    icon: Upload,
    steps: [
      {
        title: "Upload feed versions",
        description: "Drop agency XML files; each upload becomes a version you can apply, compare or roll back.",
        to: "/sources",
        cta: "Open sources",
      },
      {
        title: "Compare versions",
        description: "See which listings were added, removed or changed between two uploads.",
        to: "/feed-compare",
        cta: "Compare",
      },
    ],
  },
  {
    id: "quality",
    title: "Quality & mapping",
    hint: "Catch schema issues before they reach buyers.",
    icon: ClipboardCheck,
    steps: [
      {
        title: "Validation",
        description: "Conflicts, missing required mappings, and session-level warnings.",
        to: "/validation",
        cta: "Open validation",
      },
      {
        title: "Field mapping",
        description: "Adjust XPath mapping when node names change between supplier versions.",
        to: "/field-mapping",
        cta: "Edit mapping",
      },
      {
        title: "Field coverage (EDA)",
        description: "Explore which XML paths populate which listing fields.",
        to: "/field-quality",
        cta: "Field coverage",
      },
      {
        title: "Mapping & XML QA",
        description: "Checklist, path audit, and per-listing flags before you trust the feed.",
        to: "/mapping-qa",
        cta: "Open QA",
      },
      {
        title: "Dense listing table",
        description: "Sortable grid with import diff and CSV export for spreadsheets.",
        to: "/database",
        cta: "Listing table",
      },
    ],
  },
  {
    id: "compare",
    title: "Compare & dedupe",
    hint: "Diff feeds and find duplicate identities across suppliers.",
    icon: ArrowRightLeft,
    steps: [
      {
        title: "Compare two imports",
        description: "Listing-level diff between feeds A and B — ideal for revision checks.",
        to: "/feed-compare",
        cta: "Feed compare",
      },
      {
        title: "Cross-agency duplicates",
        description: "Fuzzy clustering when the same home is listed under multiple agencies.",
        to: "/cross-agency-dupes",
        cta: "Cross-agency dupes",
      },
      {
        title: "Side-by-side listings",
        description: "Pick 2–4 listings for a compact field matrix (grid compare tray).",
        to: "/compare",
        cta: "Listing compare",
      },
    ],
  },
  {
    id: "explore",
    title: "Explore & directories",
    hint: "Navigate brands, people, and geography.",
    icon: Building2,
    steps: [
      {
        title: "Agencies & agents",
        description: "Browse agency volumes and drill into listing sets per agent.",
        to: "/agencies",
        cta: "Agencies",
      },
      {
        title: "Listing map",
        description: "Geo scatter of pins from coordinates in your feed.",
        to: "/listings/map",
        cta: "Open map",
      },
    ],
  },
  {
    id: "discover",
    title: "Discover & export",
    hint: "Ship data out, learn every route, and keep workspace state in sync.",
    icon: ListTree,
    steps: [
      {
        title: "Export hub",
        description: "Jump to CSV export, feed compare, listing compare, and workspace sync on Account.",
        to: "/export-hub",
        cta: "Export hub",
      },
      {
        title: "HTML site map",
        description: "Same structure as the More menu — plus redirects and dynamic URL patterns.",
        to: "/sitemap",
        cta: "Site map",
      },
      {
        title: "Keyboard shortcuts",
        description: "Palette keys and shell tips — complements Ctrl/⌘+K discovery.",
        to: "/shortcuts",
        cta: "Shortcuts",
      },
      {
        title: "Workspace insights",
        description: "Scope-aware analytics and the operational playbook in one screen.",
        to: "/workspace-insights",
        cta: "Insights",
      },
    ],
  },
];

export function WorkspacePlaybook({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-4", className)}>
      <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary-text ring-1 ring-primary/20">
            <Gauge className="w-5 h-5" aria-hidden />
          </div>
          <div className="space-y-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">Operational playbook</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Ordered shortcuts for typical agency workflows — expand a section and jump straight into the screen you need.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {PLAYBOOK_SECTIONS.map((section) => (
          <Collapsible key={section.id} defaultOpen={section.id === "ingest"} className="rounded-xl border border-border bg-card shadow-sm">
            <CollapsibleTrigger className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 rounded-t-xl">
              <section.icon className="w-5 h-5 shrink-0 text-primary-text" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{section.title}</p>
                <p className="text-[11px] text-muted-foreground">{section.hint}</p>
              </div>
              <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground transition-transform data-[state=open]:rotate-180" aria-hidden />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="border-t border-border divide-y divide-border">
                {section.steps.map((step) => (
                  <li key={step.to} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-sm font-medium text-foreground">{step.title}</p>
                      <p className="text-xs text-muted-foreground leading-snug">{step.description}</p>
                    </div>
                    <Button variant="outline" size="sm" className="shrink-0 h-8 text-xs gap-1.5" asChild>
                      <Link to={step.to}>
                        {step.cta}
                        <span className="sr-only"> — {step.title}</span>
                      </Link>
                    </Button>
                  </li>
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        ))}
      </div>

      <Card className="border-dashed bg-muted/15">
        <CardHeader className="py-3 pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ScanSearch className="w-4 h-4 text-muted-foreground" aria-hidden />
            Quick diagnostic strip
          </CardTitle>
          <CardDescription className="text-xs">
            Pair analytics here with targeted tools — counts above reflect your current listings scope.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 pb-4">
          {[
            { to: "/database", label: "Table + Δ", icon: Database },
            { to: "/feed-compare", label: "Feed diff", icon: ArrowRightLeft },
            { to: "/cross-agency-dupes", label: "Dupes", icon: Link2 },
            { to: "/validation", label: "Validation", icon: ClipboardCheck },
            { to: "/sources", label: "Sources", icon: Upload },
            { to: "/export-hub", label: "Export hub", icon: Download },
            { to: "/shortcuts", label: "Shortcuts", icon: Keyboard },
          ].map((x) => (
            <Button key={x.to} variant="secondary" size="sm" className="h-8 text-xs gap-1.5 rounded-full" asChild>
              <Link to={x.to}>
                <x.icon className="w-3.5 h-3.5 opacity-80" aria-hidden />
                {x.label}
              </Link>
            </Button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

/** Compact strip for embedding on home or account pages */
export function WorkspacePlaybookStrip() {
  return (
    <div className="flex flex-wrap gap-2 items-center text-xs text-muted-foreground">
      <Badge variant="outline" className="font-normal gap-1">
        <Gauge className="w-3 h-3" aria-hidden />
        Playbook
      </Badge>
      <Link to="/workspace-insights" className="text-primary-text hover:underline font-medium">
        Open workspace insights
      </Link>
      <span className="opacity-40">·</span>
      <Link to="/feed-compare" className="hover:text-foreground">
        Feed compare
      </Link>
      <span className="opacity-40">·</span>
      <Link to="/cross-agency-dupes" className="hover:text-foreground">
        Cross-agency dupes
      </Link>
      <span className="opacity-40">·</span>
      <Link to="/export-hub" className="hover:text-foreground">
        Export hub
      </Link>
      <span className="opacity-40">·</span>
      <Link to="/shortcuts" className="hover:text-foreground">
        Shortcuts
      </Link>
      <span className="opacity-40">·</span>
      <Link to="/sitemap" className="hover:text-foreground">
        Site map
      </Link>
    </div>
  );
}
