import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Bath,
  Bed,
  ChevronLeft,
  ChevronRight,
  Home,
  MapPin,
  Maximize,
  Pause,
  Play,
  Sparkles,
  Tag,
  Upload,
} from "lucide-react";
import type { Listing } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  FALLBACK_IMAGES,
  formatListingPriceShort,
  pickHeroDeckListings,
  pickHeroDeckListingsFresh,
  purposeLabel,
} from "@/lib/homeFeatured";

/** Auto-advance; reshuffles which three listings appear after each full cycle */
const ROTATE_MS = 3800;

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

type Depth = 0 | 1 | 2;

function DeckMetric({
  icon: Icon,
  children,
  title,
}: {
  icon: LucideIcon;
  children: ReactNode;
  title: string;
}) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1.5 rounded-xl bg-white/[0.07] backdrop-blur-md border border-white/[0.14] px-2.5 py-1.5 text-white shadow-[0_4px_24px_-8px_rgba(0,0,0,0.5)]"
    >
      <Icon className="w-3.5 h-3.5 text-brand-amber shrink-0" aria-hidden />
      <span className="text-[11px] font-semibold tabular-nums tracking-tight leading-none">{children}</span>
    </span>
  );
}

/** Outer shell: no transform (avoids square clipping with rounded children). */
function deckShellClass(d: Depth, interactive: boolean) {
  return cn(
    "absolute inset-0 rounded-[2rem]",
    d === 0 && "z-[30]",
    d === 1 && "z-[20]",
    d === 2 && "z-[10]",
    interactive && d === 0 ? "pointer-events-auto" : "pointer-events-none",
  );
}

/**
 * Inner face: all motion + clipping here so corners stay smooth while fanning.
 * Softer angles / offsets reduce jagged edges during transition.
 */
function deckFaceClass(d: Depth, reduceMotion: boolean) {
  return cn(
    "relative h-full w-full rounded-[2rem] overflow-hidden border shadow-[0_32px_80px_-24px_rgba(0,0,0,0.55)]",
    reduceMotion ? "transition-none" : "transition-[transform,opacity] duration-500 ease-out",
    "[backface-visibility:hidden] [transform:translate3d(0,0,0)]",
    "origin-[50%_92%]",
    d === 0 &&
      "translate-x-0 translate-y-0 rotate-0 scale-100 opacity-100 border-white/12 bg-card",
    d === 1 &&
      "border-white/[0.07] bg-[#0c0c0c] -translate-x-[4%] sm:-translate-x-[5%] translate-y-[2%] sm:translate-y-[2.5%] -rotate-[2deg] sm:-rotate-[2.5deg] scale-[0.96] opacity-[0.94]",
    d === 2 &&
      "border-white/[0.06] bg-[#080808] translate-x-[4%] sm:translate-x-[5%] translate-y-[3%] sm:translate-y-[4%] rotate-[2deg] sm:rotate-[2.5deg] scale-[0.93] opacity-[0.9]",
  );
}

function DeckCard({
  listing,
  depth,
  interactive,
  reduceMotion,
}: {
  listing: Listing;
  depth: Depth;
  interactive: boolean;
  reduceMotion: boolean;
}) {
  const img = listing.images?.[0];
  const back = depth !== 0;

  return (
    <Link
      to={`/listing/${encodeURIComponent(listing.id)}`}
      className={cn(
        "block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45 focus-visible:ring-inset",
        deckShellClass(depth, interactive),
      )}
      aria-hidden={depth !== 0}
      tabIndex={depth === 0 ? 0 : -1}
    >
      <div className={deckFaceClass(depth, reduceMotion)}>
        <div className="absolute inset-0 bg-gradient-to-b from-primary/50 via-primary/35 to-[#0a0a0a]" />
        <div
          className={cn(
            "absolute inset-0 opacity-40",
            !reduceMotion && "transition-opacity duration-500",
            !back && interactive && "hover:opacity-45",
            back && "opacity-[0.35]",
          )}
          style={{
            backgroundColor: "#0a0a0a",
            backgroundImage: img ? `url('${img}')` : undefined,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div
          className={cn(
            "absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/35 to-transparent",
            back && "from-[#0a0a0a] via-[#0a0a0a]/50",
          )}
        />

        <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="inline-flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-full bg-brand-amber text-[#0f0f0f] text-[10px] font-bold uppercase tracking-wide shadow-sm">
              <Tag className="w-3 h-3 shrink-0 opacity-90" aria-hidden />
              {purposeLabel(listing)}
            </span>
            <span className="inline-flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-full bg-white/[0.12] backdrop-blur-md border border-white/20 text-white/95 text-[10px] font-semibold shadow-[0_4px_20px_-6px_rgba(0,0,0,0.45)]">
              <Home className="w-3 h-3 shrink-0 text-brand-amber" aria-hidden />
              {listing.propertyType || "Property"}
            </span>
          </div>

          <p className="text-[9px] uppercase tracking-[0.2em] text-white/45 font-semibold mb-1 font-body">
            {listing.purpose === "rent" ? "Annual rent" : "Asking price"}
          </p>
          <div className="text-xl sm:text-2xl font-heading font-semibold text-white mb-3 tracking-tight drop-shadow-sm">
            {formatListingPriceShort(listing)}
          </div>

          <div className="flex items-start gap-2 mb-3 text-white/70 text-xs sm:text-sm font-body line-clamp-2 leading-snug">
            <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white/[0.08] border border-white/15">
              <MapPin className="w-3.5 h-3.5 text-brand-amber" aria-hidden />
            </span>
            <span>{listing.community || listing.city || listing.address || "Location TBC"}</span>
          </div>

          {(listing.beds > 0 || listing.baths > 0 || listing.area > 0) && (
            <div className="flex flex-wrap items-center gap-2">
              {listing.beds > 0 && (
                <DeckMetric icon={Bed} title={`${listing.beds} bedrooms`}>
                  {listing.beds}
                </DeckMetric>
              )}
              {listing.baths > 0 && (
                <DeckMetric icon={Bath} title={`${listing.baths} bathrooms`}>
                  {listing.baths}
                </DeckMetric>
              )}
              {listing.area > 0 && (
                <DeckMetric icon={Maximize} title={`Area ${listing.area.toLocaleString()} ${listing.areaUnit || "sqft"}`}>
                  <>
                    {listing.area.toLocaleString()}
                    <span className="text-white/55 font-medium"> {listing.areaUnit || "sqft"}</span>
                  </>
                </DeckMetric>
              )}
            </div>
          )}
        </div>

        {depth === 0 && (
          <div className="absolute top-4 right-4 sm:top-5 sm:right-5 pointer-events-none">
            <div className="w-9 h-9 rounded-full bg-brand-amber flex items-center justify-center shadow-lg transition-transform duration-300 group-hover:scale-105 ring-2 ring-black/20">
              <ArrowUpRight className="w-4 h-4 text-[#0f0f0f]" />
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}

function DeckCarouselToolbar({
  reduceMotion,
  userPaused,
  onTogglePause,
  onPrev,
  onNext,
}: {
  reduceMotion: boolean;
  userPaused: boolean;
  onTogglePause: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div
      role="group"
      aria-label="Featured cards controls"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          onPrev();
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          onNext();
        }
      }}
      className="flex flex-wrap items-center justify-center gap-2 mb-2 outline-none focus-visible:ring-2 focus-visible:ring-white/35 rounded-xl"
    >
      <button
        type="button"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 border border-white/20 text-white hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45"
        onClick={onPrev}
        aria-label="Previous card"
      >
        <ChevronLeft className="w-4 h-4" aria-hidden />
      </button>
      {!reduceMotion && (
        <button
          type="button"
          className="inline-flex h-9 px-3 items-center justify-center gap-1.5 rounded-full bg-white/10 border border-white/20 text-white text-xs font-semibold hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45"
          onClick={onTogglePause}
          aria-pressed={userPaused}
          aria-label={userPaused ? "Resume automatic rotation" : "Pause automatic rotation"}
        >
          {userPaused ? <Play className="w-3.5 h-3.5" aria-hidden /> : <Pause className="w-3.5 h-3.5" aria-hidden />}
          {userPaused ? "Play" : "Pause"}
        </button>
      )}
      <button
        type="button"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 border border-white/20 text-white hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45"
        onClick={onNext}
        aria-label="Next card"
      >
        <ChevronRight className="w-4 h-4" aria-hidden />
      </button>
    </div>
  );
}

function FallbackStack() {
  const urls = [FALLBACK_IMAGES.hero, FALLBACK_IMAGES.wide, FALLBACK_IMAGES.cta];
  const [offset, setOffset] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const reduceMotion = usePrefersReducedMotion();
  const autoplayPaused = reduceMotion || userPaused || focusWithin;

  useEffect(() => {
    if (autoplayPaused) return;
    const t = window.setInterval(() => setOffset((o) => (o + 1) % 3), ROTATE_MS);
    return () => clearInterval(t);
  }, [autoplayPaused]);

  const bump = (delta: number) => setOffset((o) => (o + delta + 3) % 3);

  return (
    <div
      className="relative w-full max-w-[420px] lg:max-w-none mx-auto lg:mx-0 pb-2 overflow-visible"
      aria-roledescription="carousel"
      aria-label="Preview listing stack"
      onFocusCapture={() => setFocusWithin(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocusWithin(false);
      }}
    >
      <DeckCarouselToolbar
        reduceMotion={reduceMotion}
        userPaused={userPaused}
        onTogglePause={() => setUserPaused((p) => !p)}
        onPrev={() => bump(-1)}
        onNext={() => bump(1)}
      />
      <div className="relative w-full aspect-[4/5] lg:aspect-[3/4] isolate overflow-visible">
        <div className="absolute inset-0">
          {urls.map((url, i) => {
            const d = ((i - offset + 3) % 3) as Depth;
            const back = d !== 0;
            return (
              <div key={url} className={deckShellClass(d, d === 0)}>
                <div className={deckFaceClass(d, reduceMotion)}>
                  <div className="absolute inset-0 bg-gradient-to-b from-primary/50 via-primary/35 to-[#0a0a0a]" />
                  <div
                    className={cn("absolute inset-0 bg-[#0a0a0a]", back ? "opacity-[0.32]" : "opacity-35")}
                    style={{ backgroundImage: `url('${url}')`, backgroundSize: "cover", backgroundPosition: "center" }}
                  />
                  <div
                    className={cn(
                      "absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/30 to-transparent",
                      back && "via-[#0a0a0a]/45",
                    )}
                  />
                  {d === 0 && (
                    <>
                      <div className="absolute top-4 left-4 sm:top-5 sm:left-5 pointer-events-none">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-black/35 backdrop-blur-md border border-white/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/90">
                          <Sparkles className="w-3 h-3 text-brand-amber" aria-hidden />
                          Preview
                        </span>
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 p-6">
                        <div className="flex items-center gap-2 mb-3 flex-wrap">
                          <span className="inline-flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-full bg-brand-amber text-[#0f0f0f] text-[10px] font-bold uppercase tracking-wide shadow-sm">
                            <Tag className="w-3 h-3 shrink-0 opacity-90" aria-hidden />
                            Sample
                          </span>
                          <span className="inline-flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-full bg-white/[0.12] backdrop-blur-md border border-white/20 text-white/95 text-[10px] font-semibold">
                            <Upload className="w-3 h-3 shrink-0 text-brand-amber" aria-hidden />
                            Import to load
                          </span>
                        </div>
                        <p className="text-[9px] uppercase tracking-[0.2em] text-white/45 font-semibold mb-1 font-body">Your feed</p>
                        <div className="text-2xl font-heading font-semibold text-white mb-3 tracking-tight drop-shadow-sm">Listings here</div>
                        <div className="flex items-start gap-2 mb-3 text-white/70 text-sm font-body">
                          <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white/[0.08] border border-white/15">
                            <MapPin className="w-3.5 h-3.5 text-brand-amber" aria-hidden />
                          </span>
                          <span className="leading-snug">Import XML to map communities, prices, and media.</span>
                        </div>
                        <div className="flex flex-wrap gap-2 mb-4">
                          <DeckMetric icon={Bed} title="Bedrooms from your feed">
                            3+
                          </DeckMetric>
                          <DeckMetric icon={Bath} title="Bathrooms from your feed">
                            2+
                          </DeckMetric>
                          <DeckMetric icon={Maximize} title="Areas from your feed">
                            From feed
                          </DeckMetric>
                        </div>
                        <Link
                          to="/import"
                          className="inline-flex items-center gap-2 text-brand-amber text-sm font-semibold hover:underline"
                        >
                          Import XML <ArrowUpRight className="w-4 h-4" />
                        </Link>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="mt-3 text-center lg:text-left text-[10px] text-primary-foreground/45 uppercase tracking-widest font-body">
        {reduceMotion
          ? "Preview stack · reduced motion"
          : userPaused || focusWithin
            ? "Preview stack · rotation paused"
            : "Preview stack · auto-advance"}
      </p>
    </div>
  );
}

interface Props {
  listings: Listing[];
  /** Bumps deck when imports change */
  deckVersion: string;
}

export function HomeHeroDeck({ listings, deckVersion }: Props) {
  const listingsRef = useRef(listings);
  listingsRef.current = listings;
  const reduceMotion = usePrefersReducedMotion();

  const pickKey = useMemo(
    () =>
      `${deckVersion}|${listings
        .filter((l) => Boolean(l?.images?.[0]))
        .map((l) => l.id)
        .sort()
        .join(",")}`,
    [deckVersion, listings],
  );

  const [deckTriple, setDeckTriple] = useState<Listing[]>(() => pickHeroDeckListings(listings));
  const [offset, setOffset] = useState(() => Math.floor(Math.random() * 3));
  const [userPaused, setUserPaused] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const autoplayPaused = reduceMotion || userPaused || focusWithin;

  useEffect(() => {
    setDeckTriple(pickHeroDeckListings(listingsRef.current));
    setOffset(Math.floor(Math.random() * 3));
  }, [pickKey]);

  useEffect(() => {
    if (deckTriple.length < 3 || autoplayPaused) return;
    const id = window.setInterval(() => {
      setOffset((o) => {
        const next = (o + 1) % 3;
        if (next === 0) {
          // Never call setDeckTriple inside setOffset — it triggers render-phase updates / max depth errors.
          queueMicrotask(() => {
            setDeckTriple((prev) => {
              const L = listingsRef.current;
              const exclude = prev.length ? new Set(prev.map((p) => p.id)) : undefined;
              return pickHeroDeckListingsFresh(L, exclude);
            });
          });
        }
        return next;
      });
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, [deckTriple.length, pickKey, autoplayPaused]);

  const bumpOffset = (delta: number) => {
    setOffset((o) => {
      const next = (o + delta + 3) % 3;
      if (delta > 0 && next === 0) {
        queueMicrotask(() => {
          setDeckTriple((prev) => {
            const L = listingsRef.current;
            const exclude = prev.length ? new Set(prev.map((p) => p.id)) : undefined;
            return pickHeroDeckListingsFresh(L, exclude);
          });
        });
      }
      return next;
    });
  };

  if (deckTriple.length < 3) {
    return <FallbackStack />;
  }

  const [a, b, c] = deckTriple;
  if (!a || !b || !c) {
    return <FallbackStack />;
  }

  const frontListing = [a, b, c][offset]!;

  return (
    <div
      className="relative w-full max-w-[420px] lg:max-w-none mx-auto lg:mx-0 pb-2 overflow-visible group"
      aria-roledescription="carousel"
      aria-label="Featured listings from your workspace, stacked cards"
      onFocusCapture={() => setFocusWithin(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocusWithin(false);
      }}
    >
      <DeckCarouselToolbar
        reduceMotion={reduceMotion}
        userPaused={userPaused}
        onTogglePause={() => setUserPaused((p) => !p)}
        onPrev={() => bumpOffset(-1)}
        onNext={() => bumpOffset(1)}
      />
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        Featured card {offset + 1} of 3: {frontListing.title || frontListing.reference || frontListing.id}
      </span>
      <div className="relative w-full aspect-[4/5] lg:aspect-[3/4] isolate overflow-visible">
        <div className="absolute inset-0">
          <DeckCard
            listing={a}
            depth={((0 - offset + 3) % 3) as Depth}
            interactive={((0 - offset + 3) % 3) === 0}
            reduceMotion={reduceMotion}
          />
          <DeckCard
            listing={b}
            depth={((1 - offset + 3) % 3) as Depth}
            interactive={((1 - offset + 3) % 3) === 0}
            reduceMotion={reduceMotion}
          />
          <DeckCard
            listing={c}
            depth={((2 - offset + 3) % 3) as Depth}
            interactive={((2 - offset + 3) % 3) === 0}
            reduceMotion={reduceMotion}
          />
        </div>
      </div>
      <p className="mt-3 text-center lg:text-left text-[10px] text-primary-foreground/45 uppercase tracking-widest font-body">
        {reduceMotion
          ? "Featured stack · reduced motion"
          : userPaused || focusWithin
            ? "Featured stack · rotation paused"
            : "Random picks · smooth fan rotation"}
      </p>
    </div>
  );
}
