import { cn } from "@/lib/utils";
import { liveVersionOf, type SourceDTO } from "@/lib/sourcesApi";
import { sourceHealth, type SourceHealth } from "@/lib/versionStats";

export function healthOf(source: SourceDTO): SourceHealth {
  const live = liveVersionOf(source);
  return sourceHealth({
    hasLive: !!live,
    newestIsLive: !source.versions[0] || source.versions[0].id === live?.id,
    liveScore: live?.stats?.score ?? null,
    liveErrors: live?.warnings?.errors.length ?? 0,
  });
}

const HEALTH_STYLE: Record<SourceHealth, { dot: string; label: string }> = {
  healthy: { dot: "bg-success", label: "Healthy" },
  attention: { dot: "bg-warning", label: "Needs attention" },
  error: { dot: "bg-destructive", label: "No live version" },
};

export function HealthDot({ health, withLabel }: { health: SourceHealth; withLabel?: boolean }) {
  const s = HEALTH_STYLE[health];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", s.dot)} aria-hidden />
      {withLabel ? s.label : <span className="sr-only">{s.label}</span>}
    </span>
  );
}

/** Explains why a source is not healthy, in order of importance. */
export function healthReasons(source: SourceDTO): string[] {
  const live = liveVersionOf(source);
  if (!live) return ["No version is live — apply one so its listings appear on the site."];
  const out: string[] = [];
  if (source.versions[0] && source.versions[0].id !== live.id) {
    out.push(`v${source.versions[0].number} is newer than the live v${live.number} and is waiting to be applied.`);
  }
  const errors = live.warnings?.errors.length ?? 0;
  if (errors) out.push(`The live version has ${errors} parser error${errors === 1 ? "" : "s"}.`);
  if ((live.stats?.score ?? 100) < 60) out.push(`Listing quality is low (${live.stats?.score}/100).`);
  return out;
}

export function ScoreBadge({ score }: { score: number | null | undefined }) {
  if (score == null) return <span className="text-xs text-muted-foreground">—</span>;
  const tone = score >= 80 ? "text-success" : score >= 60 ? "text-warning" : "text-destructive-text";
  return <span className={cn("font-mono text-sm font-semibold tabular-nums", tone)}>{score}</span>;
}
