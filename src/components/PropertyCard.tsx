import {
  addCompareListingId,
  removeCompareListingId,
} from "@/lib/compareSelection";
import { formatPriceCompact } from "@/lib/displayPrice";
import { isListingFieldFilled } from "@/lib/listingFieldPresence";
import { canPlayInlineOnSite, isYouTubeVideoUrl, normalizeVideoTourPageUrl } from "@/lib/videoTourUrl";
import { VideoTourPlayer } from "@/components/VideoTourPlayer";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useFavorites } from "@/hooks/usePrefs";
import type { ImportListingStatus } from "@/lib/types";
import { Listing } from "@/lib/types";
import { PersonAvatar } from "@/components/PersonAvatar";
import { AgencyLogo } from "@/components/AgencyLogo";
import { useAppData } from "@/providers/DataProvider";
import { cn } from "@/lib/utils";
import { Bath, Bed, Camera, CarFront, ChevronLeft, ChevronRight, Columns2, Heart, ImageOff, MapPin, Maximize, Play, Sofa, Youtube } from "lucide-react";
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

const RENT_SHORT: Record<string, string> = { yearly: "yr", monthly: "mo", weekly: "wk", daily: "day" };

/** Feeds spell furnishing a dozen ways (Yes, furnished, semi, partly, No, unfurnished…). */
function furnishedTag(raw: string | undefined): string {
  const v = raw?.trim().toLowerCase() ?? "";
  if (!v) return "";
  if (v.startsWith("semi") || v.startsWith("part")) return "Semi-furnished";
  if (v === "no" || v.startsWith("un") || v.startsWith("not")) return "Unfurnished";
  if (v === "yes" || v.startsWith("furn") || v.startsWith("fully")) return "Furnished";
  return "";
}

function Spec({ icon: Icon, children }: { icon: typeof Bed; children: React.ReactNode }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap">
      <Icon className="h-3.5 w-3.5 shrink-0 text-primary-text/75" aria-hidden />
      <span className="truncate font-medium text-foreground tabular-nums">{children}</span>
    </span>
  );
}

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
  const locParts = [listing.subCommunity, listing.community, listing.city].map((x) => x?.trim()).filter(Boolean);
  const loc = [...new Set(locParts)].slice(0, 2).join(" · ") || listing.address || "Unknown location";
  const isPoa = String(listing.priceOnApplication || "").trim().toLowerCase() === "yes";
  const perArea =
    listing.purpose === "sale" && listing.price > 0 && listing.area > 0 ? Math.round(listing.price / listing.area) : 0;
  const completion = listing.completionStatus?.toLowerCase() ?? "";
  const readiness = completion.includes("off") ? "" : completion.includes("ready") || completion.includes("complete") ? "Ready" : "";
  const furnishedLabel = furnishedTag(listing.furnished);
  const { sources } = useAppData();
  const agencyName = listing.sourceAgency?.trim() ?? "";
  const agencyLogo = agencyName ? sources.find((x) => x.name === agencyName)?.agencyInfo?.logo : undefined;
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
        "group relative flex min-w-0 flex-col bg-card rounded-[1.75rem] overflow-hidden border border-border/90 ring-1 ring-[hsl(var(--hairline))] hover:ring-primary/30 hover:border-primary/40 transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-1.5 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] hover:shadow-primary/5 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary/40 w-full h-full",
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
                "border shadow-md bg-[hsl(var(--scrim)/0.38)] backdrop-blur-md border-on-media/20 text-on-media hover:bg-[hsl(var(--scrim)/0.55)]",
                "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto",
                "transition-opacity duration-200 focus-visible:opacity-100 focus-visible:pointer-events-auto",
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
                "border shadow-md bg-[hsl(var(--scrim)/0.38)] backdrop-blur-md border-on-media/20 text-on-media hover:bg-[hsl(var(--scrim)/0.55)]",
                "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto",
                "transition-opacity duration-200 focus-visible:opacity-100 focus-visible:pointer-events-auto",
                compact ? "right-1.5 w-7 h-7" : "right-2 w-9 h-9"
              )}
            >
              <ChevronRight className={compact ? "w-4 h-4" : "w-5 h-5"} />
            </button>
          </>
        )}

        {/* Scrim, not a page-colour fade: photos stay vivid in both themes and white chips stay legible. */}
        <div className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-[hsl(var(--scrim)/0.28)] to-transparent pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[hsl(var(--scrim)/0.5)] to-transparent pointer-events-none" />

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
            <span className={cn("rounded-full font-bold bg-success text-success-foreground shadow-lg shrink-0", compact ? "px-2 py-px text-[10px]" : "px-2.5 py-0.5 text-[11px]")}>New</span>
          )}
          {status === "updated" && (
            <span className={cn("rounded-full font-bold bg-primary text-primary-foreground shadow-lg shrink-0", compact ? "px-2 py-px text-[10px]" : "px-2.5 py-0.5 text-[11px]")}>Updated</span>
          )}
          {status === "duplicate" && (
            <span className={cn("rounded-full font-bold bg-amber-400 text-amber-950 shadow-lg shrink-0", compact ? "px-2 py-px text-[10px]" : "px-2.5 py-0.5 text-[11px]")}>Duplicate</span>
          )}
          {listing.completionStatus?.toLowerCase().includes("off") && (
            <span className={cn("rounded-full font-bold bg-sky-600 text-white shadow-lg shrink-0", compact ? "px-2 py-px text-[10px]" : "px-2.5 py-0.5 text-[11px]")}>Off-Plan</span>
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
                : "bg-[hsl(var(--scrim)/0.38)] backdrop-blur-md border-on-media/20 text-on-media hover:bg-[hsl(var(--scrim)/0.55)]"
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
                "justify-self-center inline-flex items-center gap-1 min-w-0 truncate font-semibold border rounded-full tabular-nums max-w-full bg-[hsl(var(--scrim)/0.38)] backdrop-blur-md border-on-media/20 text-on-media hover:bg-[hsl(var(--scrim)/0.55)]",
                compact ? "px-1.5 py-px text-[9px]" : "px-2 py-0.5 text-[10px]"
              )}
            >
              <Camera className={compact ? "w-2.5 h-2.5 shrink-0" : "w-3 h-3 shrink-0"} aria-hidden />
              {imageHover && !compact
                ? `${hoverSlideIdx + 1}/${listing.images.length}`
                : compact
                  ? `${listing.images.length}`
                  : `${listing.images.length}`}
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
                : "bg-[hsl(var(--scrim)/0.38)] backdrop-blur-md border-on-media/20 text-on-media hover:bg-[hsl(var(--scrim)/0.55)]"
            )}
            aria-label={fav ? "Remove from saved listings" : "Save listing"}
            aria-pressed={fav}
            title={fav ? "Unsave" : "Save"}
          >
            <Heart className={cn(icon, fav && "fill-current")} />
          </button>
        </div>
      </div>

      <div className={cn("flex flex-col flex-1 min-w-0 gap-3 overflow-hidden", compact ? "p-4" : "p-5")}>
        <div className="flex items-start justify-between gap-2 min-w-0">
          <div className="min-w-0">
            <div className="flex items-baseline gap-1 font-heading tabular-nums tracking-tight leading-none min-w-0">
              {listing.price ? (
                <>
                  <span className="text-xs font-semibold text-muted-foreground">{listing.currency}</span>
                  <span className={cn("font-extrabold", priceOk ? "text-foreground" : "text-muted-foreground", compact ? "text-xl" : "text-[24px]")}>
                    {formatPriceCompact(listing.price)}
                  </span>
                  {listing.purpose === "rent" && (
                    <span className="text-xs font-medium text-muted-foreground">/{RENT_SHORT[listing.rentPeriod || "yearly"] ?? "yr"}</span>
                  )}
                </>
              ) : (
                <span className={cn("font-extrabold text-muted-foreground", compact ? "text-base" : "text-lg")}>
                  {isPoa ? "Price on application" : "Price not set"}
                </span>
              )}
            </div>
            {perArea > 0 && !compact && (
              <div className="mt-1.5 text-[11px] text-muted-foreground tabular-nums">
                {listing.currency} {perArea.toLocaleString()} / {listing.areaUnit || "sqft"}
              </div>
            )}
          </div>
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary-text ring-1 ring-inset ring-primary/20 whitespace-nowrap shrink-0 max-w-[45%] truncate">
            {listing.propertyType || "Property"}
          </span>
        </div>

        <h3
          className="text-[15px] leading-6 font-semibold text-foreground line-clamp-2 min-h-[3rem] min-w-0 transition-colors group-hover:text-primary-text"
          title={listing.title || undefined}
        >
          {listing.title
            ? highlightQuery
              ? <Highlight text={listing.title} query={highlightQuery} />
              : listing.title
            : "Untitled Property"}
        </h3>

        <div className="text-xs text-muted-foreground flex items-center gap-1.5 min-w-0" title={loc}>
          <MapPin className="w-3.5 h-3.5 shrink-0 text-primary-text/80" aria-hidden />
          <span className="truncate">{highlightQuery ? <Highlight text={loc} query={highlightQuery} /> : loc}</span>
          {listing.reference && !compact && (
            <span className="ml-auto shrink-0 max-w-[40%] truncate font-mono text-[10px] text-muted-foreground/80" title={`Reference ${listing.reference}`}>
              {highlightQuery ? <Highlight text={listing.reference} query={highlightQuery} /> : listing.reference}
            </span>
          )}
        </div>

        <div
          data-testid="property-card-metrics"
          className="flex min-w-0 flex-wrap items-center gap-x-3.5 gap-y-1.5 rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground ring-1 ring-inset ring-border/60"
        >
          {listing.beds > 0 || listing.propertyType?.toLowerCase().includes("apart") ? (
            <Spec icon={Bed}>{listing.beds > 0 ? `${listing.beds} ${listing.beds === 1 ? "bed" : "beds"}` : "Studio"}</Spec>
          ) : null}
          {listing.baths > 0 && <Spec icon={Bath}>{`${listing.baths} ${listing.baths === 1 ? "bath" : "baths"}`}</Spec>}
          {listing.area > 0 && <Spec icon={Maximize}>{`${Math.round(listing.area).toLocaleString()} ${listing.areaUnit || "sqft"}`}</Spec>}
          {!compact && listing.parking > 0 && <Spec icon={CarFront}>{`${listing.parking} parking`}</Spec>}
          {!(listing.beds > 0 || listing.baths > 0 || listing.area > 0) && <span className="italic">No size details</span>}
        </div>

        {(furnishedLabel || readiness) && (
          <div className="flex flex-wrap gap-1.5">
            {readiness && (
              <span className="inline-flex items-center rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success ring-1 ring-inset ring-success/20">
                {readiness}
              </span>
            )}
            {furnishedLabel && (
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary/10 px-2 py-0.5 text-[10px] font-semibold text-secondary-text ring-1 ring-inset ring-secondary/25">
                <Sofa className="h-3 w-3" aria-hidden /> {furnishedLabel}
              </span>
            )}
          </div>
        )}

          {hasVideoTour && videoTourHref ? (
            <div className="min-w-0">
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
            </div>
          ) : null}
        <div
          data-testid="property-card-agent"
          className="mt-auto flex min-w-0 items-center gap-2.5 border-t border-border/70 pt-3"
        >
          {listing.agent?.name ? (
            <>
              <PersonAvatar
                src={listing.agent.photo}
                name={listing.agent.name}
                className={compact ? "h-7 w-7 text-[9px]" : "h-9 w-9 text-[11px]"}
              />
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-xs font-semibold text-foreground" title={listing.agent.name}>
                  {listing.agent.name}
                </div>
                <div className="truncate text-[10px] text-muted-foreground" title={agencyName || listing.reference}>
                  {agencyName || (listing.reference ? `Ref ${listing.reference}` : "Agent")}
                </div>
              </div>
            </>
          ) : (
            <div className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
              {agencyName || "No agent listed"}
            </div>
          )}
          {agencyName && (
            <span title={agencyName} className="shrink-0">
              <AgencyLogo src={agencyLogo} name={agencyName} className={compact ? "h-7 w-14 p-1 text-[9px]" : "h-10 w-20 text-[10px]"} />
            </span>
          )}
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
