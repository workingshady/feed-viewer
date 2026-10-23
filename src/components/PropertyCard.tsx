import {
  addCompareListingId,
  removeCompareListingId,
} from "@/lib/compareSelection";
import { formatPriceCompact, RENT_PERIOD_LABEL } from "@/lib/displayPrice";
import { isListingFieldFilled } from "@/lib/listingFieldPresence";
import { canPlayInlineOnSite, isYouTubeVideoUrl, normalizeVideoTourPageUrl } from "@/lib/videoTourUrl";
import { VideoTourPlayer } from "@/components/VideoTourPlayer";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useFavorites } from "@/hooks/usePrefs";
import type { ImportListingStatus } from "@/lib/types";
import { Listing } from "@/lib/types";
import { AgentPhoto } from "@/components/AgentPhoto";
import { cn } from "@/lib/utils";
import { Bath, Bed, Building2, ChevronLeft, ChevronRight, Columns2, Hash, Heart, ImageOff, MapPin, Maximize, Play, Youtube } from "lucide-react";
import { memo, useEffect, useRef, useState, type MouseEvent } from "react";
import { Link } from "react-router-dom";
import { toast } from "@/components/ui/sonner";

interface Props {
  listing: Listing;
  highlightQuery?: string;
  status?: ImportListingStatus;
  /** Controlled by parent for perf (avoids per-card event listeners). */
  isFavorite?: boolean;
  /** Controlled by parent for perf (avoids per-card event listeners). */
  inCompare?: boolean;
  /** Tighter image controls when many grid columns (avoids overlap) */
  compact?: boolean;
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const re = new RegExp(`(${escapeRegex(q)})`, "ig");
  const parts = text.split(re);
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === q.toLowerCase() ? (
          <mark key={i} className="rounded bg-primary/20 text-foreground px-0.5">{p}</mark>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}

const HOVER_SLIDE_MS = 1000;

const PropertyCard = ({ listing, highlightQuery, status, compact = false, isFavorite, inCompare }: Props) => {
  const favorites = useFavorites();
  const [cmpInternal, setCmpInternal] = useState(() => Boolean(inCompare));
  const [imageHover, setImageHover] = useState(false);
  const [hoverSlideIdx, setHoverSlideIdx] = useState(0);
  const [videoPlayerOpen, setVideoPlayerOpen] = useState(false);
  const [imgError, setImgError] = useState(false);
  const slideTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const nImg = listing.images.length;

  const fav = typeof isFavorite === "boolean" ? isFavorite : favorites.isFavorite(listing.id);
  const cmp = typeof inCompare === "boolean" ? inCompare : cmpInternal;

  /** Stop the card `<Link>` from seeing the event (avoids accidental navigation). */
  const swallowForLink = (e: MouseEvent) => {
    e.stopPropagation();
  };

  const goPrev = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (nImg <= 1) return;
    setHoverSlideIdx((i) => (i - 1 + nImg) % nImg);
  };
  const goNext = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (nImg <= 1) return;
    setHoverSlideIdx((i) => (i + 1) % nImg);
  };

  // When uncontrolled, initialize internal state once per listing id.
  useEffect(() => {
    if (typeof inCompare !== "boolean") setCmpInternal(false);
  }, [listing.id]);

  useEffect(() => {
    if (typeof inCompare === "boolean") setCmpInternal(inCompare);
  }, [inCompare]);

  useEffect(() => {
    if (slideTimerRef.current) {
      clearInterval(slideTimerRef.current);
      slideTimerRef.current = null;
    }
    if (!imageHover || nImg <= 1) return;
    slideTimerRef.current = setInterval(() => {
      setHoverSlideIdx((i) => (i + 1) % nImg);
    }, HOVER_SLIDE_MS);
    return () => {
      if (slideTimerRef.current) {
        clearInterval(slideTimerRef.current);
        slideTimerRef.current = null;
      }
    };
  }, [imageHover, nImg, listing.id]);

  useEffect(() => {
    setHoverSlideIdx(0);
    setImgError(false);
  }, [listing.id]);

  const hasImage = listing.images.length > 0;
  const activeImgSrc = hasImage ? listing.images[Math.min(Math.max(0, hoverSlideIdx), nImg - 1)] : "";
  const imageTitleBase = (listing.title?.trim() || "Property").slice(0, 200);
  const priceOk = isListingFieldFilled(listing, "price");
  const purposeLabel = listing.purpose === "sale" ? "For Sale" : listing.purpose === "rent" ? "For Rent" : "";
  const loc = listing.community || listing.city || listing.address || "Unknown location";
  // The purpose badge and "per year" already say it's a rental; only sales get an eyebrow.
  const priceEyebrow = listing.purpose === "sale" ? "Asking price" : "";
  const videoTourRaw = listing.videoTourUrl?.trim() ?? "";
  const videoTourHref = normalizeVideoTourPageUrl(videoTourRaw);
  const hasVideoTour = !!videoTourHref;
  const videoIsYouTube = hasVideoTour && isYouTubeVideoUrl(videoTourRaw);
  const videoPlaysInline = hasVideoTour && canPlayInlineOnSite(videoTourRaw);

  const btn = compact ? "w-7 h-7 rounded-full" : "w-8 h-8 rounded-full";
  const icon = compact ? "w-3 h-3" : "w-3.5 h-3.5";
  const inset = compact ? "bottom-2 left-2 right-2" : "bottom-3 left-3 right-3";
  const topInset = compact ? "top-2 left-2" : "top-3 left-3";

  const cardAria = `${listing.title || "Property"}${listing.reference ? `, ref ${listing.reference}` : ""}. View listing.`;

  return (
    <div
      data-testid="property-card"
      className={cn(
        "group relative flex min-w-0 flex-col bg-card bg-gradient-to-b from-card to-muted/15 rounded-[1.75rem] overflow-hidden border border-border/90 ring-1 ring-black/[0.04] hover:ring-primary/30 hover:border-primary/40 transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-1.5 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] hover:shadow-primary/5 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary/40 w-full h-full",
      )}
      onMouseEnter={() => setImageHover(true)}
      onMouseLeave={() => {
        setImageHover(false);
        setHoverSlideIdx(0);
      }}
    >
      <Link
        to={`/listing/${encodeURIComponent(listing.id)}`}
        className="absolute inset-0 z-0 rounded-[1.75rem]"
        aria-label={cardAria}
      >
        <span className="sr-only">{cardAria}</span>
      </Link>
      <div className="relative z-[1] flex min-w-0 flex-1 flex-col pointer-events-none">
        <div className="relative min-w-0 overflow-hidden rounded-t-[1.75rem] aspect-[16/10] bg-muted/50">
        {hasImage && !imgError ? (
          <div
            className={cn(
              "absolute inset-0 transition-transform duration-500 ease-out",
              /* No zoom when multiple photos — avoids scale fighting arrows / accidental link clicks */
              nImg === 1 && "group-hover:scale-[1.04]"
            )}
          >
            {/* Render only the active image to avoid downloading dozens of hidden <img> tags per card. */}
            <img
              key={`${listing.id}-img-active-${hoverSlideIdx}`}
              src={activeImgSrc}
              alt={nImg <= 1 ? imageTitleBase : `Photo ${hoverSlideIdx + 1} of ${nImg}: ${imageTitleBase}`}
              className="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              draggable={false}
              onError={() => setImgError(true)}
            />
          </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 bg-muted/80 text-muted-foreground/50 border-b border-border/60">
            <ImageOff className="w-12 h-12 opacity-50" />
          </div>
        )}

        {nImg > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous photo"
              onClick={goPrev}
              onPointerDown={swallowForLink}
              onMouseDown={swallowForLink}
              className={cn(
                "absolute z-[4] top-1/2 -translate-y-1/2 flex items-center justify-center rounded-full",
                "bg-background/85 backdrop-blur-sm border border-border/80 text-foreground shadow-md",
                "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto",
                "hover:bg-background transition-opacity duration-200 focus-visible:opacity-100 focus-visible:pointer-events-auto",
                compact ? "left-1.5 w-7 h-7" : "left-2 w-9 h-9"
              )}
            >
              <ChevronLeft className={compact ? "w-4 h-4" : "w-5 h-5"} />
            </button>
            <button
              type="button"
              aria-label="Next photo"
              onClick={goNext}
              onPointerDown={swallowForLink}
              onMouseDown={swallowForLink}
              className={cn(
                "absolute z-[4] top-1/2 -translate-y-1/2 flex items-center justify-center rounded-full",
                "bg-background/85 backdrop-blur-sm border border-border/80 text-foreground shadow-md",
                "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto",
                "hover:bg-background transition-opacity duration-200 focus-visible:opacity-100 focus-visible:pointer-events-auto",
                compact ? "right-1.5 w-7 h-7" : "right-2 w-9 h-9"
              )}
            >
              <ChevronRight className={compact ? "w-4 h-4" : "w-5 h-5"} />
            </button>
          </>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent pointer-events-none" />

        <div
          className={cn(
            "absolute z-[1] flex flex-wrap gap-1 max-w-[calc(100%-3rem)]",
            topInset
          )}
        >
          {purposeLabel && (
            <span
              className={cn(
                "rounded-full font-bold tracking-wide shadow-lg shrink-0",
                compact ? "px-2 py-px text-[10px]" : "px-2.5 py-0.5 text-[11px]",
                listing.purpose === "sale"
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground"
              )}
            >
              {purposeLabel}
            </span>
          )}
          {status === "new" && (
            <span className={cn("rounded-full font-bold bg-emerald-500 text-white shadow-lg shrink-0", compact ? "px-2 py-px text-[10px]" : "px-2.5 py-0.5 text-[11px]")}>New</span>
          )}
          {status === "updated" && (
            <span className={cn("rounded-full font-bold bg-primary text-primary-foreground shadow-lg shrink-0", compact ? "px-2 py-px text-[10px]" : "px-2.5 py-0.5 text-[11px]")}>Updated</span>
          )}
          {status === "duplicate" && (
            <span className={cn("rounded-full font-bold bg-yellow-500/90 text-black shadow-lg shrink-0", compact ? "px-2 py-px text-[10px]" : "px-2.5 py-0.5 text-[11px]")}>Duplicate</span>
          )}
          {listing.completionStatus?.toLowerCase().includes("off") && (
            <span className={cn("rounded-full font-bold bg-sky-500/90 text-white shadow-lg shrink-0", compact ? "px-2 py-px text-[10px]" : "px-2.5 py-0.5 text-[11px]")}>Off-Plan</span>
          )}
          {hasVideoTour && (
            <span
              className={cn(
                "rounded-full font-bold text-white shadow-lg shrink-0 inline-flex items-center gap-0.5 ring-1 ring-white/25",
                compact ? "px-2 py-px text-[10px]" : "px-2.5 py-0.5 text-[11px]",
                videoIsYouTube
                  ? "bg-gradient-to-r from-[#FF0000] to-[#CC0000]"
                  : "bg-gradient-to-br from-violet-600 via-fuchsia-600 to-purple-700",
              )}
            >
              {videoIsYouTube ? (
                <Youtube className={compact ? "w-2.5 h-2.5" : "w-3.5 h-3.5"} aria-hidden />
              ) : (
                <Play className={compact ? "w-2.5 h-2.5" : "w-3 h-3"} fill="currentColor" aria-hidden />
              )}
              {videoIsYouTube ? "YouTube" : "Tour"}
            </span>
          )}
        </div>

        {/* Three-column strip: compare | photo count | save — prevents overlap in dense grids */}
        <div
          className={cn(
            "absolute z-[4] grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-1.5 gap-y-1 pointer-events-auto",
            inset
          )}
        >
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (cmp) {
                removeCompareListingId(listing.id);
                toast.info("Removed from compare");
                setCmpInternal(false);
              } else {
                addCompareListingId(listing.id);
                toast.success("Added to compare");
                setCmpInternal(true);
              }
            }}
            className={cn(
              "flex items-center justify-center transition-all shrink-0 border",
              btn,
              cmp
                ? "bg-primary text-primary-foreground border-primary/40 shadow-lg shadow-primary/30"
                : "bg-background/80 backdrop-blur-sm border-border text-muted-foreground hover:text-foreground"
            )}
            aria-label={cmp ? "Remove from compare" : "Add to compare"}
            aria-pressed={cmp}
            title={cmp ? "Remove from compare" : "Add to compare"}
          >
            <Columns2 className={icon} />
          </button>

          {listing.images.length > 1 ? (
            <span
              className={cn(
                "justify-self-center min-w-0 truncate text-center font-semibold bg-background/80 backdrop-blur-sm text-foreground/85 border border-border rounded-full tabular-nums max-w-full",
                compact ? "px-1.5 py-px text-[9px]" : "px-2 py-0.5 text-[10px]"
              )}
            >
              {imageHover && !compact
                ? `${hoverSlideIdx + 1}/${listing.images.length}`
                : compact
                  ? `${listing.images.length}`
                  : `${listing.images.length} photos`}
            </span>
          ) : (
            <span className="min-w-0" aria-hidden />
          )}

          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              favorites.toggle(listing.id);
            }}
            className={cn(
              "flex items-center justify-center transition-all shrink-0 border",
              btn,
              fav
                ? "bg-primary text-primary-foreground border-primary/40 shadow-lg shadow-primary/30"
                : "bg-background/80 backdrop-blur-sm border-border text-muted-foreground hover:text-foreground"
            )}
            aria-label={fav ? "Remove from saved listings" : "Save listing"}
            aria-pressed={fav}
            title={fav ? "Unsave" : "Save"}
          >
            <Heart className={cn(icon, fav && "fill-current")} />
          </button>
        </div>
      </div>

      <div className="flex flex-col flex-1 min-w-0 p-5 sm:p-6 gap-3.5 overflow-hidden">
        <div className="flex items-start justify-between gap-2 min-w-0">
          <div className="min-w-0">
            {priceEyebrow && (
              <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-[0.2em] mb-0.5">
                {priceEyebrow}
              </div>
            )}
            <div
              className={cn(
                "text-[22px] font-extrabold font-heading leading-tight tabular-nums tracking-tight",
                priceOk ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {listing.price ? (
                <>
                  <span className="text-muted-foreground font-semibold text-sm mr-1">{listing.currency}</span>
                  {formatPriceCompact(listing.price)}
                </>
              ) : (
                <span>{String(listing.priceOnApplication || "").trim().toLowerCase() === "yes" ? "POA" : "—"}</span>
              )}
            </div>
            {listing.purpose === "rent" && (
              <div className="text-[10px] text-muted-foreground mt-0.5">{RENT_PERIOD_LABEL[listing.rentPeriod || "yearly"]}</div>
            )}
          </div>
          <span className="mt-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary-text border border-primary/20 whitespace-nowrap shrink-0 max-w-[45%] truncate">
            {listing.propertyType || "Property"}
          </span>
        </div>

        <h3 className="text-[15px] leading-6 font-semibold text-foreground line-clamp-2 min-h-[3rem] min-w-0 transition-colors group-hover:text-primary-text/90">
          {listing.title
            ? highlightQuery
              ? <Highlight text={listing.title} query={highlightQuery} />
              : listing.title
            : "Untitled Property"}
        </h3>

        <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 line-clamp-1 min-w-0 min-h-[1.125rem]">
          <MapPin className="w-3 h-3 shrink-0 text-primary-text" />
          {highlightQuery ? <Highlight text={loc} query={highlightQuery} /> : loc}
        </div>

        <div className={cn("min-w-0", compact ? "min-h-[3.25rem]" : "min-h-[3.75rem]")}>
          {hasVideoTour && videoTourHref ? (
            <>
              {videoPlaysInline ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setVideoPlayerOpen(true);
                  }}
                  className={cn(
                    "pointer-events-auto group/vt relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border px-3 py-2.5 text-left text-xs font-bold shadow-sm transition-all min-w-0",
                    compact && "py-2 px-2.5 text-[11px] gap-2",
                    videoIsYouTube
                      ? "border-red-500/40 bg-gradient-to-r from-red-500/[0.12] to-red-950/20 text-red-950 dark:from-red-500/20 dark:to-red-950/40 dark:text-red-50 hover:border-red-400/60"
                      : "border-violet-500/35 bg-gradient-to-br from-violet-500/10 to-fuchsia-500/5 text-violet-900 dark:text-violet-100 hover:border-violet-400/50",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white shadow-md ring-2 ring-white/20",
                      videoIsYouTube ? "bg-[#FF0000]" : "bg-gradient-to-br from-violet-600 to-fuchsia-600",
                      compact && "h-8 w-8",
                    )}
                  >
                    {videoIsYouTube ? (
                      <Youtube className={cn("w-5 h-5", compact && "w-4 h-4")} aria-hidden />
                    ) : (
                      <Play className={cn("w-5 h-5 fill-current", compact && "w-4 h-4")} aria-hidden />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">Play video tour</span>
                    <span className="mt-0.5 block text-[10px] font-normal opacity-80 truncate">
                      Plays here — embedded player
                    </span>
                  </span>
                  <ChevronRight
                    className={cn(
                      "w-4 h-4 shrink-0 opacity-60 transition-transform group-hover/vt:translate-x-0.5",
                      videoIsYouTube && "text-red-700 dark:text-red-200",
                    )}
                    aria-hidden
                  />
                </button>
              ) : (
                <a
                  href={videoTourHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "pointer-events-auto group/vt relative flex items-center gap-3 overflow-hidden rounded-2xl border px-3 py-2.5 text-left text-xs font-bold shadow-sm transition-all min-w-0",
                    compact && "py-2 px-2.5 text-[11px] gap-2",
                    "border-violet-500/35 bg-gradient-to-br from-violet-500/10 to-fuchsia-500/5 text-violet-900 dark:text-violet-100 hover:border-violet-400/50",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-md",
                      compact && "h-8 w-8",
                    )}
                  >
                    <Play className={cn("w-5 h-5 fill-current", compact && "w-4 h-4")} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">Open video tour</span>
                    <span className="mt-0.5 block text-[10px] font-normal opacity-80 truncate">External link</span>
                  </span>
                  <ChevronRight
                    className="w-4 h-4 shrink-0 opacity-60 transition-transform group-hover/vt:translate-x-0.5"
                    aria-hidden
                  />
                </a>
              )}
              <Dialog open={videoPlayerOpen} onOpenChange={setVideoPlayerOpen}>
                <DialogContent className="max-h-[min(92vh,900px)] max-w-[min(96vw,960px)] gap-0 overflow-y-auto p-0 sm:max-w-4xl">
                  <DialogHeader className="border-b border-border px-5 py-4 pr-12 text-left sm:px-6">
                    <DialogTitle className="line-clamp-2 text-left text-base font-heading leading-snug">
                      {listing.title?.trim() || "Video tour"}
                    </DialogTitle>
                  </DialogHeader>
                  <div className="p-4 sm:p-6">
                    <VideoTourPlayer rawUrl={listing.videoTourUrl} title="Video tour" />
                  </div>
                </DialogContent>
              </Dialog>
            </>
          ) : null}
        </div>

        <div className="h-px shrink-0 bg-gradient-to-r from-transparent via-border to-transparent" />

        <div className="flex flex-col gap-1.5 min-w-0">
          <div
            className={cn(
              "min-w-0 text-[11px] text-muted-foreground",
              listing.agent?.name &&
                (compact
                  ? "flex flex-col gap-2"
                  : "grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-1 items-center"),
            )}
          >
            <div
              data-testid="property-card-metrics"
              className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3"
            >
              {listing.beds > 0 && (
                <span className="flex items-center gap-1 shrink-0">
                  <Bed className="w-3.5 h-3.5 text-primary-text/70 shrink-0" />
                  <span className="font-semibold text-foreground tabular-nums">{listing.beds}</span>
                </span>
              )}
              {listing.baths > 0 && (
                <span className="flex items-center gap-1 shrink-0">
                  <Bath className="w-3.5 h-3.5 text-primary-text/70 shrink-0" />
                  <span className="font-semibold text-foreground tabular-nums">{listing.baths}</span>
                </span>
              )}
              {listing.area > 0 && (
                <span className="flex min-w-0 max-w-full items-center gap-1">
                  <Maximize className="w-3.5 h-3.5 shrink-0 text-primary-text/70" />
                  <span className="min-w-0 font-semibold text-foreground truncate tabular-nums">
                    {Math.round(listing.area).toLocaleString()} {listing.areaUnit}
                  </span>
                </span>
              )}
            </div>

            <div
              data-testid="property-card-agent"
              className={cn(
                "flex min-w-0 items-center gap-1 shrink-0",
                compact
                  ? "justify-start border-t border-border/50 pt-2"
                  : "justify-end",
                // Always reserve space so cards remain identical when agent is missing.
                compact ? "min-h-[28px]" : "min-h-[20px]",
              )}
            >
              {listing.agent?.name ? (
                <>
                  {listing.agent.photo ? (
                    <AgentPhoto variant="avatar" src={listing.agent.photo} alt={listing.agent.name} />
                  ) : (
                    <div className="w-5 h-5 shrink-0 rounded-full bg-primary/15 border border-border/80 flex items-center justify-center">
                      <Building2 className="w-3 h-3 text-primary-text/70" />
                    </div>
                  )}
                  <span className="min-w-0 max-w-[5rem] truncate text-[10px] text-muted-foreground sm:max-w-[4.5rem]">
                    {listing.agent.name.split(" ")[0]}
                  </span>
                </>
              ) : (
                <span className="sr-only">No agent</span>
              )}
            </div>
          </div>

          <div className="flex min-w-0 w-full min-h-[34px]">
            {listing.reference ? (
              <span className="inline-flex w-full min-w-0 items-start gap-1.5 font-mono text-[10px] leading-snug bg-muted/60 px-2 py-1.5 rounded-lg border border-border/80 text-muted-foreground break-all">
                <Hash className="w-2.5 h-2.5 shrink-0 mt-0.5 opacity-80" aria-hidden />
                {listing.reference}
              </span>
            ) : (
              <span className="sr-only">No reference</span>
            )}
          </div>
        </div>

        {/* CTA strip — clicks pass through to the full-card overlay link (pointer-events-none parent). */}
        <div
          className={cn(
            "-mx-5 -mb-5 mt-1 flex items-center justify-between gap-2 border-t border-border/60 bg-gradient-to-r from-primary/[0.06] via-muted/20 to-transparent px-5 py-3.5 text-primary-text sm:-mx-6 sm:-mb-6 sm:px-6 rounded-b-[1.75rem]",
            compact ? "text-[10px] font-semibold" : "text-xs font-semibold",
          )}
          aria-hidden
        >
          <span className="tracking-wide">View listing</span>
          <ChevronRight className={cn("shrink-0 opacity-90 transition-transform duration-300 group-hover:translate-x-1", compact ? "w-3 h-3" : "w-4 h-4")} aria-hidden />
        </div>
      </div>
      </div>
    </div>
  );
};

/**
 * Memoized because a page renders 24 of these and ListingsPage re-renders on state that does not
 * touch any card — grid zoom, filter-panel toggles, the recent-listings strip, pagination hover.
 * Every prop is a primitive except `listing`, whose identity only changes when the filtered set is
 * recomputed, so the default shallow comparison is exactly the right test.
 */
export default memo(PropertyCard);
