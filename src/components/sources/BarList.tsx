import { importListingDiffKey } from "@/lib/importAnalysis";
import type { Bucket } from "@/lib/sourceInsights";
import type { Listing } from "@/lib/types";

/** Link to a listing's detail page; ids match the ones DataProvider assigns to live listings. */
export const listingHref = (sourceId: string, l: Listing) =>
  `/listing/${encodeURIComponent(l.id?.startsWith(`${sourceId}:`) ? l.id : `${sourceId}:${importListingDiffKey(l)}`)}`;

/**
 * Horizontal bars with labels and counts — readable at any width and accessible as a plain list,
 * which suits small categorical breakdowns better than a full chart.
 */
export function BarList({
  buckets,
  emptyText = "No data",
  onSelect,
  selected,
}: {
  buckets: Bucket[];
  emptyText?: string;
  onSelect?: (label: string) => void;
  selected?: string | null;
}) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const total = buckets.reduce((n, b) => n + b.count, 0);
  if (total === 0) return <p className="text-xs text-muted-foreground">{emptyText}</p>;
  return (
    <ul className="space-y-1.5">
      {buckets.map((b) => {
        const content = (
          <>
            <div className="flex justify-between gap-2 text-xs">
              <span className="truncate text-muted-foreground" title={b.label}>
                {b.label}
              </span>
              <span className="shrink-0 font-mono tabular-nums">
                {b.count.toLocaleString()}
                <span className="ml-1.5 text-muted-foreground">{Math.round((b.count / total) * 100)}%</span>
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted">
              <div
                className={`h-1.5 rounded-full ${selected === b.label ? "bg-primary" : "bg-[var(--series-1)]"}`}
                style={{ width: `${(b.count / max) * 100}%` }}
              />
            </div>
          </>
        );
        return (
          <li key={b.label}>
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(b.label)}
                aria-pressed={selected === b.label}
                className="block w-full space-y-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {content}
              </button>
            ) : (
              <div className="space-y-1">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
