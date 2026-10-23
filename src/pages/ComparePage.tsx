import AppHeader from "@/components/AppHeader";
import { GitStyleDiffBlock } from "@/components/GitStyleDiffBlock";
import { ListingsMap } from "@/components/ListingsMap";
import { WorkflowCompareLinks } from "@/components/WorkflowCompareLinks";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  clearCompareListingIds,
  COMPARE_UPDATED_EVENT,
  getCompareListingIds,
  removeCompareListingId,
} from "@/lib/compareSelection";
import { Badge } from "@/components/ui/badge";
import { ListingImageUrlGrid } from "@/components/ListingImageUrlGrid";
import { formatListingFieldValue } from "@/lib/listingFieldFormat";
import { LISTING_COMPARE_FIELD_GROUPS } from "@/lib/listingCompareFieldGroups";
import { diffPlainText, type UnifiedDiffLine } from "@/lib/textLineDiff";
import type { Listing } from "@/lib/types";
import { UI_FIELDS } from "@/lib/types";
import { useAppData } from "@/providers/DataProvider";
import {
  GitCompare,
  Trash2,
  X,
  ImageOff,
  LayoutGrid,
  ArrowRight,
  AlertCircle,
  Link2,
  ExternalLink,
  MapPin,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

/** Labels for fields not listed in `UI_FIELDS`. */
const EXTRA_FIELD_LABELS: Partial<Record<keyof Listing, string>> = {
  sourceAgency: "Source agency (stream)",
  rawXml: "Raw XML",
};

function getLabel(key: keyof Listing): string {
  return (
    EXTRA_FIELD_LABELS[key] ?? UI_FIELDS.find((f) => f.key === key)?.label ?? String(key)
  );
}

/** Returns true when all values are identical across listings. */
function allSame(values: string[]): boolean {
  return values.every((v) => v === values[0]);
}

function diffHasLineChanges(lines: UnifiedDiffLine[]): boolean {
  return lines.some((l) => l.sign === "-" || l.sign === "+");
}

const formatPrice = (p: number, currency: string) => {
  if (!Number.isFinite(p) || p <= 0) return "POA";
  const prefix = currency ? `${currency} ` : "";
  if (p >= 1_000_000_000) return `${prefix}${(p / 1_000_000_000).toFixed(2)}B`;
  if (p >= 1_000_000) return `${prefix}${(p / 1_000_000).toFixed(2)}M`;
  if (p >= 100_000) return `${prefix}${Math.round(p / 1000)}K`;
  return `${prefix}${p.toLocaleString()}`;
};

function mediaLinkHref(raw: string): string {
  const s = raw.trim();
  if (!s || s === "—") return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("//")) return `https:${s}`;
  return `https://${s}`;
}

function CompareMediaLinkCell({ url, kind }: { url: string; kind: "360" | "video" | "floor" }) {
  const s = url.trim();
  if (!s || s === "—") {
    return <span className="text-muted-foreground/40">—</span>;
  }
  const href = mediaLinkHref(s);
  if (!href) {
    return <span className="text-muted-foreground/40">—</span>;
  }
  let host = "";
  try {
    host = new URL(href).hostname.replace(/^www\./, "");
  } catch {
    host = "";
  }
  const title =
    kind === "360" ? "360° tour" : kind === "video" ? "Video tour" : "Floor plan";
  return (
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
  );
}

function CompareAgentCell({ listing }: { listing: Listing }) {
  const a = listing.agent;
  const hasAny =
    a && (a.name?.trim() || a.phone?.trim() || a.email?.trim() || a.photo?.trim());
  if (!hasAny) {
    return <span className="text-muted-foreground/40">—</span>;
  }
  return (
    <div className="space-y-2 text-xs min-w-0">
      <div className="grid grid-cols-[minmax(3.5rem,auto)_1fr] gap-x-2 gap-y-1 items-baseline">
        <span className="text-muted-foreground font-medium">Name</span>
        <span className="break-words text-foreground">{a.name?.trim() || "—"}</span>
        <span className="text-muted-foreground font-medium">Phone</span>
        <span className="font-mono tabular-nums break-all text-foreground">{a.phone?.trim() || "—"}</span>
        <span className="text-muted-foreground font-medium">Email</span>
        {a.email?.trim() ? (
          <a href={`mailto:${a.email.trim()}`} className="text-primary-text underline break-all">
            {a.email.trim()}
          </a>
        ) : (
          <span className="text-foreground">—</span>
        )}
      </div>
      {a.photo?.trim() ? (
        <a
          href={a.photo.trim()}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-border/80 bg-background/80 p-1 pr-2 shadow-sm transition hover:border-primary/35"
        >
          <img
            src={a.photo.trim()}
            alt={`${a.name?.trim() || "Agent"} photo`}
            className="h-12 w-12 rounded-full object-cover"
            loading="lazy"
          />
          <span className="text-[10px] text-muted-foreground">Open photo</span>
          <ExternalLink className="w-3.5 h-3.5 shrink-0 text-muted-foreground" aria-hidden />
        </a>
      ) : null}
    </div>
  );
}

function CompareAmenitiesCell({ listing }: { listing: Listing }) {
  const arr = listing.amenities ?? [];
  if (!arr.length) {
    return <span className="text-muted-foreground/40">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {arr.map((x, i) => (
        <Badge key={`${x}-${i}`} variant="secondary" className="text-[10px] font-normal leading-tight px-1.5 py-0">
          {x}
        </Badge>
      ))}
    </div>
  );
}

function renderCompareCell(key: keyof Listing, listing: Listing): ReactNode {
  if (key === "images") {
    return <ListingImageUrlGrid urls={listing.images ?? []} compact className="max-w-none" />;
  }
  if (key === "amenities") {
    return <CompareAmenitiesCell listing={listing} />;
  }
  if (key === "agent") {
    return <CompareAgentCell listing={listing} />;
  }
  if (key === "view360") {
    return <CompareMediaLinkCell url={formatListingFieldValue("view360", listing)} kind="360" />;
  }
  if (key === "videoTourUrl") {
    return <CompareMediaLinkCell url={formatListingFieldValue("videoTourUrl", listing)} kind="video" />;
  }
  if (key === "floorPlanUrl") {
    return <CompareMediaLinkCell url={formatListingFieldValue("floorPlanUrl", listing)} kind="floor" />;
  }
  if (key === "description") {
    const t = formatListingFieldValue("description", listing);
    if (t === "—") {
      return <span className="text-muted-foreground/40">—</span>;
    }
    return (
      <div className="whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground/95">
        {t}
      </div>
    );
  }
  if (key === "rawXml") {
    const s = typeof listing.rawXml === "string" ? listing.rawXml : "";
    if (!s.length) {
      return <span className="text-muted-foreground/40">—</span>;
    }
    const preview = s.length > 8000 ? `${s.slice(0, 8000)}…` : s;
    return (
      <div className="min-w-0 space-y-1.5">
        <p className="text-[10px] font-medium text-muted-foreground tabular-nums">
          {s.length.toLocaleString()} characters
        </p>
        <pre className="max-h-44 overflow-auto rounded-md border border-border/60 bg-muted/25 p-2.5 font-mono text-[10px] leading-relaxed text-foreground/90 whitespace-pre-wrap break-all">
          {preview}
        </pre>
      </div>
    );
  }
  const val = formatListingFieldValue(key, listing);
  if (val === "—") {
    return <span className="text-muted-foreground/40">—</span>;
  }
  return <span className="break-words">{val}</span>;
}

// ── Empty / not-found states ──────────────────────────────────────────────────
const EmptyState = () => (
  <div className="min-h-screen bg-background">
    <AppHeader />
    <div className="flex flex-col items-center justify-center py-24 px-4 text-center max-w-md mx-auto">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-5">
        <GitCompare className="w-8 h-8 text-primary-text/60" />
      </div>
      <h1 className="text-2xl font-extrabold font-heading text-foreground mb-2">Compare listings</h1>
      <p className="text-muted-foreground text-sm mb-2 leading-relaxed">
        Select at least <strong className="text-foreground">2 properties</strong> using the{" "}
        <span className="inline-flex items-center gap-0.5 font-semibold text-foreground">
          <GitCompare className="w-3.5 h-3.5" /> compare
        </span>{" "}
        button on any listing card or detail page.
      </p>
      <p className="text-muted-foreground text-xs mb-6">Up to 4 properties can be compared at once.</p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center mb-8">
        <Button asChild>
          <Link to="/listings" className="gap-2">
            <LayoutGrid className="w-4 h-4" />
            Browse listings
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/cross-agency-dupes" className="gap-2">
            <Link2 className="w-4 h-4" />
            Find cross-agency dupes
          </Link>
        </Button>
      </div>
      <div className="w-full max-w-lg rounded-xl border border-border bg-muted/25 px-4 py-3 text-left">
        <WorkflowCompareLinks current="listing-compare" heading="Related workflows" className="text-[11px]" />
      </div>
    </div>
  </div>
);

const StaleState = () => (
  <div className="min-h-screen bg-background">
    <AppHeader />
    <div className="flex flex-col items-center justify-center py-24 px-4 text-center max-w-md mx-auto">
      <AlertCircle className="w-12 h-12 text-yellow-500 mb-4" />
      <h2 className="text-xl font-bold font-heading text-foreground mb-2">Listings not found</h2>
      <p className="text-muted-foreground text-sm mb-6">
        Some selected listings are not in the current dataset. Try switching to the{" "}
        <strong className="text-foreground">All sources</strong> scope on the Listings page.
      </p>
      <div className="flex gap-2 flex-wrap justify-center">
        <Button variant="outline" onClick={() => clearCompareListingIds()}>
          <Trash2 className="w-4 h-4 mr-1.5" />
          Clear compare list
        </Button>
        <Button asChild>
          <Link to="/listings" className="gap-1.5">
            <ArrowRight className="w-4 h-4" />
            Go to Listings
          </Link>
        </Button>
      </div>
    </div>
  </div>
);

const COMPARE_PRIMARY_KEY = "feedview.compare.primary";

type ComparePrimaryView = "matrix" | "map";

function readComparePrimary(): ComparePrimaryView | null {
  try {
    const r = sessionStorage.getItem(COMPARE_PRIMARY_KEY);
    if (r === "matrix" || r === "map") return r;
  } catch {
    /* ignore */
  }
  return null;
}

// ── Main Compare Page ─────────────────────────────────────────────────────────
const ComparePage = () => {
  const { listings, listingsByAgency } = useAppData();
  const [ids, setIds] = useState<string[]>(() => getCompareListingIds());
  const [primaryView, setPrimaryView] = useState<ComparePrimaryView>(() => readComparePrimary() ?? "matrix");

  useEffect(() => {
    const onUpd = () => setIds([...getCompareListingIds()]);
    window.addEventListener(COMPARE_UPDATED_EVENT, onUpd);
    return () => window.removeEventListener(COMPARE_UPDATED_EVENT, onUpd);
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(COMPARE_PRIMARY_KEY, primaryView);
    } catch {
      /* ignore */
    }
  }, [primaryView]);

  const listingById = useMemo(() => {
    const m = new Map<string, Listing>();
    for (const l of listings) m.set(l.id, l);
    for (const arr of listingsByAgency.values()) {
      for (const l of arr) m.set(l.id, l);
    }
    return m;
  }, [listings, listingsByAgency]);

  const compared = useMemo(
    () => ids.map((id) => listingById.get(id)).filter(Boolean) as Listing[],
    [ids, listingById]
  );

  const firstSecondTextDiff = useMemo(() => {
    if (compared.length < 2) {
      return {
        title: diffPlainText("", ""),
        description: diffPlainText("", ""),
      };
    }
    const a = compared[0];
    const b = compared[1];
    return {
      title: diffPlainText(a.title ?? "", b.title ?? ""),
      description: diffPlainText(a.description ?? "", b.description ?? ""),
    };
  }, [compared]);

  const compareMapListings = useMemo(
    () =>
      compared.filter(
        (l) =>
          l.latitude != null &&
          l.longitude != null &&
          Number.isFinite(l.latitude) &&
          Number.isFinite(l.longitude),
      ),
    [compared],
  );
  const showCompareMap = compareMapListings.length > 0;

  if (ids.length < 2) return <EmptyState />;
  if (compared.length < 2) return <StaleState />;

  const colCount = compared.length;

  const showFirstSecondDiff =
    colCount >= 2 &&
    (diffHasLineChanges(firstSecondTextDiff.title.lines) ||
      diffHasLineChanges(firstSecondTextDiff.description.lines));

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="w-full min-w-0 max-w-full mx-auto px-3 sm:px-5 lg:px-8 py-6 lg:py-8">
        {/* ── Page header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold font-heading text-foreground flex items-center gap-2.5">
              <GitCompare className="w-6 h-6 text-primary-text shrink-0" />
              Compare
              <span className="text-base font-semibold text-muted-foreground">({compared.length} properties)</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Full mapped fields and raw XML snippet. Rows with a <span className="text-primary-text font-medium">highlight</span> differ
              between listings.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => clearCompareListingIds()}>
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              Clear all
            </Button>
            <Button asChild variant="default" size="sm">
              <Link to="/listings">
                <LayoutGrid className="w-3.5 h-3.5 mr-1.5" />
                Back to listings
              </Link>
            </Button>
          </div>
        </div>

        <div className="mb-5 rounded-lg border border-border/60 bg-card/40 px-3 py-2">
          <WorkflowCompareLinks current="listing-compare" className="text-[11px] sm:text-xs" />
        </div>

        <Tabs
          value={primaryView}
          onValueChange={(v) => setPrimaryView(v as ComparePrimaryView)}
          className="w-full space-y-4"
        >
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/35 p-1 sm:inline-flex sm:w-auto">
            <TabsTrigger value="matrix" className="gap-2 rounded-lg">
              <LayoutGrid className="w-4 h-4 shrink-0 opacity-70" aria-hidden />
              Field matrix
            </TabsTrigger>
            <TabsTrigger value="map" className="gap-2 rounded-lg">
              <MapPin className="w-4 h-4 shrink-0 opacity-70" aria-hidden />
              Location map
              {showCompareMap ? (
                <span className="text-[10px] tabular-nums text-muted-foreground">({compareMapListings.length})</span>
              ) : null}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="matrix" className="mt-0 space-y-6 outline-none focus-visible:outline-none">
            <div className="rounded-xl border border-border/80 bg-card/30 overflow-hidden w-full shadow-sm">
          <div className="overflow-x-auto w-full">
            <table className="w-full min-w-0 table-fixed border-collapse">
              <colgroup>
                <col style={{ width: "13.5rem" }} />
                {compared.map((l) => (
                  <col key={l.id} />
                ))}
              </colgroup>

              {/* ── Column header row (photos + title) ── */}
              <thead>
                <tr className="bg-muted/30">
                  {/* sticky label cell */}
                  <th className="sticky left-0 z-20 bg-muted/30 backdrop-blur-sm border-r border-border/80 px-3 sm:px-4 py-3 min-w-0 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.12)]">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Field</span>
                  </th>

                  {compared.map((l) => (
                    <th
                      key={l.id}
                      className="border-r border-border/80 last:border-r-0 px-2 sm:px-3 py-3 text-left align-top min-w-0"
                    >
                      {/* Photo */}
                      <div className="rounded-xl overflow-hidden mb-3 border border-border" style={{ aspectRatio: "16/10" }}>
                        {l.images[0] ? (
                          <img
                            src={l.images[0]}
                            alt={l.title}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-muted text-muted-foreground/30">
                            <ImageOff className="w-8 h-8" />
                          </div>
                        )}
                      </div>

                      {/* Title + remove */}
                      <div className="flex items-start justify-between gap-1.5">
                        <div className="min-w-0">
                          <Link
                            to={`/listing/${encodeURIComponent(l.id)}`}
                            className="text-sm font-semibold text-primary-text hover:underline line-clamp-2 leading-snug"
                          >
                            {l.title || "Untitled"}
                          </Link>
                          <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{l.reference}</p>
                          {/* Price summary */}
                          <p className="text-base font-extrabold font-heading text-foreground mt-1.5">
                            {formatPrice(l.price, l.currency)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeCompareListingId(l.id)}
                          title="Remove from compare"
                          aria-label={`Remove ${l.title || l.reference || "listing"} from compare`}
                          className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors mt-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/40"
                        >
                          <X className="w-3.5 h-3.5" aria-hidden />
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              {/* ── Field rows ── */}
              <tbody>
                {LISTING_COMPARE_FIELD_GROUPS.map(({ group, keys }) => (
                  <Fragment key={group}>
                    {/* Group separator */}
                    <tr className="bg-muted/50 border-t border-border/80">
                      <td
                        colSpan={colCount + 1}
                        className="sticky left-0 px-3 sm:px-4 py-2"
                      >
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.2em]">
                          {group}
                        </span>
                      </td>
                    </tr>

                    {keys.map((key) => {
                      const values = compared.map((l) => formatListingFieldValue(key, l));
                      const same = allSame(values);

                      return (
                        <tr
                          key={String(key)}
                          className={cn(
                            "border-t border-border/50 transition-colors",
                            !same
                              ? "bg-primary/[0.06] dark:bg-primary/[0.09] hover:bg-primary/[0.08]"
                              : "hover:bg-muted/20",
                          )}
                        >
                          {/* Sticky label */}
                          <td
                            className={cn(
                              "sticky left-0 z-10 border-r border-border/80 px-3 sm:px-4 py-2.5 min-w-0 align-top shadow-[4px_0_12px_-4px_rgba(0,0,0,0.08)]",
                              !same ? "bg-primary/[0.06] dark:bg-primary/[0.09]" : "bg-background/95 dark:bg-background/90",
                            )}
                          >
                            <div className="flex items-start gap-2">
                              <span
                                className={cn(
                                  "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                                  !same ? "bg-primary" : "bg-muted-foreground/25",
                                )}
                                aria-hidden
                              />
                              <span
                                className={cn(
                                  "text-xs font-medium leading-snug",
                                  same ? "text-muted-foreground" : "text-foreground",
                                )}
                              >
                                {getLabel(key)}
                              </span>
                            </div>
                          </td>

                          {/* Value cells */}
                          {compared.map((l, ci) => {
                            const val = values[ci];
                            const isDiff = !same && val !== values[0];
                            const longCell =
                              key === "description" ||
                              key === "images" ||
                              key === "amenities" ||
                              key === "agent" ||
                              key === "rawXml";
                            return (
                              <td
                                key={l.id}
                                className={cn(
                                  "px-2 sm:px-3 py-2.5 text-sm border-r border-border/50 last:border-r-0 align-top min-w-0",
                                  !same ? "bg-primary/[0.06] dark:bg-primary/[0.09]" : "bg-background/40",
                                  longCell && "max-h-[min(24rem,50vh)] overflow-y-auto",
                                  key === "description" && "whitespace-pre-wrap text-xs leading-relaxed",
                                  key === "rawXml" && "font-mono text-[11px]",
                                  isDiff &&
                                    key !== "images" &&
                                    key !== "amenities" &&
                                    key !== "agent" &&
                                    key !== "view360" &&
                                    key !== "videoTourUrl" &&
                                    key !== "floorPlanUrl" &&
                                    key !== "rawXml"
                                    ? "text-primary-text font-semibold dark:text-primary-text"
                                    : "text-foreground",
                                )}
                              >
                                {renderCompareCell(key, l)}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {showFirstSecondDiff ? (
          <section
            className="mt-6 rounded-xl border border-border/80 bg-card/30 overflow-hidden shadow-sm"
            aria-labelledby="compare-line-diff-heading"
          >
            <div className="border-b border-border/70 bg-muted/25 px-3 sm:px-4 py-3">
              <h2 id="compare-line-diff-heading" className="text-sm font-semibold text-foreground">
                Git-style line diff (1st vs 2nd column)
              </h2>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Unified diff for title and description — same engine as feed compare.{" "}
                {colCount > 2 ? (
                  <span className="text-amber-700 dark:text-amber-400/90">
                    With {colCount} columns, only the first two listings are diffed here; the table above still shows all columns.
                  </span>
                ) : null}
              </p>
            </div>
            <div className="p-3 sm:p-4 space-y-4">
              <GitStyleDiffBlock
                label="Title"
                lines={firstSecondTextDiff.title.lines}
                truncated={firstSecondTextDiff.title.truncated}
                fallback={firstSecondTextDiff.title.fallback}
                maxHeightClass="max-h-40"
              />
              <GitStyleDiffBlock
                label="Description"
                lines={firstSecondTextDiff.description.lines}
                truncated={firstSecondTextDiff.description.truncated}
                fallback={firstSecondTextDiff.description.fallback}
              />
            </div>
          </section>
        ) : null}

            <p className="mt-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
                Different values
              </span>
              <span className="mx-2 text-border">·</span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" aria-hidden />
                Same
              </span>
            </p>
          </TabsContent>

          <TabsContent value="map" className="mt-0 outline-none focus-visible:outline-none">
            {showCompareMap ? (
              <section
                className="rounded-xl border border-border/80 bg-card/30 overflow-hidden shadow-sm"
                aria-labelledby="compare-map-heading"
              >
                <div className="border-b border-border/70 bg-muted/25 px-3 sm:px-4 py-3">
                  <h2 id="compare-map-heading" className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-primary-text shrink-0" aria-hidden />
                    Locations on map
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Pins use each listing&apos;s latitude and longitude (same coordinates as XML field mapping and the listing
                    locations map). Use the layer control for <span className="text-foreground/90">Map</span> (streets) or{" "}
                    <span className="text-foreground/90">Satellite</span> (aerial). Marker popups include{" "}
                    <span className="text-foreground/90">Google (map)</span>,{" "}
                    <span className="text-foreground/90">Google (satellite)</span>, and OSM links.
                  </p>
                </div>
                <ListingsMap listings={compared} heightClassName="h-[min(42vh,380px)]" defaultBaseLayer="satellite" />
              </section>
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-muted/15 px-4 py-12 text-center space-y-3">
                <MapPin className="w-10 h-10 mx-auto text-muted-foreground/40" aria-hidden />
                <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                  None of the compared listings have usable coordinates yet. Map latitude and longitude in{" "}
                  <Link to="/field-mapping" className="text-primary-text font-medium underline underline-offset-2">
                    XML field mapping
                  </Link>{" "}
                  or confirm your feed supplies geo fields.
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default ComparePage;
