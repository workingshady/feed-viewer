import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { UnifiedDiffLine } from "@/lib/textLineDiff";
import { GitBranch } from "lucide-react";

export type { UnifiedDiffLine };

type Props = {
  label: string;
  lines: UnifiedDiffLine[];
  /** Tailwind max-height class for the scroll region. */
  maxHeightClass?: string;
  truncated?: boolean;
  fallback?: boolean;
};

/**
 * Renders a unified line diff (− removed, + added, space = context) like GitHub / git diff.
 */
export function GitStyleDiffBlock({
  label,
  lines,
  maxHeightClass = "max-h-[min(52vh,420px)]",
  truncated,
  fallback,
}: Props) {
  if (!lines.length) return null;
  const adds = lines.filter((l) => l.sign === "+").length;
  const dels = lines.filter((l) => l.sign === "-").length;
  return (
    <div className="rounded-xl border border-border/80 bg-card shadow-sm overflow-hidden ring-1 ring-black/[0.03]">
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gradient-to-r from-muted/80 to-muted/40 border-b border-border/80">
        <span className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
          <GitBranch className="w-3.5 h-3.5 shrink-0 text-primary-text" aria-hidden />
          {label}
        </span>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          <span className="text-rose-600 dark:text-rose-400">−{dels}</span>
          <span className="mx-1 opacity-40" aria-hidden>
            /
          </span>
          <span className="text-emerald-600 dark:text-emerald-400">+{adds}</span>
        </span>
      </div>
      <ScrollArea className={maxHeightClass}>
        <pre className="text-[11px] leading-relaxed font-mono p-3 pb-4 whitespace-pre-wrap break-words">
          {lines.map((row, i) => (
            <div
              key={i}
              className={cn(
                "px-1.5 py-0.5 -mx-1 rounded-sm border-l-2",
                row.sign === "-" &&
                  "border-l-rose-500 bg-rose-500/12 text-rose-950 dark:text-rose-100 dark:bg-rose-950/35",
                row.sign === "+" &&
                  "border-l-emerald-500 bg-emerald-500/12 text-emerald-950 dark:text-emerald-100 dark:bg-emerald-950/35",
                row.sign === " " && "border-l-transparent text-muted-foreground",
              )}
            >
              <span className="select-none inline-block w-3 font-semibold opacity-80">{row.sign}</span>
              {row.text || " "}
            </div>
          ))}
        </pre>
      </ScrollArea>
      {(truncated || fallback) && (
        <p className="text-[10px] text-amber-700 dark:text-amber-400 px-3 py-2 border-t border-border/60 bg-amber-500/5">
          {fallback
            ? "Diff used a single-line fallback — text is very large."
            : "Line list was truncated for performance."}
        </p>
      )}
    </div>
  );
}
