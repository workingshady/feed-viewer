import AppHeader from "@/components/AppHeader";
import { GitStyleDiffBlock } from "@/components/GitStyleDiffBlock";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  analyzeCrossAgencyDuplicates,
  dedupeTaggedListings,
    type CrossAgencyCluster,
  type TaggedListing,
} from "@/lib/crossAgencyDuplicates";
import {
  buildVisibleClustersSummary,
  filterClustersByConfidence,
  filterClustersByMinAgencies,
  filterClustersByMinListings,
  filterClustersByQuery,
  sortClusters,
  type ClusterSort,
  type ConfidenceFilter,
} from "@/lib/crossAgencyDupesDisplay";
import {
  countFuzzyClustersPerNoiseLevel,
  filterFuzzyClustersByNoiseLevel,
  FUZZY_NOISE_LEVEL_UI,
  fuzzyNoiseLevelFromLegacy,
  type FuzzyNoiseFilterLevel,
} from "@/lib/crossAgencyFuzzyLevels";
import { addCompareListingId, prepareCompareTrayFromIds } from "@/lib/compareSelection";
import { diffPlainText } from "@/lib/textLineDiff";
import { formatPriceCompact } from "@/lib/displayPrice";
import { useAppData } from "@/providers/DataProvider";
import { cn } from "@/lib/utils";
import {
  Bath,
  Bed,
  Building2,
  ChevronDown,
  ChevronsDown,
  ChevronsUp,
  Copy,
  ExternalLink,
  FileDiff,
  GitCompare,
  HelpCircle,
  Home,
  ImageIcon,
  Layers,
  Loader2,
  MapPin,
  Maximize,
  ParkingCircle,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Tag,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "@/components/ui/sonner";

type SignalId =
  | "permit"
  | "image"
  | "geo"
  | "geo_wide"
  | "building"
  | "layout"
  | "content"
  | "content_no_desc"
  | "content_near"
  | "fuzzy";

const SIGNAL_GROUPS: {
  id: "strong" | "location" | "heuristics";
  title: string;
  hint: string;
  signals: { id: SignalId; label: string; short: string }[];
}[] = [
  {
    id: "strong",
    title: "Strong evidence",
    hint: "Prefer these when disputing overlaps.",
    signals: [
      { id: "permit", label: "Permit / RERA", short: "Permit" },
      { id: "image", label: "Shared photo URL", short: "Photo" },
    ],
  },
  {
    id: "location",
    title: "Location",
    hint: "Map-based; towers may share one pin.",
    signals: [
      { id: "geo", label: "Map pin (4 dp)", short: "4 dp" },
      { id: "geo_wide", label: "Map area (3 dp)", short: "3 dp" },
    ],
  },
  {
    id: "heuristics",
    title: "Heuristics",
    hint: "Confirm on listing detail.",
    signals: [
      { id: "building", label: "Same building", short: "Building" },
      { id: "layout", label: "Layout + area", short: "Layout" },
      { id: "content", label: "Content (full copy)", short: "Full" },
      { id: "content_no_desc", label: "Content (no description)", short: "No desc" },
      { id: "content_near", label: "Content (near match)", short: "Near" },
      { id: "fuzzy", label: "Full fuzzy", short: "Fuzzy" },
    ],
  },
];

function purposeLabel(p: TaggedListing["listing"]["purpose"]): string {
  if (p === "sale") return "For sale";
  if (p === "rent") return "To rent";
  return "Listing type unknown";
}

function bedsLabel(beds: number): string {
  if (!Number.isFinite(beds) || beds <= 0) return "Studio / n/a";
  return `${beds} bed${beds === 1 ? "" : "s"}`;
}

function bathsLabel(baths: number): string {
  if (!Number.isFinite(baths) || baths <= 0) return "—";
  return `${baths} bath${baths === 1 ? "" : "s"}`;
}

function areaLine(l: TaggedListing["listing"]): string {
  if (!Number.isFinite(l.area) || l.area <= 0) return "—";
  const u = (l.areaUnit || "").trim() || "sqft";
  return `${l.area.toLocaleString()} ${u}`;
}

function tierBadge(tier: CrossAgencyCluster["tier"]) {
  const map: Record<
    CrossAgencyCluster["tier"],
    { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
  > = {
    permit: { label: "Permit / RERA", variant: "default" },
    geo: { label: "Map pin (precise)", variant: "secondary" },
    geo_wide: { label: "Map area (wide)", variant: "outline" },
    image: { label: "Same photo URL", variant: "default" },
    building: { label: "Same building", variant: "secondary" },
    layout: { label: "Layout & location", variant: "outline" },
    content: { label: "Content (full copy)", variant: "outline" },
    content_no_desc: { label: "Content (no description)", variant: "outline" },
    content_near: { label: "Content (near match)", variant: "outline" },
    fuzzy: { label: "Fuzzy (full)", variant: "outline" },
  };
  const x = map[tier];
  return (
    <Badge variant={x.variant} className="shrink-0 font-medium">
      {x.label}
    </Badge>
  );
}

function confidenceBadge(c: CrossAgencyCluster["confidence"]) {
  if (c === "high") {
    return (
      <Badge className="text-[10px] shrink-0 bg-emerald-600 hover:bg-emerald-600 text-white border-0">High</Badge>
    );
  }
  if (c === "medium") {
    return <Badge variant="secondary" className="text-[10px] shrink-0">Medium</Badge>;
  }
  if (c === "medium_low") {
    return (
      <Badge variant="outline" className="text-[10px] shrink-0 border-amber-500/50 text-amber-700 dark:text-amber-400">
        Broad
      </Badge>
    );
  }
  return <Badge variant="outline" className="text-[10px] shrink-0">Review</Badge>;
}

function ListingPhoto({ src, alt }: { src: string; alt: string }) {
  const [err, setErr] = useState(false);
  if (err || !src) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
        <ImageIcon className="w-8 h-8 opacity-40" />
      </div>
    );
  }
  return (
    <img src={src} alt={alt} className="h-full w-full object-cover" loading="lazy" onError={() => setErr(true)} />
  );
}

function CrossAgencyListingCard({ t, nested }: { t: TaggedListing; nested?: boolean }) {
  const l = t.listing;
  const img = l.images?.[0];
  const nImg = l.images?.length ?? 0;
  const nAm = l.amenities?.length ?? 0;

  return (
    <div
      className={cn(
        "border overflow-hidden flex flex-col sm:flex-row",
        nested
          ? "rounded-lg bg-background/95 shadow-none ring-1 ring-inset ring-border/45 border-border/50"
          : "rounded-xl border-border bg-card shadow-sm",
      )}
    >
      <div className="relative w-full sm:w-[168px] shrink-0 aspect-[16/10] sm:aspect-auto sm:min-h-[140px] bg-muted">
        <ListingPhoto
          src={img || ""}
          alt={l.title?.trim() ? `Listing photo: ${l.title.slice(0, 120)}` : "Listing photo"}
        />
        {nImg > 0 && (
          <Badge className="absolute bottom-2 right-2 text-[10px] px-1.5 py-0 h-5 bg-black/65 hover:bg-black/65 text-white border-0">
            {nImg} photo{nImg === 1 ? "" : "s"}
          </Badge>
        )}
      </div>

      <div className="flex-1 min-w-0 p-3 sm:p-4 flex flex-col gap-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="font-semibold max-w-[220px] truncate">
                {t.agencyName}
              </Badge>
              <span className="text-[11px] font-mono text-muted-foreground truncate max-w-[200px]">
                {l.reference || l.id}
              </span>
            </div>
            <h3 className="text-sm sm:text-base font-semibold leading-snug text-foreground line-clamp-2">
              {l.title || "Untitled listing"}
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 justify-end shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1 h-8"
              onClick={() => {
                addCompareListingId(l.id);
                toast.success("Added to compare tray", {
                  description: "Use Compare in the header when at least two listings are selected.",
                });
              }}
            >
              <GitCompare className="w-3.5 h-3.5" aria-hidden />
              Add to compare
            </Button>
            <Button variant="default" size="sm" className="gap-1.5 h-8" asChild>
              <Link to={`/listing/${encodeURIComponent(l.id)}`}>
                <ExternalLink className="w-3.5 h-3.5" aria-hidden />
                Open detail
              </Link>
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="font-normal gap-1">
            <Tag className="w-3 h-3 opacity-70" />
            {l.propertyType?.trim() || "Property type n/a"}
          </Badge>
          <Badge variant="secondary" className="font-normal gap-1">
            <Home className="w-3 h-3 opacity-70" />
            {purposeLabel(l.purpose)}
          </Badge>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="rounded-md bg-muted/50 px-2 py-1.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Rooms</p>
            <p className="font-medium tabular-nums flex items-center gap-1">
              <Bed className="w-3.5 h-3.5 text-muted-foreground" />
              {bedsLabel(l.beds)}
            </p>
          </div>
          <div className="rounded-md bg-muted/50 px-2 py-1.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Bathrooms</p>
            <p className="font-medium tabular-nums flex items-center gap-1">
              <Bath className="w-3.5 h-3.5 text-muted-foreground" />
              {bathsLabel(l.baths)}
            </p>
          </div>
          <div className="rounded-md bg-muted/50 px-2 py-1.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Area</p>
            <p className="font-medium tabular-nums flex items-center gap-1">
              <Maximize className="w-3.5 h-3.5 text-muted-foreground" />
              {areaLine(l)}
            </p>
          </div>
          <div className="rounded-md bg-muted/50 px-2 py-1.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Price</p>
            <p className="font-semibold tabular-nums text-primary-text">{formatPriceCompact(l.price)}</p>
          </div>
        </div>

        <div className="text-xs text-muted-foreground space-y-1">
          {(l.propertyName || l.community || l.subCommunity || l.city) && (
            <p className="flex items-start gap-1.5">
              <Building2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{[l.propertyName, l.subCommunity, l.community, l.city].filter(Boolean).join(" · ") || "—"}</span>
            </p>
          )}
          {l.address ? (
            <p className="flex items-start gap-1.5">
              <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span className="line-clamp-2">{l.address}</span>
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground border-t border-border/60 pt-2">
          {l.permitNumber ? <span>Permit: {l.permitNumber}</span> : null}
          {l.latitude != null && l.longitude != null ? (
            <span className="font-mono tabular-nums">
              {l.latitude.toFixed(5)}, {l.longitude.toFixed(5)}
            </span>
          ) : null}
          {Number.isFinite(l.parking) && l.parking > 0 ? (
            <span className="inline-flex items-center gap-0.5">
              <ParkingCircle className="w-3 h-3" />
              {l.parking} parking
            </span>
          ) : null}
          {l.completionStatus ? <span>{l.completionStatus}</span> : null}
          {l.furnished ? <span>Furnished: {l.furnished}</span> : null}
          {nAm > 0 ? <span>{nAm} amenities</span> : null}
        </div>
      </div>
    </div>
  );
}

function ClusterSection({
  cluster,
  bulkOpen,
}: {
  cluster: CrossAgencyCluster;
  bulkOpen: { version: number; open: boolean };
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [lineDiffOpen, setLineDiffOpen] = useState(false);
  useEffect(() => {
    setOpen(bulkOpen.open);
  }, [bulkOpen.version, bulkOpen.open]);
  const clusterIds = useMemo(() => [...new Set(cluster.items.map((t) => t.listing.id))], [cluster.items]);
  const canCompareCluster = clusterIds.length >= 2;

  const firstSecondLineDiff = useMemo(() => {
    if (cluster.items.length < 2) return null;
    const a = cluster.items[0].listing;
    const b = cluster.items[1].listing;
    return {
      title: diffPlainText(a.title ?? "", b.title ?? ""),
      description: diffPlainText(a.description ?? "", b.description ?? ""),
    };
  }, [cluster.items]);

  const prices = cluster.items.map((t) => t.listing.price).filter((p) => Number.isFinite(p) && p > 0);
  const minP = prices.length ? Math.min(...prices) : null;
  const maxP = prices.length ? Math.max(...prices) : null;
  const priceSpread =
    minP != null && maxP != null && minP !== maxP ? (
      <span className="text-xs text-muted-foreground tabular-nums">
        Price range: {formatPriceCompact(minP)} — {formatPriceCompact(maxP)}
      </span>
    ) : null;

  const tierHints: Partial<Record<CrossAgencyCluster["tier"], string>> = {
    geo: "Precise pin (~11 m). Towers often reuse one pin — compare rooms, title, and permit.",
    geo_wide: "Wider grid (~100 m+). Expect noise; use building name and unit details.",
    image: "Same image URL often means shared marketing assets; verify address and permit.",
    building: "Development name + rooms + type — different units in one tower can collide.",
    layout: "No title in key — copy can differ. False positives in dense areas.",
    content:
      "Strictest: normalized title + description slice + price band + rooms + location (agency excluded). Same pasted marketing copy.",
    content_no_desc:
      "Title + price + rooms + type + location — description is ignored so agencies can rewrite body text while still clustering.",
    content_near:
      "Looser: short title prefix, wide price band, coarse location, 2 dp map — catches same unit with tweaked price or title wording.",
    fuzzy: "Price + beds + location + title — treat as a lead; compare photos and description.",
  };

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn(
        "group/cluster rounded-xl border border-border bg-card text-card-foreground shadow-sm overflow-hidden transition-[box-shadow,border-color,ring]",
        "data-[state=open]:shadow-lg data-[state=open]:ring-1 data-[state=open]:ring-primary/20 data-[state=open]:border-primary/30",
      )}
    >
      <CollapsibleTrigger
        className={cn(
          "flex w-full flex-col gap-2 px-4 py-3.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "hover:bg-muted/40 transition-colors",
          "data-[state=open]:bg-muted/30 data-[state=open]:border-b data-[state=open]:border-border/80",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Duplicate cluster</span>
          <ChevronDown
            className="w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-200 motion-reduce:transition-none group-data-[state=open]/cluster:rotate-180"
            aria-hidden
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {tierBadge(cluster.tier)}
          {confidenceBadge(cluster.confidence)}
        </div>
        <p className="text-sm font-medium text-foreground">{cluster.matchLabel}</p>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Layers className="w-3.5 h-3.5" />
            <strong className="text-foreground">{cluster.agencies.length}</strong> agencies
          </span>
          <Separator orientation="vertical" className="h-3 hidden sm:block" aria-hidden />
          <span>
            <strong className="text-foreground">{cluster.items.length}</strong> listings
          </span>
          {priceSpread ? (
            <>
              <Separator orientation="vertical" className="h-3 hidden md:block" aria-hidden />
              <span className="hidden md:inline">{priceSpread}</span>
            </>
          ) : null}
        </div>
        <div className="rounded-md bg-muted/60 px-2 py-1.5 overflow-x-auto border border-border/50">
          <code className="text-[10px] sm:text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all">
            {cluster.matchKey}
          </code>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t border-border/80 bg-gradient-to-b from-muted/30 via-muted/15 to-background/40">
        <div className="p-3 sm:p-4 space-y-3" role="region" aria-label="Listings in this cluster">
          {priceSpread ? <div className="md:hidden text-xs text-muted-foreground">{priceSpread}</div> : null}
          <div className="rounded-lg border border-dashed border-border/60 bg-muted/10 px-2 py-2 sm:px-3 space-y-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground px-1">
              Composed match — {cluster.items.length} listing{cluster.items.length === 1 ? "" : "s"} from{" "}
              {cluster.agencies.length} agencies
            </p>
            {cluster.items.map((t) => (
              <CrossAgencyListingCard key={`${t.sessionId}-${t.listing.id}`} t={t} nested />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 px-1 pt-1">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="gap-1.5 h-8"
              disabled={!canCompareCluster}
              title={
                canCompareCluster
                  ? "Load up to four listings into the header compare tray and go to Listing compare"
                  : "This cluster needs at least two listings"
              }
              onClick={() => {
                if (!prepareCompareTrayFromIds(clusterIds)) {
                  toast.error("Need at least two listings", { description: "Pick another cluster or add listings from the workspace." });
                  return;
                }
                toast.success("Opening listing compare", {
                  description: `Comparing ${Math.min(4, clusterIds.length)} listing${clusterIds.length === 1 ? "" : "s"}.`,
                });
                navigate("/compare");
              }}
            >
              <GitCompare className="w-3.5 h-3.5" aria-hidden />
              Compare these listings
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5 h-8"
              disabled={cluster.items.length < 2}
              title={
                cluster.items.length >= 2
                  ? "Git-style line diff for title and description between the first two cards in this cluster"
                  : "Need at least two listings"
              }
              onClick={() => setLineDiffOpen(true)}
            >
              <FileDiff className="w-3.5 h-3.5" aria-hidden />
              Line diff (1st vs 2nd)
            </Button>
            <Dialog open={lineDiffOpen} onOpenChange={setLineDiffOpen}>
              <DialogContent className="max-w-3xl max-h-[min(90vh,880px)] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Line diff — first vs second listing</DialogTitle>
                  <DialogDescription>
                    Unified diff (− removed, + added) for raw title and description text, in the same order as the cards above.
                  </DialogDescription>
                </DialogHeader>
                {firstSecondLineDiff ? (
                  <div className="space-y-4 pt-1">
                    <GitStyleDiffBlock
                      label="Title"
                      lines={firstSecondLineDiff.title.lines}
                      truncated={firstSecondLineDiff.title.truncated}
                      fallback={firstSecondLineDiff.title.fallback}
                      maxHeightClass="max-h-40"
                    />
                    <GitStyleDiffBlock
                      label="Description"
                      lines={firstSecondLineDiff.description.lines}
                      truncated={firstSecondLineDiff.description.truncated}
                      fallback={firstSecondLineDiff.description.fallback}
                    />
                  </div>
                ) : null}
              </DialogContent>
            </Dialog>
            <span className="text-[11px] text-muted-foreground hidden sm:inline">
              Uses the same tray as <span className="font-medium text-foreground">Compare</span> in the header (2–4 ids).
            </span>
          </div>
          {tierHints[cluster.tier] ? (
            <p className="text-xs text-muted-foreground leading-relaxed border-l-2 border-primary/35 pl-3 pt-1">
              {tierHints[cluster.tier]}
            </p>
          ) : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function TabScroll({ children }: { children: ReactNode }) {
  return (
    <section
      className="min-w-0"
      aria-labelledby="dupes-cluster-results-heading"
    >
      <h3 id="dupes-cluster-results-heading" className="sr-only">
        Duplicate clusters for the selected match type
      </h3>
      <ScrollArea className="h-[min(70vh,760px)] xl:h-[calc(100vh-14rem)] min-h-[320px] pr-3">
        <div className="space-y-4 pb-6">{children}</div>
      </ScrollArea>
    </section>
  );
}

function clustersForSignal(
  signal: SignalId,
  report: NonNullable<ReturnType<typeof analyzeCrossAgencyDuplicates>>,
  fuzzyFiltered: CrossAgencyCluster[],
): CrossAgencyCluster[] {
  switch (signal) {
    case "permit":
      return report.permitClusters;
    case "image":
      return report.imageUrlClusters;
    case "geo":
      return report.geoClusters;
    case "geo_wide":
      return report.geoWideClusters;
    case "building":
      return report.buildingClusters;
    case "layout":
      return report.layoutClusters;
    case "content":
      return report.contentClusters;
    case "content_no_desc":
      return report.contentNoDescClusters;
    case "content_near":
      return report.contentNearClusters;
    case "fuzzy":
      return fuzzyFiltered;
    default:
      return [];
  }
}

const SIGNAL_QUICK_LABEL: Record<SignalId, string> = {
  permit: "Permit",
  image: "Photo",
  geo: "4 dp",
  geo_wide: "3 dp",
  building: "Building",
  layout: "Layout",
  content: "Full",
  content_no_desc: "No desc",
  content_near: "Near",
  fuzzy: "Fuzzy",
};

/** Shown on hover for each match type (sidebar, chips, mobile picker via title). */
const SIGNAL_TOOLTIPS: Record<SignalId, string> = {
  permit:
    "Matches when two or more agencies list the same normalized permit / RERA number. Strongest legal-inventory signal when feeds include it.",
  image:
    "Matches when the first listing photo uses the same URL (after normalizing: no query string, same host and path). Often the same marketing image across portals.",
  geo:
    "Matches listings that share latitude and longitude rounded to 4 decimal places (~11 m). Good for identical pins; towers may use one pin for many units.",
  geo_wide:
    "Same as map match but only 3 decimal places (~100 m+). Catches slight coordinate drift between feeds; expect more false positives.",
  building:
    "Matches on development name, community context, property type, sale/rent, and bedroom/bathroom counts. Different units in the same tower can cluster together.",
  layout:
    "Matches on property type, purpose, rooms, coarse area band, and location text — title is not used. Useful when agencies rewrite descriptions but inventory is similar.",
  content:
    "Matches when normalized title, description slice, price band, purpose, rooms, property type, and location text align into the same fingerprint (agency excluded). Strongest when copy is pasted verbatim.",
  content_no_desc:
    "Same as content matching but the description field is not used — only title, price band, rooms, type, and location. Use when agencies rewrite the body but keep the same headline and facts.",
  content_near:
    "Broader: loose price bucket, first ~48 chars of normalized title, shorter location blob, 2 decimal map grid. Expect more false positives; confirm on listing detail.",
  fuzzy:
    "Matches on price band, bedrooms, location fields, and a slice of the title. Broadest heuristic; use after stronger signals or to cast a wide net.",
};

function signalFullLabel(id: SignalId): string {
  for (const g of SIGNAL_GROUPS) {
    const s = g.signals.find((x) => x.id === id);
    if (s) return s.label;
  }
  return SIGNAL_QUICK_LABEL[id];
}

const WORKFLOW_TOOLTIPS: Record<
  "import" | "agencies" | "listingCompare" | "feed" | "validation" | "refresh" | "fuzzyLevels",
  string
> = {
  import: "Upload or paste XML feeds. Each import is stored with its agency name for cross-agency matching.",
  agencies: "See which agencies you have imported and open agency-level listing views.",
  listingCompare:
    "Side-by-side field comparison for 2–4 listings from your workspace (same screen as the compare tray in the header).",
  feed: "Compare two feeds side by side (same or different sessions) with field-level diffs.",
  validation: "Charts and filters for import health, duplicates, and data-quality issues in the active dataset.",
  refresh: "Reload listings from all saved import sessions and the current workspace.",
  fuzzyLevels:
    "Choose how many stronger cross-agency signals (permit, map, photo, building, layout, content tiers, …) must “explain” a listing before its fuzzy cluster is hidden. Higher levels hide more fuzzy noise.",
};

function SignalTooltip({ signalId, side, children }: { signalId: SignalId; side?: "top" | "right" | "bottom" | "left"; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side ?? "right"} className="max-w-[min(100vw-2rem,20rem)] text-xs leading-relaxed">
        <p className="font-medium text-foreground mb-1">{signalFullLabel(signalId)}</p>
        <p className="text-muted-foreground">{SIGNAL_TOOLTIPS[signalId]}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function WorkflowTooltip({ tip, children }: { tip: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[min(100vw-2rem,18rem)] text-xs leading-relaxed">
        {tip}
      </TooltipContent>
    </Tooltip>
  );
}

function emptyMessage(signal: SignalId): string {
  const m: Record<SignalId, string> = {
    permit: "No cross-agency permit matches in stored imports.",
    image: "No matches on the first listing image URL.",
    geo: "No precise coordinate matches, or geo is missing.",
    geo_wide: "No wider-grid matches, or geo is missing.",
    building: "No building-level matches (needs development / property name).",
    layout: "No layout matches (needs location fields).",
    content: "No full-copy content matches (needs enough title/description text to fingerprint).",
    content_no_desc: "No content matches without description (needs title or location text).",
    content_near: "No near-duplicate content matches (needs title + location + coordinates for best results).",
    fuzzy: "No fuzzy clusters, or all were hidden by the filter.",
  };
  return m[signal];
}

const DUPES_PREFS_KEY = "crossAgencyDupes:v1";

type DupesPrefsStored = {
  v: 1;
  clusterSort: ClusterSort;
  minAgencies: 2 | 3 | 4;
  minListings: number;
  fuzzyNoiseFilterLevel: FuzzyNoiseFilterLevel;
  /** @deprecated migrated to fuzzyNoiseFilterLevel */
  hideNoise?: boolean;
  confidenceFilter: ConfidenceFilter;
  activeSignal: SignalId;
};

function loadDupesPrefs(): Partial<Omit<DupesPrefsStored, "v">> | null {
  try {
    const raw = localStorage.getItem(DUPES_PREFS_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as DupesPrefsStored;
    if (j.v !== 1) return null;
    return {
      clusterSort: j.clusterSort,
      minAgencies: j.minAgencies,
      minListings: j.minListings,
      fuzzyNoiseFilterLevel: fuzzyNoiseLevelFromLegacy(j.hideNoise, j.fuzzyNoiseFilterLevel),
      confidenceFilter: j.confidenceFilter,
      activeSignal: j.activeSignal,
    };
  } catch {
    return null;
  }
}

function saveDupesPrefs(p: Omit<DupesPrefsStored, "v">) {
  try {
    localStorage.setItem(DUPES_PREFS_KEY, JSON.stringify({ v: 1, ...p }));
  } catch {
    /* ignore quota / private mode */
  }
}

export default function CrossAgencyDupesPage() {
  const initialPrefs = typeof window !== "undefined" ? loadDupesPrefs() : null;
  const [report, setReport] = useState<ReturnType<typeof analyzeCrossAgencyDuplicates> | null>(null);
  const [fuzzyNoiseFilterLevel, setFuzzyNoiseFilterLevel] = useState<FuzzyNoiseFilterLevel>(
    () => initialPrefs?.fuzzyNoiseFilterLevel ?? "off",
  );
  const [activeSignal, setActiveSignal] = useState<SignalId>(() => initialPrefs?.activeSignal ?? "permit");
  const [clusterSort, setClusterSort] = useState<ClusterSort>(() => initialPrefs?.clusterSort ?? "agencies");
  const [minAgencies, setMinAgencies] = useState<2 | 3 | 4>(() => initialPrefs?.minAgencies ?? 2);
  const [minListings, setMinListings] = useState<number>(() => {
    const m = initialPrefs?.minListings;
    if (m === 3 || m === 4 || m === 5) return m;
    return 2;
  });
  const [confidenceFilter, setConfidenceFilter] = useState<ConfidenceFilter>(
    () => initialPrefs?.confidenceFilter ?? "all",
  );
  const [clusterQuery, setClusterQuery] = useState("");
  const [bulkOpen, setBulkOpen] = useState({ version: 0, open: false });

  const { listingsByAgency, isLoading: loading, refreshAll } = useAppData();

  useEffect(() => {
    const sessions = Array.from(listingsByAgency, ([agencyName, listings]) => ({
      sessionId: agencyName,
      listings,
      agencyName,
    }));
    setReport(analyzeCrossAgencyDuplicates(dedupeTaggedListings(sessions)));
  }, [listingsByAgency]);

  useEffect(() => {
    saveDupesPrefs({
      clusterSort,
      minAgencies,
      minListings,
      fuzzyNoiseFilterLevel,
      confidenceFilter,
      activeSignal,
    });
  }, [clusterSort, minAgencies, minListings, fuzzyNoiseFilterLevel, confidenceFilter, activeSignal]);

  const fuzzyClusters = report?.fuzzyClusters ?? [];

  const fuzzyFiltered = useMemo(() => {
    if (!report) return [];
    return filterFuzzyClustersByNoiseLevel(fuzzyClusters, fuzzyNoiseFilterLevel, report);
  }, [fuzzyNoiseFilterLevel, report, fuzzyClusters]);

  const fuzzyCountsByLevel = useMemo(() => {
    if (!report) return null;
    return countFuzzyClustersPerNoiseLevel(fuzzyClusters, report);
  }, [report, fuzzyClusters]);

  const countFor = useCallback(
    (id: SignalId) => {
      if (!report) return 0;
      if (id === "fuzzy") return fuzzyFiltered.length;
      return clustersForSignal(id, report, fuzzyClusters).length;
    },
    [report, fuzzyFiltered, fuzzyClusters],
  );

  // Open on the strongest signal that actually found something, rather than an empty list —
  // until the user picks a signal themselves.
  const userPickedSignal = useRef(false);
  const pickSignal = (id: SignalId) => {
    userPickedSignal.current = true;
    setActiveSignal(id);
  };
  useEffect(() => {
    if (!report || userPickedSignal.current || countFor(activeSignal) > 0) return;
    const first = SIGNAL_GROUPS.flatMap((g) => g.signals).find((sig) => countFor(sig.id) > 0);
    if (first) setActiveSignal(first.id);
  }, [report, activeSignal, countFor]);

  const activeClusters = report ? clustersForSignal(activeSignal, report, fuzzyFiltered) : [];

  const structuralClusters = useMemo(() => {
    let list = [...activeClusters];
    list = filterClustersByMinAgencies(list, minAgencies);
    list = filterClustersByMinListings(list, minListings);
    list = filterClustersByConfidence(list, confidenceFilter);
    list = sortClusters(list, clusterSort);
    return list;
  }, [activeClusters, minAgencies, minListings, confidenceFilter, clusterSort]);

  const displayClusters = useMemo(
    () => filterClustersByQuery(structuralClusters, clusterQuery),
    [structuralClusters, clusterQuery],
  );

  const filtersDirty =
    minAgencies > 2 ||
    minListings > 2 ||
    confidenceFilter !== "all" ||
    clusterQuery.trim().length > 0 ||
    fuzzyNoiseFilterLevel !== "off";

  const resetStructuralFilters = useCallback(() => {
    setMinAgencies(2);
    setMinListings(2);
    setConfidenceFilter("all");
    setClusterQuery("");
    setFuzzyNoiseFilterLevel("off");
  }, []);

  const expandAllClusters = useCallback(() => {
    setBulkOpen((b) => ({ version: b.version + 1, open: true }));
  }, []);

  const collapseAllClusters = useCallback(() => {
    setBulkOpen((b) => ({ version: b.version + 1, open: false }));
  }, []);

  const copyVisibleSummary = useCallback(async () => {
    const label =
      SIGNAL_GROUPS.flatMap((g) => g.signals).find((s) => s.id === activeSignal)?.label ?? activeSignal;
    const text = buildVisibleClustersSummary({ signalLabel: label, clusters: displayClusters });
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Summary copied", { description: `${displayClusters.length} cluster${displayClusters.length === 1 ? "" : "s"} in clipboard.` });
    } catch {
      toast.error("Could not copy", { description: "Clipboard permission was denied." });
    }
  }, [activeSignal, displayClusters]);

  return (
    <TooltipProvider delayDuration={250}>
    <div className="min-h-screen bg-background flex flex-col">
      <a
        href="#cross-agency-dupes-main"
        className={cn(
          "sr-only",
          "focus:fixed focus:left-4 focus:top-4 focus:z-[100]",
          "focus:m-0 focus:inline-flex focus:h-auto focus:w-auto focus:overflow-visible focus:whitespace-normal focus:p-0 focus:clip-auto",
          "focus:rounded-md focus:bg-primary focus:px-4 focus:py-2.5 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background",
        )}
      >
        Skip to main content
      </a>
      <AppHeader />

      <main
        id="cross-agency-dupes-main"
        tabIndex={-1}
        className="flex-1 w-full max-w-[1600px] mx-auto py-6 px-4 sm:px-6 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
      >
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-4 min-w-0">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/12 ring-1 ring-primary/20">
              <Sparkles className="h-6 w-6 text-primary-text" aria-hidden />
            </div>
            <div className="min-w-0 space-y-1">
              <h1 className="text-2xl font-bold font-heading tracking-tight text-foreground">
                Cross-agency duplicates
              </h1>
              <p className="text-sm text-muted-foreground leading-snug max-w-xl">
                Listings from <span className="text-foreground font-medium">2+ agencies</span> that match the same rule.
                Pick a signal in the sidebar — strongest first (permit, photo), then map, then heuristics.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <WorkflowTooltip tip={WORKFLOW_TOOLTIPS.refresh}>
              <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => refreshAll()} disabled={loading}>
                <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
                Refresh data
              </Button>
            </WorkflowTooltip>
          </div>
        </div>

        {loading ? (
          <p
            className="text-base text-muted-foreground flex items-center gap-3 py-12"
            role="status"
            aria-live="polite"
            aria-busy="true"
          >
            <Loader2 className="w-5 h-5 shrink-0 animate-spin text-primary-text" aria-hidden />
            <span>Scanning import sessions…</span>
          </p>
        ) : report ? (
          <div className="flex flex-col xl:flex-row gap-6 xl:gap-8 xl:items-start">
            {/* Mobile: compact signal chips (no dropdown) */}
            <div className="xl:hidden space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">Match rule</span>
                {report ? (
                  <Badge variant="secondary" className="tabular-nums text-[10px]" role="status">
                    {report.taggedCount} listings · {report.agencyCount} agencies
                  </Badge>
                ) : null}
              </div>
              <div
                className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory"
                role="tablist"
                aria-label="Match rules"
              >
                {SIGNAL_GROUPS.flatMap((g) => g.signals).map((s) => {
                  const n = countFor(s.id);
                  const active = activeSignal === s.id;
                  return (
                    <SignalTooltip key={s.id} signalId={s.id} side="top">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => pickSignal(s.id)}
                        className={cn(
                          "snap-start shrink-0 rounded-full px-2.5 py-1.5 text-[11px] font-medium tabular-nums transition-colors border",
                          active
                            ? "border-primary bg-primary text-primary-foreground shadow-sm"
                            : "border-border/80 bg-muted/40 text-foreground hover:bg-muted/70",
                        )}
                      >
                        {s.short} · {n}
                      </button>
                    </SignalTooltip>
                  );
                })}
              </div>
            </div>

            {/* Sidebar: desktop */}
            <nav
              aria-label="Cross-agency match signals"
              className="hidden xl:block w-[18rem] max-w-full shrink-0 space-y-4 xl:sticky xl:top-20 xl:max-h-[calc(100vh-5rem)] xl:overflow-y-auto xl:overscroll-contain self-start pr-1"
            >
              <Card className="border-border/80 shadow-md ring-1 ring-black/[0.03]">
                <CardHeader className="py-3 px-4 space-y-0 border-b border-border/50 bg-muted/20">
                  <CardTitle className="text-sm font-semibold inline-flex items-center gap-1.5">
                    Signals
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="rounded-full p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          aria-label="What are signals?"
                        >
                          <HelpCircle className="w-3.5 h-3.5" aria-hidden />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-xs text-xs leading-relaxed">
                        A signal is a matching rule. Strong ones (permit, photo) are reliable when data exists. Location
                        and heuristics cast a wider net — always confirm on the listing detail page.
                      </TooltipContent>
                    </Tooltip>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-2 pb-3 space-y-4">
                  {SIGNAL_GROUPS.map((group) => (
                    <div key={group.id} className="space-y-1" role="group" aria-label={group.title}>
                      <p className="px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {group.title}
                      </p>
                      <div className="flex flex-col gap-0.5">
                        {group.signals.map((s) => {
                          const n = countFor(s.id);
                          const active = activeSignal === s.id;
                          return (
                            <SignalTooltip key={s.id} signalId={s.id} side="right">
                              <button
                                type="button"
                                onClick={() => pickSignal(s.id)}
                                aria-current={active ? "true" : undefined}
                                className={cn(
                                  "flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2.5 min-h-11 text-left text-sm transition-colors",
                                  active
                                    ? "bg-primary text-primary-foreground shadow-md ring-1 ring-primary/30"
                                    : "hover:bg-muted/80 text-foreground border border-transparent hover:border-border/80",
                                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                                )}
                              >
                                <span className="truncate">{s.label}</span>
                                <span
                                  className={cn(
                                    "tabular-nums text-xs shrink-0 px-1.5 py-0.5 rounded-md",
                                    active ? "bg-primary-foreground/20" : "bg-muted",
                                  )}
                                >
                                  {n}
                                </span>
                              </button>
                            </SignalTooltip>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </nav>

            {/* Main panel */}
            <div className="flex-1 min-w-0 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <h2 id="active-signal-heading" className="text-lg font-semibold text-foreground tracking-tight">
                    {SIGNAL_GROUPS.flatMap((g) => g.signals).find((s) => s.id === activeSignal)?.label ?? activeSignal}
                  </h2>
                  <p className="text-xs text-muted-foreground leading-relaxed max-w-prose">
                    {SIGNAL_GROUPS.find((g) => g.signals.some((s) => s.id === activeSignal))?.hint}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0 text-[11px]">
                  <Badge variant="outline" className="tabular-nums border-border/80 bg-muted/30 font-normal" role="status">
                    {displayClusters.length} shown
                    {displayClusters.length !== activeClusters.length ? (
                      <span className="text-muted-foreground"> / {activeClusters.length}</span>
                    ) : null}
                  </Badge>
                  <Badge variant="secondary" className="tabular-nums font-normal">
                    {report.taggedCount} listings · {report.agencyCount} agencies
                  </Badge>
                </div>
              </div>

              <div className="rounded-xl border border-border/80 bg-gradient-to-b from-muted/25 to-muted/5 p-3 sm:p-4 space-y-3 shadow-sm ring-1 ring-black/[0.03]">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
                  <div className="relative flex-1 min-w-0">
                    <Label htmlFor="dupes-cluster-search" className="sr-only">
                      Search clusters by agency, title, reference, or match key
                    </Label>
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden
                    />
                    <Input
                      id="dupes-cluster-search"
                      value={clusterQuery}
                      onChange={(e) => setClusterQuery(e.target.value)}
                      placeholder="Search agency, title, reference…"
                      className="h-10 pl-9 bg-background text-sm"
                      autoComplete="off"
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5 shrink-0">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button type="button" variant="outline" size="sm" className="h-9 px-2.5" onClick={expandAllClusters}>
                          <ChevronsDown className="w-4 h-4" aria-hidden />
                          <span className="hidden sm:inline">Expand</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs">
                        Open all clusters
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button type="button" variant="outline" size="sm" className="h-9 px-2.5" onClick={collapseAllClusters}>
                          <ChevronsUp className="w-4 h-4" aria-hidden />
                          <span className="hidden sm:inline">Collapse</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs">
                        Close all clusters
                      </TooltipContent>
                    </Tooltip>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-9 gap-1"
                      onClick={() => void copyVisibleSummary()}
                      disabled={displayClusters.length === 0}
                    >
                      <Copy className="w-3.5 h-3.5" aria-hidden />
                      Copy
                    </Button>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5">
                          <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden />
                          Filters
                          {filtersDirty ? (
                            <span className="ml-0.5 h-2 w-2 rounded-full bg-primary" aria-label="Filters active" />
                          ) : null}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[min(100vw-1.5rem,20rem)] p-4" align="end">
                        <div className="space-y-3">
                          <p className="text-sm font-semibold text-foreground">Cluster filters</p>
                          <div className="space-y-2">
                            <label htmlFor="dupes-sort" className="text-[11px] text-muted-foreground">
                              Sort
                            </label>
                            <Select value={clusterSort} onValueChange={(v) => setClusterSort(v as ClusterSort)}>
                              <SelectTrigger id="dupes-sort" className="h-9 w-full text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="agencies">Most agencies first</SelectItem>
                                <SelectItem value="listings">Most listings first</SelectItem>
                                <SelectItem value="default">Default order</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <label htmlFor="dupes-min-ag" className="text-[11px] text-muted-foreground">
                              Min agencies
                            </label>
                            <Select value={String(minAgencies)} onValueChange={(v) => setMinAgencies(Number(v) as 2 | 3 | 4)}>
                              <SelectTrigger id="dupes-min-ag" className="h-9 w-full text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="2">2+</SelectItem>
                                <SelectItem value="3">3+</SelectItem>
                                <SelectItem value="4">4+</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <label htmlFor="dupes-min-listings" className="text-[11px] text-muted-foreground">
                              Min listings in cluster
                            </label>
                            <Select value={String(minListings)} onValueChange={(v) => setMinListings(Number(v))}>
                              <SelectTrigger id="dupes-min-listings" className="h-9 w-full text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="2">2+</SelectItem>
                                <SelectItem value="3">3+</SelectItem>
                                <SelectItem value="4">4+</SelectItem>
                                <SelectItem value="5">5+</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <label htmlFor="dupes-confidence" className="text-[11px] text-muted-foreground">
                              Confidence
                            </label>
                            <Select value={confidenceFilter} onValueChange={(v) => setConfidenceFilter(v as ConfidenceFilter)}>
                              <SelectTrigger id="dupes-confidence" className="h-9 w-full text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All</SelectItem>
                                <SelectItem value="high_only">High only</SelectItem>
                                <SelectItem value="high_and_medium">High + medium</SelectItem>
                                <SelectItem value="exclude_review">Hide review</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          {activeSignal === "fuzzy" ? (
                            <div className="space-y-2 border-t border-border/60 pt-3">
                              <div className="flex items-center justify-between gap-2">
                                <label htmlFor="dupes-fuzzy-noise" className="text-[11px] text-muted-foreground">
                                  Fuzzy noise
                                </label>
                                <WorkflowTooltip tip={WORKFLOW_TOOLTIPS.fuzzyLevels}>
                                  <button
                                    type="button"
                                    className="text-muted-foreground hover:text-foreground rounded-full p-0.5"
                                    aria-label="About fuzzy noise filter"
                                  >
                                    <HelpCircle className="w-3.5 h-3.5" />
                                  </button>
                                </WorkflowTooltip>
                              </div>
                              <Select
                                value={fuzzyNoiseFilterLevel}
                                onValueChange={(v) => setFuzzyNoiseFilterLevel(v as FuzzyNoiseFilterLevel)}
                              >
                                <SelectTrigger id="dupes-fuzzy-noise" className="h-9 w-full text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {FUZZY_NOISE_LEVEL_UI.map((opt) => {
                                    const n = fuzzyCountsByLevel?.[opt.value] ?? 0;
                                    return (
                                      <SelectItem key={opt.value} value={opt.value}>
                                        {fuzzyCountsByLevel != null ? `${opt.label} (${n})` : opt.label}
                                      </SelectItem>
                                    );
                                  })}
                                </SelectContent>
                              </Select>
                            </div>
                          ) : null}
                          <Button type="button" variant="ghost" size="sm" className="w-full h-8 text-xs" onClick={resetStructuralFilters}>
                            Reset structural filters
                          </Button>
                          <p className="text-[10px] text-muted-foreground leading-snug">Saved in this browser.</p>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                {filtersDirty ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-2.5">
                    <p className="text-[11px] text-muted-foreground">Some clusters hidden by filters or search.</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => {
                        resetStructuralFilters();
                        setClusterQuery("");
                      }}
                    >
                      Reset all
                    </Button>
                  </div>
                ) : null}
              </div>

              {activeClusters.length === 0 ? (
                <Card className="border-dashed border-2 bg-muted/10">
                  <CardContent className="py-12 text-center text-sm text-muted-foreground" role="status">
                    {emptyMessage(activeSignal)}
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      <Button variant="outline" size="sm" asChild>
                        <Link to="/sources">Go to Sources</Link>
                      </Button>
                      <Button variant="outline" size="sm" asChild>
                        <Link to="/agencies">View agencies</Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : structuralClusters.length === 0 ? (
                <Card className="border-dashed border-2 bg-muted/10">
                  <CardContent className="py-10 text-center text-sm text-muted-foreground space-y-3 max-w-md mx-auto" role="status">
                    <p>
                      No clusters match your <strong className="text-foreground">structural filters</strong> (min agencies,
                      min listings, or confidence) for this signal.
                    </p>
                    <Button type="button" variant="outline" size="sm" onClick={resetStructuralFilters}>
                      Reset filters
                    </Button>
                  </CardContent>
                </Card>
              ) : displayClusters.length === 0 ? (
                <Card className="border-dashed border-2 bg-muted/10">
                  <CardContent className="py-10 text-center text-sm text-muted-foreground space-y-3 max-w-md mx-auto" role="status">
                    <p>
                      No clusters match your <strong className="text-foreground">search</strong>. Try fewer words or clear
                      the search box.
                    </p>
                    <Button type="button" variant="outline" size="sm" onClick={() => setClusterQuery("")}>
                      Clear search
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <TabScroll>
                  {displayClusters.map((c) => (
                    <ClusterSection
                      key={`${activeSignal}-${c.tier}-${c.matchKey}`}
                      cluster={c}
                      bulkOpen={bulkOpen}
                    />
                  ))}
                </TabScroll>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-12" role="status">
            Nothing to analyze.
          </p>
        )}
      </main>
    </div>
    </TooltipProvider>
  );
}
