import { useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BarChart3, GitCompare, Sparkles, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/components/sources/format";
import { importForecast } from "@/lib/feedValidation";
import type { SourceDTO } from "@/lib/sourcesApi";
import type { Listing } from "@/lib/types";

const greeting = (h = new Date().getHours()) => (h < 5 ? "Working late" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening");

/** Decorative skyline: building heights echo the bar charts below. Pure SVG, inherits the theme. */
function Skyline() {
  const heights = [46, 70, 38, 92, 58, 120, 76, 50, 104, 64, 84, 42, 98, 56, 72];
  return (
    <svg
      aria-hidden
      viewBox="0 0 330 140"
      preserveAspectRatio="xMaxYMax meet"
      className="pointer-events-none absolute bottom-0 right-0 h-full w-[55%] max-w-xl text-primary opacity-[0.18] dark:opacity-25"
    >
      {heights.map((h, i) => (
        <g key={i}>
          <rect x={i * 22} y={140 - h} width={18} height={h} rx={3} fill="currentColor" />
          {Array.from({ length: Math.floor(h / 16) }, (_, w) => (
            <rect key={w} x={i * 22 + 5} y={140 - h + 8 + w * 16} width={8} height={5} rx={1} className="fill-background" opacity={0.5} />
          ))}
        </g>
      ))}
    </svg>
  );
}

function Chip({ children, to }: { children: ReactNode; to?: string }) {
  const cls =
    "inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-background/60 px-3 py-1 text-xs text-foreground backdrop-blur transition-colors";
  return to ? (
    <Link to={to} className={`${cls} hover:border-primary/60`}>
      {children}
    </Link>
  ) : (
    <span className={cls}>{children}</span>
  );
}

/** Welcome banner for the signed-in home: greeting, one-line state of the workspace, highlights and shortcuts. */
export function DashboardHero({
  username,
  sources,
  listings,
  canEdit,
  onUpload,
}: {
  username?: string;
  sources: SourceDTO[];
  listings: Listing[];
  canEdit: boolean;
  onUpload: () => void;
}) {
  const facts = useMemo(() => {
    const newest = sources
      .flatMap((s) => s.versions.map((v) => ({ s, v })))
      .sort((a, b) => b.v.createdAt.localeCompare(a.v.createdAt))[0];
    const biggest = [...sources].sort(
      (a, b) =>
        (b.versions.find((v) => v.id === b.activeVersionId)?.listingCount ?? 0) -
        (a.versions.find((v) => v.id === a.activeVersionId)?.listingCount ?? 0),
    )[0];
    const forecast = listings.length ? importForecast(listings) : null;
    return { newest, biggest, forecast };
  }, [sources, listings]);

  const pct = facts.forecast && listings.length ? Math.round((facts.forecast.publishable / listings.length) * 100) : null;

  return (
    <section
      aria-label="Welcome"
      className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/15 via-card to-card p-6 sm:p-8"
    >
      <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
      <Skyline />
      <div className="relative max-w-2xl space-y-4">
        <p className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-primary-text">
          <Sparkles className="h-3.5 w-3.5" aria-hidden /> {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
        </p>
        <h1 className="font-heading text-3xl font-extrabold tracking-tight sm:text-4xl">
          {greeting()}, {username}
        </h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          {listings.length.toLocaleString()} live listings across {sources.length} source{sources.length === 1 ? "" : "s"}
          {facts.newest ? `, last upload ${timeAgo(facts.newest.v.createdAt)}.` : "."}
        </p>
        <div className="flex flex-wrap gap-2">
          {facts.biggest && (
            <Chip to={`/sources?source=${facts.biggest.id}`}>
              Largest feed <strong className="font-semibold">{facts.biggest.name}</strong>
            </Chip>
          )}
          {facts.newest && (
            <Chip to={`/sources?source=${facts.newest.s.id}&tab=versions`}>
              Newest <strong className="font-semibold">{facts.newest.s.name} v{facts.newest.v.number}</strong>
            </Chip>
          )}
          {pct != null && (
            <Chip>
              Expected on Ziba <strong className="font-mono font-semibold">{pct}%</strong>
            </Chip>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {canEdit && (
            <Button onClick={onUpload}>
              <Upload className="mr-1.5 h-4 w-4" /> Upload feeds
            </Button>
          )}
          <Button asChild variant="outline" className="bg-background/60">
            <Link to="/workspace-insights">
              <BarChart3 className="mr-1.5 h-4 w-4" /> Insights
            </Link>
          </Button>
          <Button asChild variant="outline" className="bg-background/60">
            <Link to="/feed-compare">
              <GitCompare className="mr-1.5 h-4 w-4" /> Compare versions
            </Link>
          </Button>
          <Button asChild variant="ghost">
            <Link to="/listings">
              Browse listings <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
