import { cn } from "@/lib/utils";
import { SIGNAL_LABEL, type Evidence, type Verdict } from "@/lib/propertyMatch";
import { Check, HelpCircle, X } from "lucide-react";

const VERDICT_LABEL: Record<Verdict, string> = {
  match: "Same property",
  possible: "Possibly the same",
  different: "Different properties",
};

/** Verdict pill: confirmed matches read green, review cases amber; never colour alone (icon + text). */
export function VerdictBadge({ verdict, className }: { verdict: Verdict; className?: string }) {
  const Icon = verdict === "match" ? Check : verdict === "possible" ? HelpCircle : X;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
        verdict === "match" && "bg-success/10 text-success ring-success/25",
        verdict === "possible" && "bg-warning/10 text-warning ring-warning/25",
        verdict === "different" && "bg-muted text-muted-foreground ring-border",
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {VERDICT_LABEL[verdict]}
    </span>
  );
}

/**
 * Why two listings were (or were not) matched: each signal with its direction and strength.
 * Supporting evidence first, then contradictions; weak signals are folded into a count.
 */
export function EvidenceList({ evidence, limit = 6, compact = false }: { evidence: Evidence[]; limit?: number; compact?: boolean }) {
  const pro = evidence.filter((e) => e.weight > 0);
  const con = evidence.filter((e) => e.weight < 0);
  const shown = [...pro.slice(0, limit), ...con.slice(0, Math.max(2, limit - pro.length))];
  const hidden = evidence.length - shown.length;
  return (
    <ul className={cn("flex flex-wrap gap-1.5", compact && "gap-1")} aria-label="Match evidence">
      {shown.map((e, i) => (
        <li
          key={`${e.signal}-${i}`}
          title={`${SIGNAL_LABEL[e.signal]}: ${e.weight > 0 ? "+" : ""}${e.weight}`}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] ring-1 ring-inset",
            e.weight > 0 ? "bg-success/[0.07] text-foreground ring-success/20" : "bg-destructive/[0.06] text-foreground ring-destructive/20",
          )}
        >
          {e.weight > 0 ? (
            <Check className="h-3 w-3 shrink-0 text-success" aria-label="supports" />
          ) : (
            <X className="h-3 w-3 shrink-0 text-destructive-text" aria-label="contradicts" />
          )}
          {e.label}
        </li>
      ))}
      {hidden > 0 && <li className="px-1 text-[11px] text-muted-foreground">+{hidden} weaker</li>}
    </ul>
  );
}

/** Match strength as a short meter against the confirmed-match threshold. */
export function ScoreMeter({ score, threshold }: { score: number; threshold: number }) {
  const pct = Math.max(0, Math.min(100, (score / (threshold * 1.6)) * 100));
  const mark = (threshold / (threshold * 1.6)) * 100;
  return (
    <div className="flex items-center gap-2" title={`Match score ${score} (same property from ${threshold})`}>
      <div className="relative h-1.5 w-20 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className={cn("h-full rounded-full", score >= threshold ? "bg-success" : "bg-warning")} style={{ width: `${pct}%` }} />
        <div className="absolute inset-y-0 w-px bg-foreground/40" style={{ left: `${mark}%` }} />
      </div>
      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{score}</span>
    </div>
  );
}
