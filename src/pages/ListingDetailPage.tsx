import { AgentPhoto } from "@/components/AgentPhoto";
import AppHeader from "@/components/AppHeader";
import { GitStyleDiffBlock } from "@/components/GitStyleDiffBlock";
import { ListingImageUrlGrid } from "@/components/ListingImageUrlGrid";
import { ListingsMap } from "@/components/ListingsMap";
import { VideoTourPlayer } from "@/components/VideoTourPlayer";
import { Button } from "@/components/ui/button";
import XmlTree from "@/components/XmlTree";
import { addCompareListingId } from "@/lib/compareSelection";
import { formatPriceCompact, formatPriceFull, listingPriceEyebrow } from "@/lib/displayPrice";
import { useListingRawXml } from "@/hooks/useListingRawXml";
import { isGitStyleTextField } from "@/lib/importDiffInsights";
import { formatListingFieldValue } from "@/lib/listingFieldFormat";
import { isListingFieldFilled } from "@/lib/listingFieldPresence";
import { googleMapsQueryUrl, googleMapsSatelliteUrl, openStreetMapPinUrl } from "@/lib/mapExternalLinks";
import { canPlayInlineOnSite, normalizeVideoTourPageUrl } from "@/lib/videoTourUrl";
import { recordRecentListingView } from "@/lib/recentListings";
import { useFavorites } from "@/hooks/usePrefs";
import { useVersionListings } from "@/hooks/useSources";
import { liveVersionOf } from "@/lib/sourcesApi";
import { diffListings } from "@/lib/versionDiff";
import { UI_FIELDS, type ImportListingDiff, type Listing } from "@/lib/types";
import { cn } from "@/lib/utils";
import { diffPlainText } from "@/lib/textLineDiff";
import { buildXmlTree, flattenXmlString } from "@/lib/xmlParser";
import { useAppData } from "@/providers/DataProvider";
import {
    ArrowLeft,
    ArrowUpRight,
    Banknote,
    Bath,
    Bed,
    Building2, Calendar,
    Car, CheckCircle2,
    ChevronLeft, ChevronRight,
    ClipboardList,
    Copy,
    Code,
    Columns2,
    ExternalLink,
    FileImage,
    GitCompare,
    Globe,
    Hash,
    Heart,
    Home,
    ImageOff,
    Mail,
    MapPin,
    Maximize,
    Phone,
    Scan,
    Share2,
    Shield,
    Tag,
    User,
    Video,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "@/components/ui/sonner";

function listingDiffCellContent(key: keyof Listing, listing: Listing): ReactNode {
  if (key === "images") {
    return <ListingImageUrlGrid urls={listing.images ?? []} variant="dense" />;
  }
  if (key === "amenities") {
    const arr = listing.amenities ?? [];
    if (!arr.length) return <span className="text-muted-foreground/80">—</span>;
    return (
      <div className="flex flex-wrap gap-1">
        {arr.slice(0, 24).map((a, i) => (
          <span
            key={`${a}-${i}`}
            className="rounded-md border border-border/80 bg-muted/40 px-1.5 py-0.5 text-[10px] leading-tight text-foreground/90"
          >
            {a}
          </span>
        ))}
        {arr.length > 24 ? (
          <span className="text-[10px] text-muted-foreground self-center">+{arr.length - 24}</span>
        ) : null}
      </div>
    );
  }
  return <span className="whitespace-pre-wrap break-words">{formatListingFieldValue(key, listing)}</span>;
}

const ListingDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const { listings, listingsByAgency, sources } = useAppData();
  const favorites = useFavorites();
  const decodedId = useMemo(() => decodeURIComponent(id || ""), [id]);
  const listing = useMemo(() => listings.find(l => l.id === decodedId) ?? null, [listings, decodedId]);
  const listingSource = useMemo(
    () => (listing ? sources.find((s) => s.name === listing.sourceAgency) ?? null : null),
    [sources, listing],
  );
  const mappingConfig = listingSource?.mapping ?? null;
  // Version just older than the live one, for the "what changed" panel.
  const previousVersion = useMemo(() => {
    if (!listingSource) return null;
    const live = liveVersionOf(listingSource);
    if (!live) return null;
    const idx = listingSource.versions.findIndex((v) => v.id === live.id);
    return idx >= 0 ? (listingSource.versions[idx + 1] ?? null) : null;
  }, [listingSource]);
  const previousListingsQuery = useVersionListings(previousVersion);
  const fav = listing ? favorites.isFavorite(listing.id) : false;
  const [imgIdx, setImgIdx] = useState(0);
  const [showRaw, setShowRaw] = useState(false);
  const [showAllImages, setShowAllImages] = useState(false);
  const [showXmlElements, setShowXmlElements] = useState(false);
  const [xmlFilter, setXmlFilter] = useState<"all" | "mapped" | "unmapped" | "changed">("all");
  const [detailFieldView, setDetailFieldView] = useState<"all" | "present" | "missing">("all");

  const agenciesForListing = useMemo(() => {
    if (!listing) return [] as string[];
    const names: string[] = [];
    for (const [ag, ls] of listingsByAgency.entries()) {
      if (ls.some((l) => l.id === listing.id)) names.push(ag);
    }
    return names.sort((a, b) => a.localeCompare(b));
  }, [listingsByAgency, listing?.id]);

  const { rawXml } = useListingRawXml(listing);
  const xmlTree = useMemo(() => (rawXml ? buildXmlTree(rawXml) : []), [rawXml]);
  const xmlFlat = useMemo(() => (rawXml ? flattenXmlString(rawXml, "property") : []), [rawXml]);
  const mappedByPath = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of mappingConfig?.mappings || []) {
      if (m.uiField && m.xmlPath) map.set(m.xmlPath, String(m.uiField));
    }
    return map;
  }, [mappingConfig]);

  const prevListing = useMemo(() => {
    if (!listing || !previousListingsQuery.data) return null;
    return previousListingsQuery.data.find((p) => p.reference === listing.reference) ?? null;
  }, [listing, previousListingsQuery.data]);

  const listingDiff = useMemo((): ImportListingDiff | null => {
    if (!listing || !previousListingsQuery.data) return null;
    if (!prevListing) {
      return { id: listing.id, reference: listing.reference, status: "new", changedKeys: [] as (keyof Listing)[] };
    }
    const changed = diffListings([prevListing], [listing]).changed[0];
    return changed
      ? { id: listing.id, reference: listing.reference, status: "updated", changedKeys: changed.keys }
      : null;
  }, [listing, prevListing, previousListingsQuery.data]);

  const changedUiKeys = useMemo(() => new Set((listingDiff?.changedKeys ?? []).map(k => String(k))), [listingDiff]);

  useEffect(() => {
    if (!listing) return;
    recordRecentListingView({
      id: listing.id,
      title: listing.title?.trim() || "Untitled",
      reference: listing.reference?.trim() || "",
    });
  }, [listing?.id, listing?.title, listing?.reference]);

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const detailGroups = useMemo(() => {
    if (!listing) {
      return {
        specifications: [] as { label: string; value: string }[],
        building: [] as { label: string; value: string }[],
        location: [] as { label: string; value: string }[],
        financial: [] as { label: string; value: string }[],
        records: [] as { label: string; value: string }[],
        feedTours: [] as { label: string; value: string }[],
      };
    }
    const purpose = listing.purpose === "sale" ? "For Sale" : listing.purpose === "rent" ? "For Rent" : "";
    const cur = listing.currency?.trim();
    const fmtMoney = (n: number) =>
      cur ? `${cur} ${formatPriceFull(n)}` : formatPriceFull(n);
    const down =
      Number.isFinite(listing.downPaymentPrice) && listing.downPaymentPrice > 0
        ? fmtMoney(listing.downPaymentPrice)
        : "—";
    const svc =
      Number.isFinite(listing.serviceCharge) && listing.serviceCharge > 0
        ? fmtMoney(listing.serviceCharge)
        : "—";

    const empty = (s: string | null | undefined) => {
      const t = String(s ?? "").trim();
      return t || "—";
    };

    const rows: { label: string; value: string }[] = [
      { label: "Property Type", value: empty(listing.propertyType) },
      { label: "Purpose", value: purpose ? purpose : "—" },
      { label: "Bedrooms", value: listing.beds > 0 ? String(listing.beds) : "Studio" },
      { label: "Bathrooms", value: listing.baths > 0 ? String(listing.baths) : "—" },
      {
        label: "Area",
        value: listing.area
          ? `${listing.area.toLocaleString()} ${listing.areaUnit || ""}`.trim()
          : "—",
      },
      {
        label: "Plot Size",
        value: listing.plotSize
          ? `${listing.plotSize.toLocaleString()} ${listing.areaUnit || ""}`.trim()
          : "—",
      },
      {
        label: "Parking",
        value:
          listing.parking > 0
            ? `${listing.parking} space${listing.parking > 1 ? "s" : ""}`
            : "—",
      },
      { label: "Furnished", value: empty(listing.furnished) },
      { label: "Completion", value: empty(listing.completionStatus) },
      { label: "Developer", value: empty(listing.developer) },
      { label: "Build Year", value: empty(listing.buildYear) },
      { label: "Floor", value: empty(listing.floor) },
      { label: "Stories", value: empty(listing.stories) },
      { label: "Address", value: empty(listing.address) },
      { label: "Community", value: empty(listing.community) },
      { label: "Sub Community", value: empty(listing.subCommunity) },
      { label: "City", value: empty(listing.city) },
      { label: "Building", value: empty(listing.propertyName) },
      { label: "Latitude", value: listing.latitude != null ? String(listing.latitude) : "—" },
      { label: "Longitude", value: listing.longitude != null ? String(listing.longitude) : "—" },
      { label: "360° tour URL", value: empty(listing.view360) },
      { label: "Video tour URL", value: empty(listing.videoTourUrl) },
      { label: "Floor plan URL", value: empty(listing.floorPlanUrl) },
      { label: "Down Payment", value: down },
      { label: "Service Charge", value: svc },
      { label: "Payment Method", value: empty(listing.paymentMethod) },
      { label: "Cheques", value: empty(listing.cheques) },
      { label: "Price on Application", value: empty(listing.priceOnApplication) },
      { label: "Last Update", value: empty(listing.lastUpdate) },
      { label: "Reference", value: empty(listing.reference) },
      { label: "Permit No.", value: empty(listing.permitNumber) },
    ];

    const labels = (set: Set<string>) => rows.filter(r => set.has(r.label));

    return {
      specifications: labels(new Set([
        "Property Type", "Purpose", "Bedrooms", "Bathrooms", "Area", "Plot Size",
        "Parking", "Furnished", "Completion",
      ])),
      building: labels(new Set(["Developer", "Build Year", "Floor", "Stories", "Building"])),
      location: labels(new Set(["Address", "Community", "Sub Community", "City", "Latitude", "Longitude"])),
      financial: labels(new Set([
        "Down Payment", "Service Charge", "Payment Method", "Cheques", "Price on Application",
      ])),
      records: labels(new Set(["Reference", "Permit No.", "Last Update"])),
      feedTours: labels(new Set(["360° tour URL", "Video tour URL", "Floor plan URL"])),
    };
  }, [listing]);

  const isDetailValueMissing = (value: string) => value === "—" || !String(value ?? "").trim();

  const detailRowsFlat = useMemo(() => {
    if (!listing) return [] as { label: string; value: string }[];
    return [
      ...detailGroups.specifications,
      ...detailGroups.building,
      ...detailGroups.location,
      ...detailGroups.financial,
      ...detailGroups.records,
      ...detailGroups.feedTours,
    ];
  }, [listing, detailGroups]);

  const detailFieldStats = useMemo(() => {
    const total = detailRowsFlat.length;
    const missing = detailRowsFlat.filter(
      (r) => r.value === "—" || !String(r.value ?? "").trim()
    ).length;
    return { total, present: total - missing, missing };
  }, [detailRowsFlat]);

  const filterDetailRows = (rows: { label: string; value: string }[]) => {
    if (detailFieldView === "all") return rows;
    if (detailFieldView === "present") return rows.filter((r) => !isDetailValueMissing(r.value));
    return rows.filter((r) => isDetailValueMissing(r.value));
  };

  const mediaLinks = useMemo(() => {
    if (!listing) return [] as { kind: "360" | "video" | "floor"; label: string; href: string }[];
    const out: { kind: "360" | "video" | "floor"; label: string; href: string }[] = [];
    const v360 = listing.view360?.trim();
    const vid = listing.videoTourUrl?.trim();
    const fp = listing.floorPlanUrl?.trim();
    if (v360) {
      const href = normalizeVideoTourPageUrl(v360) || v360;
      out.push({ kind: "360", label: "360° tour", href });
    }
    if (vid) {
      const href = normalizeVideoTourPageUrl(vid) || vid;
      out.push({ kind: "video", label: "Video tour", href });
    }
    if (fp) {
      const href = normalizeVideoTourPageUrl(fp) || fp;
      out.push({ kind: "floor", label: "Floor plan", href });
    }
    return out;
  }, [listing]);

  const videoTourPlaysInline = useMemo(
    () => Boolean(listing?.videoTourUrl?.trim() && canPlayInlineOnSite(listing.videoTourUrl)),
    [listing?.videoTourUrl],
  );

  const navSections = useMemo(() => {
    if (!listing) return [] as { id: string; label: string }[];
    const detailCount =
      detailGroups.specifications.length +
      detailGroups.building.length +
      detailGroups.location.length +
      detailGroups.financial.length +
      detailGroups.records.length +
      detailGroups.feedTours.length;
    const items: { id: string; label: string }[] = [
      { id: "listing-summary", label: "Overview" },
      { id: "listing-price", label: "Price & facts" },
    ];
    if (detailCount > 0) items.push({ id: "listing-details", label: "Details" });
    if (listing.description) items.push({ id: "listing-description", label: "Description" });
    if (mediaLinks.length) items.push({ id: "listing-media", label: "Media" });
    if (listing.amenities.length) items.push({ id: "listing-amenities", label: "Amenities" });
    if (
      listing.latitude != null &&
      listing.longitude != null &&
      Number.isFinite(listing.latitude) &&
      Number.isFinite(listing.longitude)
    ) {
      items.push({ id: "listing-map", label: "Map" });
    }
    items.push({ id: "listing-technical", label: "Feed" });
    items.push({ id: "listing-contact", label: "Contact" });
    return items;
  }, [listing, detailGroups, mediaLinks.length]);

  if (!listing) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="max-w-[1320px] mx-auto px-6 py-32 text-center">
          <div className="w-20 h-20 rounded-2xl bg-accent flex items-center justify-center mx-auto mb-6 border border-border">
            <Building2 className="w-10 h-10 text-muted-foreground" />
          </div>
          <h1 className="text-2xl font-bold font-heading text-foreground mb-3">Listing Not Found</h1>
          <p className="text-muted-foreground mb-8">This listing may have been removed or the URL is incorrect.</p>
          <Button asChild variant="ghost" className="border border-border text-muted-foreground hover:text-foreground rounded-xl h-10">
            <Link to="/listings"><ArrowLeft className="w-4 h-4 mr-2" />Back to Listings</Link>
          </Button>
        </div>
      </div>
    );
  }

  const hasImages = listing.images.length > 0;
  const priceFieldOk = isListingFieldFilled(listing, "price");
  const purposeLabel = listing.purpose === "sale" ? "For Sale" : listing.purpose === "rent" ? "For Rent" : "";
  const visibleThumbs = showAllImages ? listing.images : listing.images.slice(0, 9);
  const isOffPlan = listing.completionStatus?.toLowerCase().includes("off");
  const hasMapCoords =
    listing.latitude != null &&
    listing.longitude != null &&
    Number.isFinite(listing.latitude) &&
    Number.isFinite(listing.longitude);

  /** Header is h-[80px] (5rem); jump nav sits at top-20; scroll targets need room for both when using scrollIntoView */
  const scrollSectionClass =
    "scroll-mt-[10rem] sm:scroll-mt-[10.5rem]";
  const sectionCard = "listing-detail-section-card";
  /** Sticky agent sits below fixed header + sticky jump nav (full-width bar) */
  const stickyAsideTopClass = "top-[calc(5rem+4.5rem)]";

  return (
    <div className="min-h-screen bg-background listing-luxury-scope listing-detail-page overflow-x-hidden">
      <AppHeader />

      <div className="relative">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[min(36vh,480px)] bg-gradient-to-b from-primary/[0.04] via-muted/20 to-transparent"
          aria-hidden
        />
        <div className="relative max-w-[1420px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-16 sm:pb-20">
        {/* ── Top bar ── */}
        <div className="flex items-center justify-between mb-6 sm:mb-8 flex-wrap gap-3">
          <Button asChild variant="ghost" className="h-10 gap-2 text-muted-foreground hover:text-foreground border border-border/80 bg-card/50 hover:border-primary/25 hover:bg-card rounded-full px-5 text-sm font-medium shadow-sm">
            <Link to="/listings"><ArrowLeft className="w-4 h-4" />All listings</Link>
          </Button>
          <div className="flex items-center gap-1.5 flex-wrap rounded-2xl border border-border/70 bg-card/50 p-1.5 shadow-sm backdrop-blur-sm sm:gap-2">
            <Button
              size="sm"
              variant="ghost"
              className={cn("h-10 gap-1.5 rounded-full border px-4 text-sm transition-all", fav ? "border-primary/40 bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:text-foreground hover:border-primary/25")}
              onClick={() => { const next = !favorites.isFavorite(listing.id); favorites.toggle(listing.id); toast.success(next ? "Saved" : "Removed"); }}
            >
              <Heart className={cn("w-3.5 h-3.5", fav && "fill-current")} />
              {fav ? "Saved" : "Save"}
            </Button>
            <Button size="sm" variant="ghost" className="h-10 gap-1.5 rounded-full border border-border text-muted-foreground hover:text-foreground px-4 text-sm"
              onClick={async () => { try { await navigator.clipboard.writeText(window.location.href); toast.success("Link copied"); } catch { toast.error("Copy failed"); } }}>
              <Share2 className="w-3.5 h-3.5" />Share
            </Button>
            <Button size="sm" variant="ghost" className="h-10 gap-1.5 rounded-full border border-border text-muted-foreground hover:text-foreground px-4 text-sm"
              onClick={() => { addCompareListingId(listing.id); toast.success("Added to compare"); }}>
              <Columns2 className="w-3.5 h-3.5" />Compare
            </Button>
            <Button asChild size="sm" variant="ghost" className="h-10 gap-1.5 rounded-full border border-border text-muted-foreground hover:text-foreground px-4 text-sm">
              <Link to="/validation"><ClipboardList className="w-3.5 h-3.5" />Validation</Link>
            </Button>
          </div>
        </div>

        <nav
          aria-label="On this page"
          className={cn(
            "listing-detail-jump-nav sticky top-20 z-30 w-full max-w-full py-3 mb-7 sm:mb-9",
            "min-h-[4.25rem] flex flex-col justify-center",
          )}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4 min-w-0 max-w-full">
            <div className="hidden sm:flex shrink-0 flex-col leading-tight pr-2 border-r border-border/50">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground whitespace-nowrap">
                On this page
              </span>
              <span className="text-[9px] text-muted-foreground/70 font-medium whitespace-nowrap">
                Jump to a section
              </span>
            </div>
            <div
              className={cn(
                "flex flex-1 gap-2 sm:gap-2 min-w-0 max-w-full overflow-x-auto overflow-y-hidden scrollbar-none pb-0.5",
                "[scrollbar-width:thin] [mask-image:linear-gradient(to_right,black_calc(100%-2.5rem),transparent)] sm:[mask-image:none]",
              )}
            >
            {navSections.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => scrollToSection(s.id)}
                className="shrink-0 px-3.5 py-2 sm:px-4 rounded-full text-[11px] sm:text-xs font-semibold tracking-wide border border-border/80 bg-background/50 text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-accent/70 transition-colors"
              >
                {s.label}
              </button>
            ))}
            </div>
          </div>
        </nav>

        <section aria-label="Photo gallery" className="mb-6 sm:mb-8 space-y-4">
        <div
          className={cn(
            "rounded-[2rem] sm:rounded-[2.5rem] overflow-hidden bg-card border border-border/90 shadow-2xl shadow-black/[0.08] ring-1 ring-[hsl(var(--listing-frame))]/80",
            !hasImages && "ring-muted/30",
          )}
          style={{ height: "min(82vh, 780px)" }}
        >
          {hasImages ? (
            <div className="relative w-full h-full">
              <img
                src={listing.images[imgIdx]}
                alt={`${listing.title} — photo ${imgIdx + 1}`}
                className="w-full h-full object-cover"
              />
              {/* Gradient */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />

              {/* Nav arrows */}
              {listing.images.length > 1 && (
                <>
                  <button
                    type="button"
                    aria-label="Previous photo"
                    onClick={() => setImgIdx(i => (i - 1 + listing.images.length) % listing.images.length)}
                    className="absolute left-5 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-background/90 backdrop-blur-md border border-white/20 flex items-center justify-center text-foreground hover:bg-background shadow-lg transition-all hover:scale-105"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next photo"
                    onClick={() => setImgIdx(i => (i + 1) % listing.images.length)}
                    className="absolute right-5 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-background/90 backdrop-blur-md border border-white/20 flex items-center justify-center text-foreground hover:bg-background shadow-lg transition-all hover:scale-105"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                  <div className="absolute bottom-5 right-5 px-3 py-1.5 rounded-full bg-black/45 backdrop-blur-md border border-white/15 text-xs font-semibold tabular-nums text-white shadow-lg">
                    {imgIdx + 1} / {listing.images.length}
                  </div>
                </>
              )}

              {/* Purpose / status badges */}
              <div className="absolute top-5 left-5 flex gap-2">
                {purposeLabel && (
                  <span className={cn("px-3 py-1 rounded-full text-xs font-bold shadow-xl",
                    listing.purpose === "sale" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
                  )}>{purposeLabel}</span>
                )}
                {isOffPlan && <span className="px-3 py-1 rounded-full text-xs font-bold bg-sky-500 text-white shadow-xl">Off-Plan</span>}
                {listingDiff?.status === "new" && <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500 text-white shadow-xl">New</span>}
                {listingDiff?.status === "updated" && <span className="px-3 py-1 rounded-full text-xs font-bold bg-primary text-primary-foreground shadow-xl">Updated</span>}
              </div>

              {/* Bottom-left info on hero */}
              <div className="absolute bottom-5 left-5 right-16 sm:right-24 max-w-xl">
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/55 mb-1 drop-shadow-sm">
                  {listingPriceEyebrow(listing.purpose)}
                </div>
                <div className="text-3xl sm:text-4xl font-extrabold font-heading text-white drop-shadow-2xl tracking-tight tabular-nums">
                  {listing.price ? (
                    <>
                      <span className="text-brand-sand font-semibold text-xl sm:text-2xl mr-1.5 align-baseline">{listing.currency}</span>
                      {formatPriceCompact(listing.price)}
                    </>
                  ) : (
                    <span className="text-white/90">
                      {String(listing.priceOnApplication || "").trim().toLowerCase() === "yes" ? "POA" : "—"}
                    </span>
                  )}
                </div>
                {listing.purpose === "rent" && (
                  <div className="text-xs text-white/50 mt-1 tracking-wide">Per year · terms on request</div>
                )}
                <div className="text-sm text-white/80 flex items-center gap-1.5 mt-2">
                  <MapPin className="w-3.5 h-3.5 shrink-0 text-brand-sand" />
                  <span className="line-clamp-2">{listing.community || listing.city || listing.address || "Unknown location"}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-muted/50 text-muted-foreground/60 px-6">
              <ImageOff className="w-24 h-24 opacity-40" />
            </div>
          )}
        </div>

        {listing.images.length > 1 && (
          <div className="flex gap-3 overflow-x-auto pb-1.5 pt-0.5 scrollbar-none px-0.5">
            {visibleThumbs.map((img, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Show photo ${i + 1}`}
                aria-current={i === imgIdx ? "true" : undefined}
                onClick={() => setImgIdx(i)}
                className={cn(
                  "flex-shrink-0 rounded-xl overflow-hidden border-2 transition-all duration-200",
                  i === imgIdx
                    ? "border-primary ring-2 ring-primary/30 scale-[1.02] shadow-md shadow-primary/25"
                    : "border-border/80 hover:border-primary/40 opacity-70 hover:opacity-100 hover:shadow-sm"
                )}
                style={{ width: 92, height: 68 }}
              >
                <img src={img} alt="" className="w-full h-full object-cover" loading="lazy" />
              </button>
            ))}
            {!showAllImages && listing.images.length > 9 && (
              <button
                type="button"
                aria-label={`Show ${listing.images.length - 9} more photos`}
                onClick={() => setShowAllImages(true)}
            className="flex-shrink-0 rounded-xl border-2 border-dashed border-border flex items-center justify-center text-muted-foreground hover:border-primary/30 hover:text-primary-text transition-all"
                style={{ width: 92, height: 68 }}
              >
                <span className="text-xs font-semibold">+{listing.images.length - 9}</span>
              </button>
            )}
          </div>
        )}
        </section>

        {/* ── Main layout: content + sidebar ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] gap-8 lg:gap-10 xl:gap-14 items-start">

          {/* Main column */}
          <div className="min-w-0 space-y-7 sm:space-y-9">

            {/* Diff banner */}
            {listingDiff && (listingDiff.status === "updated" || listingDiff.status === "new" || listingDiff.status === "duplicate") && (
              <div className={cn("rounded-2xl border p-5", {
                "border-primary/25 bg-primary/8": listingDiff.status === "updated",
                "border-emerald-500/25 bg-emerald-500/8": listingDiff.status === "new",
                "border-yellow-500/25 bg-yellow-500/8": listingDiff.status === "duplicate",
              })}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                <div className="text-sm font-semibold text-foreground">
                      {listingDiff.status === "updated" ? "Updated since previous version" : listingDiff.status === "new" ? "New in live version" : "Duplicate listing"}
                    </div>
                    {listingDiff.status === "updated" && (
                  <div className="text-xs text-muted-foreground mt-0.5">{listingDiff.changedKeys.length} field(s) changed</div>
                    )}
                  </div>
              <Button variant="ghost" size="sm" onClick={() => setShowXmlElements(true)} className="border border-border text-muted-foreground hover:text-foreground rounded-xl h-8 text-xs">
                    View XML changes
                  </Button>
                </div>
                {listingDiff.status === "updated" && listingDiff.changedKeys.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {listingDiff.changedKeys.slice(0, 14).map(k => (
                  <span key={String(k)} className="px-2.5 py-0.5 rounded-full bg-primary/12 border border-primary/25 text-xs font-medium text-primary-text">
                        {UI_FIELDS.find(f => f.key === k)?.label ?? String(k)}
                      </span>
                    ))}
                    {listingDiff.changedKeys.length > 14 && (
                  <span className="text-xs text-muted-foreground self-center">+{listingDiff.changedKeys.length - 14} more</span>
                    )}
                  </div>
                )}
                {listingDiff.status === "updated" && prevListing && listingDiff.changedKeys.length > 0 && (
                  <div className="mt-4 space-y-4">
                    {listingDiff.changedKeys.some((k) => !isGitStyleTextField(k)) && (
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="text-xs font-semibold text-muted-foreground bg-accent px-4 py-2.5 flex items-center gap-2 border-b border-border">
                      <GitCompare className="w-3.5 h-3.5" />Before vs after (tabular fields)
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-card border-b border-border">
                          <tr>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground">Field</th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground">Before</th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground">After</th>
                          </tr>
                        </thead>
                    <tbody className="divide-y divide-border">
                          {listingDiff.changedKeys.filter((k) => !isGitStyleTextField(k)).map((k) => (
                        <tr key={String(k)} className="hover:bg-accent/60">
                          <td className="px-4 py-2 font-medium text-muted-foreground whitespace-nowrap">{UI_FIELDS.find(f => f.key === k)?.label ?? String(k)}</td>
                          <td
                            className={cn(
                              "px-4 py-2 align-top",
                              k === "images" || k === "amenities"
                                ? "text-muted-foreground max-w-[min(100%,360px)] min-w-[12rem]"
                                : "text-muted-foreground break-words max-w-[140px]",
                            )}
                          >
                            {prevListing ? listingDiffCellContent(k, prevListing) : "—"}
                          </td>
                          <td
                            className={cn(
                              "px-4 py-2 align-top",
                              k === "images" || k === "amenities"
                                ? "text-foreground max-w-[min(100%,360px)] min-w-[12rem]"
                                : "text-foreground break-words max-w-[140px]",
                            )}
                          >
                            {listingDiffCellContent(k, listing)}
                          </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                    )}
                    {listingDiff.changedKeys.filter((k) => isGitStyleTextField(k)).map((k) => {
                      const label = UI_FIELDS.find((f) => f.key === k)?.label ?? String(k);
                      const oldT =
                        k === "title" || k === "description"
                          ? String(prevListing[k] ?? "")
                          : String(formatListingFieldValue(k, prevListing));
                      const newT =
                        k === "title" || k === "description"
                          ? String(listing[k] ?? "")
                          : String(formatListingFieldValue(k, listing));
                      const { lines, truncated, fallback } = diffPlainText(oldT, newT);
                      if (!lines.length) return null;
                      return (
                        <GitStyleDiffBlock
                          key={String(k)}
                          label={label}
                          lines={lines}
                          maxHeightClass="max-h-[min(48vh,380px)]"
                          truncated={truncated}
                          fallback={fallback}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Title + meta (overview) */}
            <div id="listing-summary" className={cn(scrollSectionClass, "listing-detail-hero-card")}>
              <div className="relative z-10 px-6 sm:px-8 pt-8 pb-7 sm:pb-8">
                <div className="listing-eyebrow listing-eyebrow-accent mb-2">Overview</div>
                <h1 className="text-2xl md:text-[2.1rem] font-extrabold font-heading text-foreground leading-[1.12] tracking-tight max-w-4xl">
                  {listing.title || "Untitled Property"}
                </h1>
                <div className="listing-hairline my-5 max-w-3xl" />
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-accent/50 px-3 py-1.5 text-xs font-medium text-foreground/90">
                    <MapPin className="w-3.5 h-3.5 shrink-0 text-primary-text" aria-hidden />
                    <span className="min-w-0">{listing.address || listing.community || listing.city || "Unknown location"}</span>
                  </span>
                  {listing.propertyName && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-accent/50 px-3 py-1.5 text-xs font-medium text-foreground/90">
                      <Home className="w-3.5 h-3.5 shrink-0 text-primary-text" aria-hidden />
                      {listing.propertyName}
                    </span>
                  )}
                  {listing.subCommunity && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
                      <Globe className="w-3.5 h-3.5 shrink-0" aria-hidden />
                      {listing.subCommunity}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Price & key facts (single scan block) */}
            <section
              id="listing-price"
              className={cn(
                scrollSectionClass,
                "rounded-2xl border overflow-hidden bg-card/50 ring-1 ring-[hsl(var(--listing-frame))]/50 shadow-md divide-y divide-border/70 border-border/90",
                !priceFieldOk && "border-dashed",
              )}
            >
              <div
                className={cn(
                  "p-6 sm:p-7 flex flex-wrap items-center justify-between gap-4 bg-gradient-to-br from-primary/[0.14] via-primary/[0.06] to-muted/20",
                  !priceFieldOk && "bg-muted/20",
                )}
              >
                <div>
                  <div className="listing-eyebrow listing-eyebrow-accent mb-1.5">
                    {listingPriceEyebrow(listing.purpose)}
                  </div>
                  <div
                    className={cn(
                      "text-3xl sm:text-4xl font-extrabold font-heading tracking-tight tabular-nums",
                      priceFieldOk ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    <span className="text-brand-sand/90 text-xl sm:text-2xl font-semibold mr-1.5 align-baseline">{listing.currency}</span>
                    {listing.price
                      ? formatPriceFull(listing.price)
                      : String(listing.priceOnApplication || "").trim().toLowerCase() === "yes"
                        ? "POA"
                        : "—"}
                  </div>
                  {listing.purpose === "rent" && (
                    <div className="text-xs text-muted-foreground mt-1.5 tracking-wide">Per year · excludes fees unless stated</div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {listing.reference && (
                    <span className="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-xl border border-border/90 bg-background/90 shadow-sm px-2 py-1.5 text-xs font-mono text-muted-foreground sm:px-3">
                      <Hash className="h-3 w-3 shrink-0 text-primary-text" aria-hidden />
                      <span className="min-w-0 break-all">{listing.reference}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 rounded-lg text-muted-foreground hover:text-foreground"
                        aria-label="Copy reference"
                        onClick={async (e) => {
                          e.preventDefault();
                          try {
                            await navigator.clipboard.writeText(listing.reference);
                            toast.success("Reference copied");
                          } catch {
                            toast.error("Could not copy");
                          }
                        }}
                      >
                        <Copy className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                    </span>
                  )}
                  {listing.permitNumber && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-background/80 border border-border text-xs font-mono text-muted-foreground">
                      <Shield className="w-3 h-3 text-primary-text" />{listing.permitNumber}
                    </span>
                  )}
                </div>
              </div>
              <div className="px-4 py-5 sm:px-6 sm:py-6 bg-gradient-to-b from-accent/20 to-accent/10">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <h2 className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                    Key facts
                  </h2>
                </div>
                <div id="listing-specs" className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-3">
                  {[
                    { icon: Building2, label: "Type", value: listing.propertyType || "—" },
                    { icon: Bed, label: "Beds", value: listing.beds > 0 ? String(listing.beds) : "Studio" },
                    { icon: Bath, label: "Baths", value: listing.baths > 0 ? String(listing.baths) : "—" },
                    { icon: Maximize, label: "Area", value: listing.area ? `${listing.area.toLocaleString()} ${listing.areaUnit}` : "—" },
                    { icon: Car, label: "Parking", value: listing.parking > 0 ? String(listing.parking) : "—" },
                    { icon: Tag, label: "Furnished", value: listing.furnished || "—" },
                  ].map((f, i) => (
                    <div
                      key={i}
                      className={cn(
                        "bg-card border rounded-xl sm:rounded-2xl p-3 sm:p-4 text-center transition-all duration-200 hover:border-primary/25 hover:shadow-md hover:-translate-y-0.5",
                        f.value === "—" ? "border-dashed border-border/70 bg-muted/30" : "border-border/90 shadow-sm",
                      )}
                    >
                      <f.icon className="w-4 h-4 sm:w-5 sm:h-5 mx-auto text-primary-text/85 mb-1.5 sm:mb-2" />
                      <div className="text-[9px] sm:text-[10px] text-muted-foreground uppercase tracking-[0.14em] sm:tracking-[0.18em] mb-0.5 sm:mb-1 font-semibold">{f.label}</div>
                      <div className="text-xs sm:text-sm font-bold text-foreground font-heading leading-tight">{f.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* Property details — grouped for scanability */}
            {(detailGroups.specifications.length +
              detailGroups.building.length +
              detailGroups.location.length +
              detailGroups.financial.length +
              detailGroups.records.length +
              detailGroups.feedTours.length) > 0 && (
              <div id="listing-details" className={cn(scrollSectionClass, "space-y-4")}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="listing-eyebrow mb-1">Deep dive</div>
                    <h2 className="text-lg font-semibold font-heading text-foreground flex items-center gap-2">
                      <span className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center ring-1 ring-primary/20">
                        <Building2 className="w-3.5 h-3.5 text-primary-text" />
                      </span>
                      Property details
                    </h2>
                    <p className="text-xs text-muted-foreground max-w-md leading-relaxed mt-2">
                      Specifications, project context, location hierarchy, and compliance — grouped so buyers and analysts can skim.
                    </p>
                  </div>
                  <div className="shrink-0 flex flex-col items-stretch sm:items-end gap-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-right">
                      Show fields
                    </div>
                    <div className="flex flex-wrap gap-1 p-1 rounded-xl bg-accent/80 border border-border/80">
                      {(
                        [
                          { id: "all" as const, label: "All", count: detailFieldStats.total },
                          { id: "present" as const, label: "Present", count: detailFieldStats.present },
                          { id: "missing" as const, label: "Empty", count: detailFieldStats.missing },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setDetailFieldView(opt.id)}
                          className={cn(
                            "px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all whitespace-nowrap",
                            detailFieldView === opt.id
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground hover:bg-background/80"
                          )}
                        >
                          {opt.label}
                          <span className={cn("ml-1 tabular-nums opacity-80", detailFieldView === opt.id && "text-primary-foreground/90")}>
                            ({opt.count})
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {(() => {
                  const groupConfigs = [
                    {
                      title: "Specifications",
                      subtitle: "Layout, scale & condition",
                      icon: Home,
                      rows: detailGroups.specifications,
                    },
                    {
                      title: "Building & project",
                      subtitle: "Developer context",
                      icon: Building2,
                      rows: detailGroups.building,
                    },
                    {
                      title: "Location hierarchy",
                      subtitle: "Address & community",
                      icon: MapPin,
                      rows: detailGroups.location,
                    },
                    {
                      title: "Tours & floor plan (feed)",
                      subtitle: "360°, video, and PDF URLs from the XML mapping",
                      icon: Video,
                      rows: detailGroups.feedTours,
                    },
                    {
                      title: "Financial & terms",
                      subtitle: "Payments & tenancy",
                      icon: Banknote,
                      rows: detailGroups.financial,
                    },
                    {
                      title: "References & compliance",
                      subtitle: "IDs & audit trail",
                      icon: Shield,
                      rows: detailGroups.records,
                    },
                  ] as const;
                  const visible = groupConfigs
                    .map((g) => ({ ...g, rows: filterDetailRows(g.rows) }))
                    .filter((g) => g.rows.length > 0);
                  if (visible.length === 0) {
                    return (
                      <div className="rounded-2xl border border-dashed border-border bg-accent/30 px-5 py-10 text-center">
                        <p className="text-sm font-medium text-foreground">
                          {detailFieldView === "present"
                            ? "No populated detail fields in this view."
                            : detailFieldView === "missing"
                              ? "Every catalog field has a value."
                              : "No rows to show."}
                        </p>
                        {detailFieldView !== "all" ? (
                          <p className="text-xs text-muted-foreground mt-1.5">
                            <button
                              type="button"
                              className="text-primary-text font-semibold hover:underline"
                              onClick={() => setDetailFieldView("all")}
                            >
                              Show all {detailFieldStats.total} fields
                            </button>
                          </p>
                        ) : null}
                      </div>
                    );
                  }
                  return (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {visible.map((g) => (
                        <div
                          key={g.title}
                          className={cn(sectionCard, "overflow-hidden")}
                        >
                          <div className="px-5 py-4 border-b border-border/80 bg-gradient-to-r from-accent/45 via-accent/25 to-transparent">
                            <div className="flex items-start gap-3">
                              <div className="w-9 h-9 rounded-xl bg-primary/12 border border-primary/20 flex items-center justify-center shrink-0">
                                <g.icon className="w-4 h-4 text-brand-sand" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <h3 className="text-sm font-bold font-heading text-foreground">{g.title}</h3>
                                <p className="text-[11px] text-muted-foreground mt-0.5">{g.subtitle}</p>
                                <p className="text-[10px] text-muted-foreground/80 mt-1 font-medium tabular-nums">
                                  {g.rows.length} field{g.rows.length === 1 ? "" : "s"} in this group
                                </p>
                              </div>
                            </div>
                          </div>
                          <div className="divide-y divide-border/80 px-5">
                            {g.rows.map((d, i) => {
                              const missing = isDetailValueMissing(d.value);
                              return (
                                <div
                                  key={`${g.title}-${d.label}-${i}`}
                                  className={cn(
                                    "flex items-start justify-between py-3 gap-4",
                                    missing && "rounded-lg bg-muted/30 -mx-2 px-2",
                                  )}
                                >
                                  <span className="text-xs text-muted-foreground shrink-0 pt-0.5 max-w-[42%] flex items-center gap-1.5">
                                    {missing && detailFieldView === "all" && (
                                      <span
                                        className="w-1.5 h-1.5 rounded-full bg-muted-foreground/35 shrink-0"
                                        title="No value in feed"
                                        aria-hidden
                                      />
                                    )}
                                    {d.label}
                                  </span>
                                  <span
                                    className={cn(
                                      "text-sm font-semibold text-right leading-6 tabular-nums break-words max-w-[55%]",
                                      missing ? "text-muted-foreground font-medium" : "text-foreground",
                                    )}
                                  >
                                    {d.value}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Description */}
            {listing.description && (
              <div id="listing-description" className={cn(scrollSectionClass, sectionCard, "overflow-hidden")}>
                <div className="border-b border-border/70 bg-gradient-to-r from-accent/50 via-accent/25 to-transparent px-6 py-4 sm:px-7 sm:py-5">
                  <h2 className="text-base font-bold font-heading text-foreground flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center ring-1 ring-primary/20">
                      <ClipboardList className="w-3.5 h-3.5 text-primary-text" />
                    </div>
                    Description
                  </h2>
                  <p className="text-[11px] text-muted-foreground mt-1.5 pl-9 max-w-2xl leading-relaxed">
                    Marketing copy from the feed. Long text scrolls inside this panel.
                  </p>
                </div>
                <div className="px-6 py-5 sm:px-7 sm:py-6">
                  <div className="text-[15px] text-foreground/85 whitespace-pre-line leading-[1.75] max-h-[min(52vh,440px)] overflow-y-auto pr-1 text-pretty [scrollbar-width:thin]">
                    {listing.description}
                  </div>
                </div>
              </div>
            )}

            {/* Media: 360, video, floor plan */}
            {mediaLinks.length > 0 && (
              <div id="listing-media" className={cn(scrollSectionClass, sectionCard, "overflow-hidden")}>
                <div className="px-6 py-4 border-b border-border/80 bg-gradient-to-r from-accent/50 via-accent/30 to-transparent sm:px-7 sm:py-5">
                  <div className="listing-eyebrow mb-1">Walkthroughs & documents</div>
                  <h2 className="text-base font-bold font-heading text-foreground flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center ring-1 ring-primary/20">
                      <Video className="w-3.5 h-3.5 text-primary-text" />
                    </div>
                    Media & tours
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1.5 max-w-xl">
                    YouTube, Vimeo, and direct video files play in-page. Other URLs open in a new tab.
                  </p>
                </div>
                {videoTourPlaysInline && listing.videoTourUrl?.trim() ? (
                  <div className="px-5 sm:px-6 pb-2">
                    <VideoTourPlayer rawUrl={listing.videoTourUrl} title="Video tour" />
                  </div>
                ) : null}
                <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {mediaLinks.map((m) => {
                    if (m.kind === "video" && videoTourPlaysInline) {
                      return null;
                    }
                    const Icon = m.kind === "360" ? Scan : m.kind === "video" ? Video : FileImage;
                    return (
                      <a
                        key={`${m.kind}-${m.href}`}
                        href={m.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex flex-col gap-2 rounded-2xl border border-border/90 bg-accent/30 p-4 hover:border-primary/35 hover:bg-accent/60 transition-all"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-primary/12 border border-primary/20 flex items-center justify-center shrink-0">
                            <Icon className="w-4 h-4 text-brand-sand" />
                          </div>
                          <span className="text-sm font-bold font-heading text-foreground group-hover:text-primary-text transition-colors">
                            {m.label}
                          </span>
                        </div>
                        <span className="text-[11px] text-muted-foreground line-clamp-2 break-all font-mono">{m.href}</span>
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary-text mt-auto">
                          Open <ExternalLink className="w-3 h-3" />
                        </span>
                      </a>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Amenities */}
            {listing.amenities.length > 0 && (
              <div id="listing-amenities" className={cn(scrollSectionClass, sectionCard, "overflow-hidden")}>
                <div className="border-b border-border/70 bg-gradient-to-r from-accent/50 via-accent/25 to-transparent px-6 py-4 sm:px-7 sm:py-5">
                  <h2 className="text-base font-bold font-heading text-foreground flex flex-wrap items-center gap-2 gap-y-1">
                    <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center ring-1 ring-primary/20">
                      <CheckCircle2 className="w-3.5 h-3.5 text-primary-text" />
                    </div>
                    Amenities &amp; features
                    <span className="sm:ml-auto text-xs text-muted-foreground font-normal tabular-nums">{listing.amenities.length} listed</span>
                  </h2>
                </div>
                <div className="p-5 sm:p-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                  {listing.amenities.map((a, i) => (
                    <div key={i} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-accent/80 border border-border/80 text-sm hover:border-primary/25 hover:bg-accent transition-colors">
                      <CheckCircle2 className="w-3.5 h-3.5 text-primary-text flex-shrink-0" />
                      <span className="text-foreground/85 font-medium leading-snug">{a}</span>
                    </div>
                  ))}
                  </div>
                </div>
              </div>
            )}

            {/* Location map — large contained card; wider default view (lower zoom) */}
            {hasMapCoords && (
              <div
                id="listing-map"
                className={cn(
                  scrollSectionClass,
                  sectionCard,
                  "overflow-hidden shadow-[0_12px_40px_-18px_rgba(0,0,0,0.22)]",
                )}
              >
                <div className="px-5 sm:px-6 py-4 sm:py-5 border-b border-border/80 bg-gradient-to-r from-accent/40 via-accent/20 to-transparent flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold font-heading text-foreground flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center ring-1 ring-primary/20">
                        <MapPin className="w-3.5 h-3.5 text-primary-text" />
                      </div>
                      Location
                    </h2>
                    <p className="text-[11px] text-muted-foreground mt-1 pl-9 max-w-xl leading-relaxed">
                      Map uses your feed&apos;s latitude and longitude (including <span className="font-mono">geopoints</span> when mapped).{" "}
                      Use the layer control (top-right) to switch <strong className="text-foreground font-medium">Map</strong> (OpenStreetMap) or{" "}
                      <strong className="text-foreground font-medium">Satellite</strong> (Esri imagery). No API key required.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1.5 shrink-0 max-w-full">
                    <a
                      href={openStreetMapPinUrl(listing.latitude!, listing.longitude!)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-primary-text hover:text-primary-text/80 transition-colors"
                    >
                      OSM <ExternalLink className="w-3 h-3" />
                    </a>
                    <span className="text-border text-xs hidden sm:inline" aria-hidden>
                      ·
                    </span>
                    <a
                      href={googleMapsQueryUrl(listing.latitude!, listing.longitude!)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Google (map) <ExternalLink className="w-3 h-3" />
                    </a>
                    <span className="text-border text-xs hidden sm:inline" aria-hidden>
                      ·
                    </span>
                    <a
                      href={googleMapsSatelliteUrl(listing.latitude!, listing.longitude!)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Google (satellite) <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
                <ListingsMap
                  listings={[listing]}
                  embedded
                  heightClassName="h-[min(60vh,720px)] min-h-[280px] sm:min-h-[400px] w-full"
                  fitSingleZoom={12}
                  defaultBaseLayer="satellite"
                />
              </div>
            )}

            <section
              id="listing-technical"
              className={cn(scrollSectionClass, "space-y-4")}
              aria-labelledby="listing-technical-heading"
            >
              <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
                <div>
                  <div className="listing-eyebrow mb-1">Source</div>
                  <h2
                    id="listing-technical-heading"
                    className="text-lg font-semibold font-heading text-foreground flex items-center gap-2"
                  >
                    <span className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center ring-1 ring-primary/20">
                      <Code className="w-3.5 h-3.5 text-primary-text" />
                    </span>
                    Feed &amp; technical
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1.5 max-w-xl leading-relaxed">
                    Raw XML and field mapping for debugging imports and reconciling values with the UI.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
            <div className={cn(sectionCard, "overflow-hidden bg-card/95")}>
              <button
                type="button"
                onClick={() => setShowRaw(!showRaw)}
                aria-expanded={showRaw}
                aria-controls="listing-detail-raw-xml"
                className="w-full flex items-center justify-between px-6 py-4 hover:bg-accent/80 transition-colors text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/40"
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                  <Code className="w-4 h-4 text-primary-text" aria-hidden />Raw XML
                </span>
                <ChevronRight className={cn("w-4 h-4 text-muted-foreground transition-transform duration-200 shrink-0", showRaw && "rotate-90")} aria-hidden />
              </button>
              {showRaw && (
                <pre
                  id="listing-detail-raw-xml"
                  className="px-6 pb-6 bg-muted text-xs font-mono text-muted-foreground overflow-x-auto max-h-96 leading-relaxed border-t border-border"
                >
                  {rawXml}
                </pre>
              )}
            </div>

            <div className={cn(sectionCard, "overflow-hidden bg-card/95")}>
              <button
                type="button"
                onClick={() => setShowXmlElements(!showXmlElements)}
                aria-expanded={showXmlElements}
                aria-controls="listing-detail-xml-mapping"
                className="w-full flex items-center justify-between px-6 py-4 hover:bg-accent/80 transition-colors text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/40"
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                  <Code className="w-4 h-4 text-primary-text" aria-hidden />XML Field Mapping
                  <span className="ml-1 text-[10px] text-muted-foreground font-normal">({xmlFlat.length} entries)</span>
                </span>
                <ChevronRight className={cn("w-4 h-4 text-muted-foreground transition-transform duration-200 shrink-0", showXmlElements && "rotate-90")} aria-hidden />
              </button>
              {showXmlElements && (
                <div id="listing-detail-xml-mapping" className="border-t border-border/80">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
                    {/* Tree */}
                    <div className="border-r border-border">
                      <div className="px-4 py-2.5 bg-accent border-b border-border">
                        <div className="text-xs font-semibold text-muted-foreground">XML Tree</div>
                      </div>
                      <div className="max-h-[480px] overflow-y-auto">
                        <XmlTree nodes={xmlTree} defaultOpenDepth={3} />
                      </div>
                    </div>
                    {/* Flat paths */}
                    <div>
                      <div className="px-4 py-2.5 bg-accent border-b border-border flex items-center justify-between gap-2 flex-wrap">
                        <div className="text-xs font-semibold text-muted-foreground">Field Mapping</div>
                        <div className="flex items-center gap-1">
                          {(["all", "mapped", "unmapped", "changed"] as const).map(f => (
                            <button
                              key={f}
                              type="button"
                              onClick={() => setXmlFilter(f)}
                              disabled={f === "changed" && (!listingDiff || listingDiff.changedKeys.length === 0)}
                              aria-pressed={xmlFilter === f}
                              aria-label={`Filter field mapping: ${f}`}
                              className={cn(
                                "px-2.5 py-0.5 rounded-full text-[10px] font-semibold transition-all capitalize focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/40",
                                xmlFilter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-background disabled:opacity-30"
                              )}
                            >
                              {f}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="max-h-[480px] overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead className="sticky top-0 bg-card border-b border-border">
                            <tr>
                              <th className="text-left font-medium text-muted-foreground px-4 py-2 w-[48%]">XML Path</th>
                              <th className="text-left font-medium text-muted-foreground px-4 py-2 w-[30%]">Value</th>
                              <th className="text-left font-medium text-muted-foreground px-4 py-2 w-[22%]">Mapped</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {xmlFlat.filter(e => {
                              const mapped = mappedByPath.get(e.path);
                              if (xmlFilter === "all") return true;
                              if (xmlFilter === "mapped") return Boolean(mapped);
                              if (xmlFilter === "unmapped") return !mapped;
                              if (xmlFilter === "changed") return Boolean(mapped) && changedUiKeys.has(String(mapped));
                              return true;
                            }).map((e, i) => {
                              const mapped = mappedByPath.get(e.path);
                              const uiLabel = mapped ? (UI_FIELDS.find(f => f.key === mapped)?.label || mapped) : "";
                              const rawVal = Array.isArray(e.value) ? e.value.join(", ") : (e.value ?? "");
                              const value = String(rawVal).trim();
                              const valueDisplay = value ? value : "—";
                              const isChanged = Boolean(mapped && changedUiKeys.has(String(mapped)));
                              return (
                                <tr
                                  key={`${e.path}-${i}`}
                                  className={cn(
                                    "hover:bg-accent/60",
                                    isChanged && "bg-primary/8",
                                    !value && "bg-muted/40",
                                  )}
                                >
                                  <td className="px-4 py-2 font-mono text-[10px] text-muted-foreground align-top">{e.path}</td>
                                  <td
                                    className={cn(
                                      "px-4 py-2 align-top break-words max-w-[120px]",
                                      value ? "text-muted-foreground" : "text-muted-foreground/80 italic",
                                    )}
                                  >
                                    {value ? `${valueDisplay.slice(0, 120)}${value.length > 120 ? "…" : ""}` : "—"}
                                  </td>
                                  <td className="px-4 py-2 align-top">
                                    {mapped ? (
                                      <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold",
                                        isChanged ? "bg-primary text-primary-foreground" : "bg-primary/15 text-primary-text"
                                      )}>{uiLabel}</span>
                                    ) : (
                                      <span className="text-muted-foreground/60">—</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
              </div>
            </section>
          </div>

          {/* ── Sidebar ── */}
          <aside
            className="space-y-6 w-full min-w-0 lg:max-w-[380px] lg:justify-self-stretch lg:w-full"
            aria-label="Listing summary and contact"
          >
            {/* Agent card — sticky top clears header + full-width jump nav so it does not slide under the bar */}
            <div
              id="listing-contact"
              className={cn(
                scrollSectionClass,
                sectionCard,
                "overflow-hidden lg:sticky lg:self-start",
                stickyAsideTopClass,
              )}
            >
              {listing.agent.name ? (
                <>
                  <div className="relative w-full aspect-[4/5] bg-gradient-to-br from-primary/20 to-muted border-b border-border">
                    {listing.agent.photo ? (
                      <AgentPhoto variant="hero" fit="cover" src={listing.agent.photo} alt={listing.agent.name} />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center bg-muted/40">
                        <User className="w-16 h-16 text-muted-foreground/30" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-card via-card/40 to-transparent" />
                    <div className="absolute bottom-3 left-4 right-4 text-center">
                      <h3 className="text-lg font-extrabold font-heading text-foreground drop-shadow-sm">{listing.agent.name}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">Property consultant</p>
                    </div>
                  </div>
                  <div className="p-5 space-y-3">
                    <div className="flex flex-col gap-2">
                      <Button asChild variant="secondary" size="sm" className="w-full justify-center gap-2 rounded-xl font-semibold">
                        <Link to={`/agents/${encodeURIComponent(listing.agent.name)}`}>
                          <ExternalLink className="w-3.5 h-3.5" />
                          All-agency profile
                        </Link>
                      </Button>
                      {agenciesForListing.map((ag) => (
                        <Button key={ag} asChild variant="outline" size="sm" className="w-full justify-center rounded-xl text-xs font-semibold h-9">
                          <Link to={`/agencies/${encodeURIComponent(ag)}/agents/${encodeURIComponent(listing.agent.name)}`}>
                            {ag}
                          </Link>
                        </Button>
                      ))}
                    </div>
                    {listing.agent.phone && (
                      <a href={`tel:${listing.agent.phone}`}
                        className="flex items-center justify-center gap-2.5 w-full px-4 py-3 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm transition-colors shadow-lg shadow-primary/25"
                      >
                        <Phone className="w-4 h-4" />{listing.agent.phone}
                      </a>
                    )}
                    {listing.agent.email && (
                      <a href={`mailto:${listing.agent.email}`}
                        className="flex items-center justify-center gap-2.5 w-full px-4 py-3 rounded-xl border border-border bg-accent hover:bg-accent/80 text-muted-foreground hover:text-foreground font-semibold text-sm transition-colors"
                      >
                        <Mail className="w-4 h-4 text-primary-text" />{listing.agent.email}
                      </a>
                    )}
                  </div>
                </>
              ) : (
                <div className="p-8 text-center">
                  <User className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">No agent information</p>
                </div>
              )}
            </div>

            {/* Quick info */}
            <div className={cn(sectionCard, "p-5 sm:p-6")}>
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">At a glance</h3>
              <div className="space-y-0">
                {[
                  { label: "Reference", value: listing.reference, icon: Hash },
                  { label: "Permit No.", value: listing.permitNumber, icon: Shield },
                  ...(Number.isFinite(listing.downPaymentPrice) && listing.downPaymentPrice > 0
                    ? [{
                        label: "Down Payment",
                        value: listing.currency?.trim()
                          ? `${listing.currency.trim()} ${formatPriceFull(listing.downPaymentPrice)}`
                          : formatPriceFull(listing.downPaymentPrice),
                        icon: Banknote,
                      }]
                    : []),
                  ...(Number.isFinite(listing.serviceCharge) && listing.serviceCharge > 0
                    ? [{
                        label: "Service Charge",
                        value: listing.currency?.trim()
                          ? `${listing.currency.trim()} ${formatPriceFull(listing.serviceCharge)}`
                          : formatPriceFull(listing.serviceCharge),
                        icon: Banknote,
                      }]
                    : []),
                  { label: "Furnished", value: listing.furnished, icon: Home },
                  { label: "Completion", value: listing.completionStatus, icon: CheckCircle2 },
                  { label: "Last Update", value: listing.lastUpdate, icon: Calendar },
                ].filter(d => d.value).map((d, i) => (
                  <div key={i} className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
                    <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <d.icon className="w-3 h-3 text-primary-text/50" />{d.label}
                    </span>
                    <span className="text-xs font-medium text-foreground text-right max-w-[55%] truncate">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Location */}
            {(listing.address || listing.community || listing.city || listing.subCommunity || listing.propertyName) && (
              <div className={cn(sectionCard, "p-5 sm:p-6")}>
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-primary-text shrink-0" aria-hidden />
                  Location
                </h3>
                <div className="space-y-0">
                  {[
                    { label: "Address", value: listing.address },
                    { label: "City", value: listing.city },
                    { label: "Community", value: listing.community },
                    { label: "Sub Community", value: listing.subCommunity },
                    { label: "Building", value: listing.propertyName },
                  ].filter(d => d.value).map((d, i) => (
                    <div key={i} className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
                      <span className="text-xs text-muted-foreground">{d.label}</span>
                      <span className="text-xs font-medium text-foreground text-right max-w-[60%]">{d.value}</span>
                    </div>
                  ))}
                </div>
                {hasMapCoords && (
                  <div className="mt-4 flex flex-col gap-2">
                    <a
                      href={openStreetMapPinUrl(listing.latitude!, listing.longitude!)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-xl border border-border text-xs font-medium text-foreground hover:text-primary-text hover:border-primary/25 transition-all"
                    >
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      Open pin in OpenStreetMap
                    </a>
                    <a
                      href={googleMapsQueryUrl(listing.latitude!, listing.longitude!)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl border border-border/80 text-xs text-muted-foreground hover:text-foreground hover:border-border transition-all"
                    >
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      Google Maps (map)
                    </a>
                    <a
                      href={googleMapsSatelliteUrl(listing.latitude!, listing.longitude!)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl border border-border/80 text-xs text-muted-foreground hover:text-foreground hover:border-border transition-all"
                    >
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      Google Maps (satellite)
                    </a>
                  </div>
                )}
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
    </div>
  );
};

export default ListingDetailPage;
