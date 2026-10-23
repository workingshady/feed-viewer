import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, Info, XCircle } from "lucide-react";
import { ChartCard } from "@/components/charts/ChartKit";
import { checkFeed, type Severity } from "@/lib/feedValidation";
import type { SourceDTO } from "@/lib/sourcesApi";
import type { Listing } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Problems that repeatedly blocked or surprised Ziba imports in QA: listings dropped at import,
 * images that stop working, agents merged into one profile, feeds too small or too old.
 */
const WATCH = new Set([
  "poa_not_published",
  "expiring_image_urls",
  "inline_images",
  "no_photos",
  "small_feed",
  "mixed_currency",
  "agents_share_email",
  "agent_concentration",
  "stale_listing",
  "size_outlier",
  "generic_type_code",
  "svg_agent_photo",
  "duplicate_reference",
]);

const ICON: Record<Severity, { icon: typeof Info; cls: string; label: string }> = {
  error: { icon: XCircle, cls: "text-destructive-text", label: "Error" },
  warning: { icon: AlertTriangle, cls: "text-warning", label: "Warning" },
  info: { icon: Info, cls: "text-muted-foreground", label: "Note" },
};

/** Per source: expected listings on Ziba, what holds the rest back, and the flags worth a look before import. */
export function ImportReadiness({ sources, listings }: { sources: SourceDTO[]; listings: Listing[] }) {
  const rows = useMemo(() => {
    const bySource = new Map<string, Listing[]>();
    for (const l of listings) {
      const k = l.sourceAgency ?? "";
      if (!bySource.has(k)) bySource.set(k, []);
      bySource.get(k)!.push(l);
    }
    return sources
      .filter((s) => bySource.has(s.name))
      .map((s) => {
        const ls = bySource.get(s.name)!;
        const r = checkFeed(ls);
        const flags = r.issues.filter((i) => WATCH.has(i.code));
        return { source: s, total: ls.length, forecast: r.forecast!, flags };
      })
      .sort((a, b) => a.forecast.publishable / a.total - b.forecast.publishable / b.total);
  }, [sources, listings]);

  const [showAll, setShowAll] = useState(false);
  if (!rows.length) return null;
  // Lowest expected share first; long workspaces show the 8 that need the most attention.
  const visible = showAll ? rows : rows.slice(0, 8);

  return (
    <ChartCard
      title="Import readiness"
      description="Estimated listings that publish on Ziba from each live feed, and the issues that usually cause surprises at import."
      table={{
        columns: ["Source", "Listings", "Expected on Ziba", "Held back", "Flags"],
        rows: rows.map((r) => [
          r.source.name,
          r.total,
          r.forecast.publishable,
          r.forecast.dropped.map((d) => `${d.reason} ${d.count}`).join(" | "),
          r.flags.map((f) => `${f.title} (${f.count})`).join(" | "),
        ]),
      }}
    >
      <ul className="divide-y rounded-md border">
        {visible.map(({ source, total, forecast, flags }) => {
          const pct = total ? Math.round((forecast.publishable / total) * 100) : 0;
          return (
            <li key={source.id} className="grid gap-3 p-3 md:grid-cols-[minmax(0,14rem)_minmax(0,16rem)_1fr_auto] md:items-center">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{source.name}</div>
                <div className="text-xs text-muted-foreground">{total.toLocaleString()} live listings</div>
              </div>
              <div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Expected on Ziba</span>
                  <span className="font-mono tabular-nums">
                    {forecast.publishable.toLocaleString()} · {pct}%
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <div className="h-full rounded-full bg-[var(--series-1)]" style={{ width: `${pct}%` }} />
                </div>
                {forecast.dropped.length > 0 && (
                  <div className="mt-1 truncate text-[11px] text-muted-foreground">
                    Held back: {forecast.dropped.map((d) => `${d.reason.toLowerCase()} ${d.count.toLocaleString()}`).join(" · ")}
                  </div>
                )}
              </div>
              <ul className="flex min-w-0 flex-wrap gap-1.5">
                {flags.length === 0 ? (
                  <li className="text-xs text-muted-foreground">No import flags</li>
                ) : (
                  flags.slice(0, 5).map((f) => {
                    const S = ICON[f.severity];
                    return (
                      <li
                        key={f.code}
                        className="inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-0.5 text-xs"
                        title={f.hint}
                      >
                        <S.icon className={cn("h-3.5 w-3.5 shrink-0", S.cls)} aria-label={S.label} />
                        <span className="truncate">{f.title}</span>
                      </li>
                    );
                  })
                )}
                {flags.length > 5 && <li className="text-xs text-muted-foreground">+{flags.length - 5} more</li>}
              </ul>
              <Link
                to={`/sources?source=${source.id}&tab=issues`}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary-text hover:underline"
              >
                Details <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </li>
          );
        })}
      </ul>
      {rows.length > 8 && (
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show fewer" : `Show all ${rows.length} sources`}
        </Button>
      )}
    </ChartCard>
  );
}
