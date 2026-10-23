import { cn } from "@/lib/utils";

type Props = {
  urls: string[];
  /** Tighter grid columns (e.g. multi-column compare). */
  compact?: boolean;
  /**
   * `default` — scrollable thumbnail grid (feed compare, listing compare).
   * `dense` — compact horizontal strip (tight tables e.g. import diff on listing detail).
   */
  variant?: "default" | "dense";
  className?: string;
};

function orderedImageUrls(urls: string[]) {
  const clean = (urls || []).filter((u) => typeof u === "string" && u.trim().length > 0);
  const http = clean.filter((u) => /^https?:\/\//i.test(u.trim()));
  const rest = clean.filter((u) => !/^https?:\/\//i.test(u.trim()));
  return [...http, ...rest];
}

/** Renders listing image URLs as clickable thumbnails (not plain URL lists). */
export function ListingImageUrlGrid({ urls, compact, variant = "default", className }: Props) {
  const ordered = orderedImageUrls(urls);

  if (!ordered.length) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  if (variant === "dense") {
    return (
      <div className={cn("min-w-0 space-y-1.5", className)}>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground tabular-nums">
          {ordered.length} image{ordered.length === 1 ? "" : "s"}
        </p>
        <div className="flex gap-1.5 overflow-x-auto pb-1 pt-0.5 snap-x snap-mandatory scroll-pl-0 [-webkit-overflow-scrolling:touch]">
          {ordered.map((url, i) => (
            <a
              key={`${url}-${i}`}
              href={url.trim()}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative h-14 w-[4.5rem] shrink-0 snap-start overflow-hidden rounded-md border border-border/80 bg-muted shadow-sm transition hover:border-primary/45 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <img
                src={url.trim()}
                alt={`Photo ${i + 1}`}
                className="h-full w-full object-cover transition group-hover:scale-[1.03]"
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.style.opacity = "0.25";
                }}
              />
            </a>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("min-w-0 space-y-2", className)}>
      <p className="text-[10px] font-medium text-muted-foreground tabular-nums">
        {ordered.length} image{ordered.length === 1 ? "" : "s"}
      </p>
      <div
        className={cn(
          "max-h-[min(24rem,50vh)] overflow-y-auto overflow-x-hidden pr-1",
          "[scrollbar-gutter:stable]",
        )}
      >
        <div
          className={cn(
            "grid gap-2",
            compact ? "grid-cols-3 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4",
          )}
        >
          {ordered.map((url, i) => (
            <a
              key={`${url}-${i}`}
              href={url.trim()}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative aspect-[4/3] overflow-hidden rounded-lg border border-border/80 bg-muted shadow-sm transition hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <img
                src={url.trim()}
                alt={`Listing photo ${i + 1}`}
                className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                loading={i < 8 ? "eager" : "lazy"}
                onError={(e) => {
                  e.currentTarget.style.opacity = "0.2";
                }}
              />
              <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 py-0.5 text-[9px] font-medium text-white opacity-0 transition group-hover:opacity-100">
                Open
              </span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
