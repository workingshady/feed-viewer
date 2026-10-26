import { useMemo, useState } from "react";
import { wordDiff, type DiffToken } from "@/lib/wordDiff";
import { cn } from "@/lib/utils";

/** Unchanged stretches longer than this are folded to their first and last lines. */
const FOLD_OVER = 280;
const FOLD_KEEP = 90;

function fold(text: string, first: boolean, last: boolean): string {
  if (text.length <= FOLD_OVER) return text;
  const head = first ? "" : text.slice(0, FOLD_KEEP);
  const tail = last ? "" : text.slice(-FOLD_KEEP);
  return `${head}${head ? " " : ""}[…]${tail ? " " : ""}${tail}`;
}

/**
 * One side of a word diff. The "before" side shows removed words struck on a red tint, the "after"
 * side shows added words on a green tint; unchanged words stay plain, so the eye goes straight to
 * what changed. Colour is never the only cue: removed text is struck through, added text underlined.
 */
export function DiffSide({
  tokens,
  side,
  className,
  collapse = false,
}: {
  tokens: DiffToken[];
  side: "before" | "after";
  className?: string;
  /** Fold long unchanged text so the changes stay in view. */
  collapse?: boolean;
}) {
  return (
    <span className={cn("whitespace-pre-wrap break-words", className)}>
      {tokens.map((t, i) =>
        t.op === "same" ? (
          <span key={i} className={cn(collapse && t.text.length > FOLD_OVER && "text-muted-foreground/70")}>
            {collapse ? fold(t.text, i === 0, i === tokens.length - 1) : t.text}
          </span>
        ) : t.op === "del" && side === "before" ? (
          <del key={i} className="rounded-sm bg-destructive/15 text-foreground decoration-destructive/70">
            {t.text}
          </del>
        ) : t.op === "ins" && side === "after" ? (
          <ins key={i} className="rounded-sm bg-success/20 text-foreground no-underline decoration-success/70 [text-decoration-line:underline] [text-decoration-thickness:1px]">
            {t.text}
          </ins>
        ) : null,
      )}
    </span>
  );
}

/** Before and after of a text field side by side (stacked on narrow screens), changes highlighted. */
export function TextDiffPanes({
  before,
  after,
  labels = { before: "Before", after: "After" },
  maxHeightClass = "max-h-72",
}: {
  before: string;
  after: string;
  labels?: { before: string; after: string };
  maxHeightClass?: string;
}) {
  const d = useMemo(() => wordDiff(before, after), [before, after]);
  const [full, setFull] = useState(false);
  const foldable = d.tokens.some((t) => t.op === "same" && t.text.length > FOLD_OVER);
  return (
    <div className="space-y-1.5">
    {foldable && (
      <button type="button" onClick={() => setFull((v) => !v)} className="text-[11px] font-medium text-primary-text hover:underline">
        {full ? "Show changes only" : "Show full text"}
      </button>
    )}
    <div className="grid gap-2 md:grid-cols-2">
      {(["before", "after"] as const).map((side) => (
        <div key={side} className={cn("rounded-lg border", side === "before" ? "border-destructive/20 bg-destructive/[0.03]" : "border-success/25 bg-success/[0.04]")}>
          <div className="flex items-center justify-between border-b border-inherit px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>{labels[side]}</span>
            {side === "after" && <span className="font-normal normal-case tracking-normal">{d.changed} words changed</span>}
          </div>
          <div className={cn("overflow-y-auto px-3 py-2 text-xs leading-relaxed text-muted-foreground", maxHeightClass)}>
            <DiffSide tokens={d.tokens} side={side} collapse={!full} />
          </div>
        </div>
      ))}
    </div>
    </div>
  );
}
