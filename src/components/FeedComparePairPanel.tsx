import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  crossImportPairKindBadgeVariant,
  crossImportPairKindLabel,
  formatListingFieldForDiff,
  getListingCriteriaMetrics,
  type CrossImportPair,
} from "@/lib/crossImportCompare";
import { formatPriceCompact } from "@/lib/displayPrice";
import { ALL_LISTING_DISPLAY_KEYS } from "@/lib/importAnalysis";
import type { Listing } from "@/lib/types";
import { UI_FIELDS } from "@/lib/types";
import { GitStyleDiffBlock } from "@/components/GitStyleDiffBlock";
import { diffPlainText } from "@/lib/textLineDiff";
import { ListingImageUrlGrid } from "@/components/ListingImageUrlGrid";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from "@/components/ui/carousel";
import { cn } from "@/lib/utils";
import {
  Bed,
  Bath,
  ChevronDown,
  Code2,
  Columns2,
  ExternalLink,
  FileText,
  GitBranch,
  ImageIcon,
  LayoutList,
  ListTree,
  MapPin,
  Rows3,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const fieldLabel = (k: keyof Listing) => UI_FIELDS.find((f) => f.key === k)?.label ?? String(k);

function listingDetailPath(id: string) {
  return `/listing/${encodeURIComponent(id)}`;
}

function CriteriaBadges({ a, b }: { a: Listing; b: Listing }) {
  const ma = getListingCriteriaMetrics(a);
  const mb = getListingCriteriaMetrics(b);
  const items: { label: string; va: string | number; vb: string | number; delta?: number }[] = [
    { label: "Images", va: ma.images, vb: mb.images, delta: mb.images - ma.images },
    { label: "Amenities", va: ma.amenities, vb: mb.amenities, delta: mb.amenities - ma.amenities },
    { label: "Title chars", va: ma.titleChars, vb: mb.titleChars, delta: mb.titleChars - ma.titleChars },
    { label: "Description chars", va: ma.descriptionChars, vb: mb.descriptionChars, delta: mb.descriptionChars - ma.descriptionChars },
    { label: "Raw XML chars", va: ma.rawXmlChars, vb: mb.rawXmlChars, delta: mb.rawXmlChars - ma.rawXmlChars },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => (
        <Badge key={it.label} variant="outline" className="tabular-nums font-normal gap-1 py-1 px-2">
          <span className="text-muted-foreground">{it.label}:</span>
          <span>{it.va}</span>
          <span className="text-muted-foreground" aria-hidden>
            →
          </span>
          <span>{it.vb}</span>
          {it.delta !== 0 && (
            <span className={cn(it.delta! > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>
              ({it.delta! > 0 ? "+" : ""}
              {it.delta})
            </span>
          )}
        </Badge>
      ))}
    </div>
  );
}

/** Side A = cool tint, side B = green tint — consistent across field tables. */
const colToneA = "bg-sky-500/[0.08] dark:bg-sky-950/40 border-sky-500/15";
const colToneB = "bg-emerald-500/[0.08] dark:bg-emerald-950/40 border-emerald-500/15";

/** Partitions `ALL_LISTING_DISPLAY_KEYS` into labeled sections (feed compare “All fields”). */
const LISTING_FIELD_GROUPS: readonly { id: string; label: string; keys: readonly (keyof Listing)[] }[] = [
  {
    id: "identity",
    label: "Identity & description",
    keys: ["reference", "title", "description", "purpose", "propertyType"],
  },
  {
    id: "pricing",
    label: "Pricing & terms",
    keys: [
      "price",
      "priceOnApplication",
      "currency",
      "paymentMethod",
      "downPaymentPrice",
      "serviceCharge",
      "cheques",
    ],
  },
  {
    id: "size",
    label: "Size & layout",
    keys: ["beds", "baths", "area", "areaUnit", "plotSize", "floor", "stories"],
  },
  {
    id: "location",
    label: "Location & building",
    keys: [
      "address",
      "subCommunity",
      "community",
      "city",
      "propertyName",
      "developer",
      "buildYear",
      "latitude",
      "longitude",
    ],
  },
  {
    id: "media",
    label: "Media & links",
    keys: ["images", "amenities", "view360", "videoTourUrl", "floorPlanUrl"],
  },
  { id: "agent", label: "Agent", keys: ["agent"] },
  {
    id: "meta",
    label: "Compliance & updates",
    keys: ["furnished", "parking", "completionStatus", "permitNumber", "lastUpdate"],
  },
  { id: "raw", label: "Source XML", keys: ["rawXml"] },
] as const;

if (import.meta.env.DEV) {
  const flat = LISTING_FIELD_GROUPS.flatMap((g) => g.keys);
  const exp = ALL_LISTING_DISPLAY_KEYS as readonly (keyof Listing)[];
  const setFlat = new Set(flat);
  if (flat.length !== setFlat.size || flat.length !== exp.length) {
    throw new Error("LISTING_FIELD_GROUPS must list each ALL_LISTING_DISPLAY_KEYS entry exactly once.");
  }
  for (const k of exp) {
    if (!setFlat.has(k)) throw new Error(`LISTING_FIELD_GROUPS missing key: ${String(k)}`);
  }
}

function FieldValueCell({
  listing,
  fieldKey,
  tone,
}: {
  listing: Listing;
  fieldKey: keyof Listing;
  tone: "a" | "b";
}) {
  const wrap = cn("min-w-0 min-h-[2.5rem] border-l border-transparent p-2.5 text-sm", tone === "a" ? colToneA : colToneB);

  if (fieldKey === "images") {
    return (
      <div className={cn(wrap, "min-h-[4rem]")}>
        <ListingImageUrlGrid urls={listing.images ?? []} />
      </div>
    );
  }

  if (fieldKey === "amenities") {
    const arr = listing.amenities ?? [];
    if (!arr.length) {
      return <div className={cn(wrap, "text-muted-foreground")}>—</div>;
    }
    return (
      <div className={cn(wrap, "flex flex-wrap gap-1.5")}>
        {arr.map((x, i) => (
          <Badge key={i} variant="secondary" className="text-[10px] font-normal leading-tight">
            {x}
          </Badge>
        ))}
      </div>
    );
  }

  if (fieldKey === "agent") {
    const a = listing.agent;
    const hasAny =
      a &&
      (a.name?.trim() || a.phone?.trim() || a.email?.trim() || a.photo?.trim());
    if (!hasAny) {
      return <div className={cn(wrap, "text-muted-foreground")}>—</div>;
    }
    return (
      <div className={cn(wrap, "space-y-2")}>
        <div className="grid grid-cols-[minmax(4rem,auto)_1fr] gap-x-2 gap-y-1.5 text-xs items-baseline">
          <span className="text-muted-foreground font-medium">Name</span>
          <span className="break-words">{a.name?.trim() || "—"}</span>
          <span className="text-muted-foreground font-medium">Phone</span>
          <span className="font-mono break-all tabular-nums">{a.phone?.trim() || "—"}</span>
          <span className="text-muted-foreground font-medium">Email</span>
          {a.email?.trim() ? (
            <a href={`mailto:${a.email.trim()}`} className="text-primary-text underline break-all">
              {a.email.trim()}
            </a>
          ) : (
            <span>—</span>
          )}
        </div>
        {a.photo?.trim() ? (
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/50">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Photo</span>
            <a
              href={a.photo.trim()}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-background/80 p-0.5 shadow-sm"
            >
              <img
                src={a.photo.trim()}
                alt={`Agent photo (${listing.reference || listing.id})`}
                className="h-12 w-12 rounded-full object-cover"
                loading="lazy"
              />
              <ExternalLink className="w-3.5 h-3.5 shrink-0 text-muted-foreground mr-1" aria-hidden />
            </a>
          </div>
        ) : null}
      </div>
    );
  }

  if (fieldKey === "view360" || fieldKey === "videoTourUrl" || fieldKey === "floorPlanUrl") {
    const s = String((listing as unknown as Record<string, unknown>)[fieldKey] ?? "").trim();
    if (!s) {
      return <div className={cn(wrap, "text-muted-foreground")}>—</div>;
    }
    const href = /^https?:\/\//i.test(s) ? s : s.startsWith("//") ? `https:${s}` : `https://${s}`;
    let host = "";
    try {
      host = new URL(href).hostname.replace(/^www\./, "");
    } catch {
      host = "";
    }
    const title =
      fieldKey === "view360" ? "360° tour" : fieldKey === "videoTourUrl" ? "Video tour" : "Floor plan";
    return (
      <div className={cn(wrap, "space-y-1")}>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-start gap-2.5 rounded-lg border border-border/80 bg-muted/35 px-2.5 py-2 text-left transition hover:border-primary/40 hover:bg-muted/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ExternalLink className="w-4 h-4 shrink-0 text-primary-text mt-0.5" aria-hidden />
          <span className="min-w-0 flex-1 space-y-0.5">
            <span className="block text-sm font-medium text-foreground leading-snug">{title}</span>
            {host ? (
              <span className="block text-[10px] text-muted-foreground truncate">{host}</span>
            ) : (
              <span className="block text-[10px] text-muted-foreground line-clamp-2 break-all">{s}</span>
            )}
          </span>
        </a>
      </div>
    );
  }

  if (fieldKey === "rawXml") {
    const s = typeof listing.rawXml === "string" ? listing.rawXml : "";
    if (!s.length) {
      return <div className={cn(wrap, "text-muted-foreground")}>—</div>;
    }
    return (
      <div className={cn(wrap, "max-h-56 overflow-auto")}>
        <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {s.length.toLocaleString()} characters
        </p>
        <pre className="whitespace-pre-wrap break-all font-mono text-[10px] leading-relaxed text-foreground/90">
          {s.length > 4000 ? `${s.slice(0, 4000)}…` : s}
        </pre>
      </div>
    );
  }

  const text = formatListingFieldForDiff(listing, fieldKey);
  return (
    <div
      className={cn(
        wrap,
        "max-h-52 overflow-y-auto whitespace-pre-wrap break-words",
        tone === "a" ? "text-muted-foreground" : "text-foreground",
      )}
    >
      {text}
    </div>
  );
}

function FeedCompareImageSlides({
  images,
  sideLabel,
  testId,
  listingTitle,
}: {
  images: string[];
  sideLabel: string;
  /** Optional hook for e2e (e.g. feed-compare-image-a). */
  testId?: string;
  /** Used for non-decorative image alt text. */
  listingTitle?: string;
}) {
  const slides = useMemo(() => (images || []).filter((u) => typeof u === "string" && u.trim().length > 0), [images]);
  const [api, setApi] = useState<CarouselApi>();
  const [snap, setSnap] = useState(0);

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setSnap(api.selectedScrollSnap());
    onSelect();
    api.on("select", onSelect);
    return () => {
      api.off("select", onSelect);
    };
  }, [api]);

  if (slides.length === 0) {
    return (
      <div
        className="aspect-[16/10] bg-muted relative flex items-center justify-center text-muted-foreground text-xs gap-1"
        data-testid={testId}
      >
        <ImageIcon className="w-5 h-5" aria-hidden />
        <span>No image</span>
        <Badge className="absolute top-2 left-2 text-[10px] z-10" variant="secondary">
          {sideLabel}
        </Badge>
      </div>
    );
  }

  const altBase = (listingTitle || "Listing").trim().slice(0, 100);

  if (slides.length === 1) {
    return (
      <div className="relative aspect-[16/10] bg-muted" data-testid={testId}>
        <img
          src={slides[0]}
          alt={`Photo: ${altBase}`}
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
        />
        <Badge className="absolute top-2 left-2 text-[10px] z-10" variant="secondary">
          {sideLabel}
        </Badge>
      </div>
    );
  }

  return (
    <div className="relative w-full" data-testid={testId}>
      <Carousel
        setApi={setApi}
        opts={{ loop: true, align: "start" }}
        className="w-full"
        aria-label={`${sideLabel} photos`}
      >
        <CarouselContent className="ml-0">
          {slides.map((src, i) => (
            <CarouselItem key={`${src}-${i}`} className="pl-0 basis-full">
              <div className="relative aspect-[16/10] bg-muted">
                <img
                  src={src}
                  alt={`Photo ${i + 1} of ${slides.length}: ${altBase}`}
                  className="absolute inset-0 w-full h-full object-cover"
                  loading={i === 0 ? "eager" : "lazy"}
                />
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        <Badge className="absolute top-2 left-2 z-20 text-[10px] pointer-events-none" variant="secondary">
          {sideLabel}
        </Badge>
        <CarouselPrevious
          type="button"
          className="left-2 top-1/2 z-20 h-8 w-8 -translate-y-1/2 rounded-full border bg-background/95 shadow-sm hover:bg-background"
        />
        <CarouselNext
          type="button"
          className="right-2 top-1/2 z-20 h-8 w-8 -translate-y-1/2 rounded-full border bg-background/95 shadow-sm hover:bg-background"
        />
        <div className="pointer-events-none absolute bottom-2 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] text-white tabular-nums shadow-sm">
          {snap + 1} / {slides.length}
        </div>
      </Carousel>
      <div className="flex justify-center gap-1.5 px-2 pt-2" role="group" aria-label="Jump to photo">
        {slides.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-current={i === snap ? true : undefined}
            aria-label={`Show photo ${i + 1}`}
            className={cn(
              "h-1.5 rounded-full transition-all focus-visible:outline focus-visible:ring-2 focus-visible:ring-ring",
              i === snap ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/35 hover:bg-muted-foreground/55",
            )}
            onClick={() => api?.scrollTo(i)}
          />
        ))}
      </div>
    </div>
  );
}

function MiniListingCard({
  listing,
  sideLabel,
  highlight,
  imageCarouselTestId,
}: {
  listing: Listing;
  sideLabel: string;
  highlight?: boolean;
  imageCarouselTestId?: string;
}) {
  return (
    <Card
      className={cn(
        "overflow-hidden shadow-sm min-w-0 h-full flex flex-col",
        highlight && "ring-2 ring-primary/40",
      )}
    >
      <FeedCompareImageSlides
        images={listing.images ?? []}
        sideLabel={sideLabel}
        testId={imageCarouselTestId}
        listingTitle={listing.title || listing.reference || listing.id}
      />
      <CardContent className="p-3 space-y-2 text-sm flex-1 flex flex-col min-h-0">
        <p className="font-medium line-clamp-2 leading-snug">{listing.title || "—"}</p>
        <p className="text-xs font-mono text-muted-foreground">{listing.reference || listing.id}</p>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-0.5">
            <Bed className="w-3.5 h-3.5" aria-hidden />
            {listing.beds > 0 ? listing.beds : "—"}
          </span>
          <span className="inline-flex items-center gap-0.5">
            <Bath className="w-3.5 h-3.5" aria-hidden />
            {listing.baths > 0 ? listing.baths : "—"}
          </span>
          <span>{formatPriceCompact(listing.price)}</span>
        </div>
        <p className="text-xs text-muted-foreground flex items-start gap-1 line-clamp-2">
          <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden />
          {[listing.community, listing.city].filter(Boolean).join(", ") || "—"}
        </p>
        <p className="text-[10px] text-muted-foreground tabular-nums flex items-center gap-1">
          <ImageIcon className="w-3 h-3" aria-hidden />
          {listing.images?.length ?? 0} image{(listing.images?.length ?? 0) === 1 ? "" : "s"}
        </p>
      </CardContent>
      {(listing.images?.length ?? 0) > 0 ? (
        <div className="border-t border-border/60 bg-gradient-to-b from-muted/30 to-muted/10 px-2 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-1 mb-2">
            All photos ({listing.images!.length})
          </p>
          <div
            className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory scroll-pl-2"
            role="list"
            aria-label="All listing images"
          >
            {listing.images!.map((url, i) => (
              <a
                key={`${url}-${i}`}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                role="listitem"
                className="snap-start h-20 w-28 shrink-0 overflow-hidden rounded-lg border border-border/80 bg-muted shadow-sm transition hover:border-primary/35 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <img
                  src={url}
                  alt={`${listing.title || "Listing"} — photo ${i + 1}`}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </a>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function ChangedFieldsTable({ pair }: { pair: CrossImportPair }) {
  const changedSet = useMemo(() => new Set(pair.changedKeys), [pair.changedKeys]);
  if (pair.changedKeys.length === 0) {
    return <p className="text-sm text-muted-foreground">No differences in compared fields.</p>;
  }
  return (
    <div className="rounded-xl border border-border/80 overflow-hidden bg-border/60 shadow-sm ring-1 ring-black/[0.03]">
      <div className="grid grid-cols-3 gap-px text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <div className="bg-muted/90 px-3 py-2.5 min-w-0">Field</div>
        <div className="bg-muted/90 px-3 py-2.5 min-w-0 text-sky-700 dark:text-sky-300">Before (A)</div>
        <div className="bg-muted/90 px-3 py-2.5 min-w-0 text-emerald-700 dark:text-emerald-300">After (B)</div>
      </div>
      {LISTING_FIELD_GROUPS.map((group) => {
        const keysInSection = group.keys.filter((k) => changedSet.has(k));
        if (!keysInSection.length) return null;
        return (
          <div key={group.id} className="border-t border-border/50 first:border-t-0">
            <div className="grid grid-cols-3 gap-px bg-muted/45">
              <div className="col-span-3 px-3 py-2 text-[11px] font-semibold tracking-wide text-foreground/90">
                {group.label}
              </div>
            </div>
            {keysInSection.map((key) => (
              <div key={key} className="grid grid-cols-3 gap-px text-sm">
                <div className="bg-card px-3 py-2 font-medium text-foreground min-w-0 border-t border-border/50 flex items-start">
                  {fieldLabel(key)}
                </div>
                <div className="min-w-0 border-t border-border/50">
                  <FieldValueCell listing={pair.listingA} fieldKey={key} tone="a" />
                </div>
                <div className="min-w-0 border-t border-border/50">
                  <FieldValueCell listing={pair.listingB} fieldKey={key} tone="b" />
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function AllFieldsTable({ pair }: { pair: CrossImportPair }) {
  const changed = useMemo(() => new Set(pair.changedKeys), [pair.changedKeys]);
  const rawChanged = pair.listingA.rawXml !== pair.listingB.rawXml;
  return (
    <ScrollArea className="h-[min(65vh,620px)] w-full rounded-xl border border-border/80 shadow-sm ring-1 ring-black/[0.03]">
      <div className="min-w-0 w-full max-w-none">
        <div className="grid grid-cols-3 gap-px bg-border/70 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sticky top-0 z-[1] shadow-sm">
          <div className="bg-muted/95 backdrop-blur-sm px-3 py-2.5 min-w-0">Field</div>
          <div className="bg-muted/95 backdrop-blur-sm px-3 py-2.5 min-w-0 text-sky-700 dark:text-sky-300">A</div>
          <div className="bg-muted/95 backdrop-blur-sm px-3 py-2.5 min-w-0 text-emerald-700 dark:text-emerald-300">B</div>
        </div>
        {LISTING_FIELD_GROUPS.map((group) => (
          <div key={group.id} className="border-t border-border/60 first:border-t-0">
            <div className="grid grid-cols-3 gap-px bg-muted/40">
              <div className="col-span-3 px-3 py-2 text-[11px] font-semibold tracking-wide text-foreground/90 border-b border-border/40">
                {group.label}
              </div>
            </div>
            {group.keys.map((key) => {
              const isChanged = key === "rawXml" ? rawChanged : changed.has(key);
              return (
                <div
                  key={key}
                  className={cn(
                    "grid grid-cols-3 gap-px bg-border/70 text-xs",
                    isChanged ? "bg-primary/[0.04]" : "bg-card",
                  )}
                >
                  <div className="px-3 py-2 font-medium flex flex-wrap items-center gap-1.5 min-w-0 border-t border-border/40">
                    {fieldLabel(key)}
                    {isChanged && (
                      <Badge variant="secondary" className="text-[9px] h-4 px-1 shrink-0">
                        diff
                      </Badge>
                    )}
                  </div>
                  <div className="min-w-0 border-t border-border/40">
                    <FieldValueCell listing={pair.listingA} fieldKey={key} tone="a" />
                  </div>
                  <div className="min-w-0 border-t border-border/40">
                    <FieldValueCell listing={pair.listingB} fieldKey={key} tone="b" />
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

export function FeedComparePairPanel({
  pair,
  labelA,
  labelB,
  listingInWorkspace,
  defaultOpen,
}: {
  pair: CrossImportPair;
  labelA: string;
  labelB: string;
  listingInWorkspace: (id: string) => boolean;
  defaultOpen?: boolean;
}) {
  const [layout, setLayout] = useState<"stack" | "split">("split");

  const titleDiff = useMemo(
    () => diffPlainText(pair.listingA.title || "", pair.listingB.title || ""),
    [pair.listingA.title, pair.listingB.title],
  );
  const descDiff = useMemo(
    () => diffPlainText(pair.listingA.description || "", pair.listingB.description || ""),
    [pair.listingA.description, pair.listingB.description],
  );
  const rawXmlDiff = useMemo(
    () => diffPlainText(pair.listingA.rawXml || "", pair.listingB.rawXml || ""),
    [pair.listingA.rawXml, pair.listingB.rawXml],
  );
  const titleTouched = (pair.listingA.title || "") !== (pair.listingB.title || "");
  const descTouched = (pair.listingA.description || "") !== (pair.listingB.description || "");
  const rawXmlTouched = (pair.listingA.rawXml || "") !== (pair.listingB.rawXml || "");

  const aIn = listingInWorkspace(pair.listingA.id);
  const bIn = listingInWorkspace(pair.listingB.id);

  return (
    <Collapsible defaultOpen={defaultOpen ?? false}>
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2.5 min-h-11 text-left hover:bg-accent/40",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        )}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={crossImportPairKindBadgeVariant(pair.kind)}>
              {crossImportPairKindLabel(pair.kind)}
            </Badge>
            <span className="font-medium truncate">
              {pair.listingB.reference || pair.listingA.reference || pair.listingB.title || "Listing"}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {pair.changedKeys.length} field{pair.changedKeys.length === 1 ? "" : "s"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            A ref {pair.listingA.reference || "—"}{" "}
            <span aria-hidden>
              →
            </span>{" "}
            B ref {pair.listingB.reference || "—"}
          </p>
        </div>
        <ChevronDown
          className="w-4 h-4 shrink-0 text-muted-foreground motion-reduce:transition-none"
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3 space-y-3 w-full max-w-none min-w-0">
        <CriteriaBadges a={pair.listingA} b={pair.listingB} />

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 gap-1" asChild>
            <Link to={listingDetailPath(pair.listingA.id)} aria-label={`Open full listing detail for feed A (${pair.listingA.reference || pair.listingA.id})`}>
              <ExternalLink className="w-3.5 h-3.5" aria-hidden />
              Detail A
            </Link>
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1" asChild>
            <Link to={listingDetailPath(pair.listingB.id)} aria-label={`Open full listing detail for feed B (${pair.listingB.reference || pair.listingB.id})`}>
              <ExternalLink className="w-3.5 h-3.5" aria-hidden />
              Detail B
            </Link>
          </Button>
          {!aIn && (
            <span className="text-[10px] text-muted-foreground">Not in the live version.</span>
          )}
          {!bIn && (
            <span className="text-[10px] text-muted-foreground">Not in the live version.</span>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">Preview layout</span>
          <ToggleGroup type="single" value={layout} onValueChange={(v) => v && setLayout(v as "stack" | "split")}>
            <ToggleGroupItem value="split" aria-label="Side by side" className="gap-1 text-xs">
              <Columns2 className="w-3.5 h-3.5" />
              Beside
            </ToggleGroupItem>
            <ToggleGroupItem value="stack" aria-label="Stacked" className="gap-1 text-xs">
              <Rows3 className="w-3.5 h-3.5" />
              Stacked
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div
          className={cn(
            "w-full grid gap-4 md:gap-5 items-stretch",
            layout === "split"
              ? "md:grid-cols-2 md:grid-rows-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] [&>*]:min-w-0"
              : "grid-cols-1",
          )}
        >
          <MiniListingCard listing={pair.listingA} sideLabel={labelA} imageCarouselTestId="feed-compare-image-a" />
          <MiniListingCard listing={pair.listingB} sideLabel={labelB} imageCarouselTestId="feed-compare-image-b" />
        </div>

        <Tabs defaultValue="fields" aria-label="Listing pair detail views">
          <TabsList
            className="grid w-full grid-cols-2 sm:grid-cols-4 gap-1.5 h-auto p-1.5 bg-muted/50"
            aria-label="Choose detail view"
          >
            <TabsTrigger value="fields" className="gap-1.5 text-xs min-h-10 justify-center">
              <LayoutList className="w-3.5 h-3.5 shrink-0" aria-hidden />
              <span className="truncate">Changed ({pair.changedKeys.length})</span>
            </TabsTrigger>
            <TabsTrigger value="git" className="gap-1.5 text-xs min-h-10 justify-center">
              <GitBranch className="w-3.5 h-3.5 shrink-0" aria-hidden />
              <span className="truncate">Text diff</span>
            </TabsTrigger>
            <TabsTrigger value="rawxml" className="gap-1.5 text-xs min-h-10 justify-center">
              <Code2 className="w-3.5 h-3.5 shrink-0" aria-hidden />
              <span className="truncate">Raw XML</span>
            </TabsTrigger>
            <TabsTrigger value="all" className="gap-1.5 text-xs min-h-10 justify-center">
              <ListTree className="w-3.5 h-3.5 shrink-0" aria-hidden />
              <span className="truncate">All fields</span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="fields" className="mt-3">
            <ChangedFieldsTable pair={pair} />
          </TabsContent>
          <TabsContent value="git" className="mt-3 space-y-4">
            <p className="text-xs text-muted-foreground leading-relaxed max-w-prose">
              Line-level diff (− removed, + added, space = context). Rose = before (A), green = after (B). Very large
              texts use a single-line fallback.
            </p>
            {titleTouched ? (
              <GitStyleDiffBlock label="Title" lines={titleDiff.lines} truncated={titleDiff.truncated} fallback={titleDiff.fallback} />
            ) : (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 shrink-0" aria-hidden />
                Title unchanged.
              </p>
            )}
            {descTouched ? (
              <GitStyleDiffBlock
                label="Description"
                lines={descDiff.lines}
                truncated={descDiff.truncated}
                fallback={descDiff.fallback}
              />
            ) : (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 shrink-0" aria-hidden />
                Description unchanged.
              </p>
            )}
            {!titleTouched && !descTouched && (
              <p className="text-sm text-muted-foreground">No title/description text changes; try Raw XML or All fields.</p>
            )}
          </TabsContent>
          <TabsContent value="rawxml" className="mt-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline" className="tabular-nums font-normal">
                A: {(pair.listingA.rawXml || "").length.toLocaleString()} chars
              </Badge>
              <Badge variant="outline" className="tabular-nums font-normal">
                B: {(pair.listingB.rawXml || "").length.toLocaleString()} chars
              </Badge>
              {!rawXmlTouched ? (
                <span className="text-muted-foreground">Raw XML identical.</span>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-prose">
              Full listing node XML from each feed. Same line-diff colors as text: rose = only in A, green = only in B.
            </p>
            {rawXmlTouched ? (
              <GitStyleDiffBlock
                label="Raw XML line diff"
                lines={rawXmlDiff.lines}
                maxHeightClass="max-h-[min(58vh,560px)]"
                truncated={rawXmlDiff.truncated}
                fallback={rawXmlDiff.fallback}
              />
            ) : (
              <p className="text-sm text-muted-foreground">No raw XML difference for this pair.</p>
            )}
          </TabsContent>
          <TabsContent value="all" className="mt-3">
            <p className="text-xs text-muted-foreground mb-2">
              Every listing column including raw XML snippet. Rows marked <Badge variant="secondary" className="text-[9px] h-4 px-1 mx-0.5">diff</Badge>{" "}
              differ between A and B.
            </p>
            <AllFieldsTable pair={pair} />
          </TabsContent>
        </Tabs>
      </CollapsibleContent>
    </Collapsible>
  );
}
