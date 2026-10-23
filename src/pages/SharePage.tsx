import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Bath, BedDouble, ExternalLink, Link2Off, Loader2, Mail, MapPin, Maximize, Phone, Search } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { AgencyLogo } from "@/components/AgencyLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { getPublicShare } from "@/lib/accessApi";
import { fetchVersionListings } from "@/lib/versionBlobs";
import { formatPriceCompact, formatPriceFull, RENT_PERIOD_LABEL } from "@/lib/displayPrice";
import { timeAgo } from "@/components/sources/format";
import type { Listing } from "@/lib/types";

const PAGE = 24;

function useNoIndex() {
  useEffect(() => {
    const meta = Object.assign(document.createElement("meta"), { name: "robots", content: "noindex, nofollow" });
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-background">
      <header className="border-b border-border">
        <div className="container flex h-14 items-center justify-between">
          <BrandLogo />
          <span className="text-xs text-muted-foreground">Shared view · read-only</span>
        </div>
      </header>
      <main className="container py-6">{children}</main>
    </div>
  );
}

const priceLine = (l: Listing) =>
  l.price > 0 ? `${l.currency} ${formatPriceFull(l.price)}${l.purpose === "rent" ? ` ${RENT_PERIOD_LABEL[l.rentPeriod || "yearly"]}` : ""}` : "Price on application";

function ListingView({ listing }: { listing: Listing }) {
  const [photo, setPhoto] = useState(0);
  const images = listing.images ?? [];
  const facts = [
    listing.beds != null && { icon: BedDouble, text: listing.beds === 0 ? "Studio" : `${listing.beds} bed` },
    listing.baths > 0 && { icon: Bath, text: `${listing.baths} bath` },
    listing.area > 0 && { icon: Maximize, text: `${listing.area.toLocaleString()} ${listing.areaUnit || "sqft"}` },
  ].filter(Boolean) as { icon: typeof Bath; text: string }[];
  const mapUrl =
    listing.latitude != null && listing.longitude != null
      ? `https://www.google.com/maps?q=${listing.latitude},${listing.longitude}`
      : null;
  return (
    <article className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-2">
        {images.length > 0 ? (
          <>
            <img src={images[photo]} alt={`Photo ${photo + 1} of ${images.length}`} className="aspect-[4/3] w-full rounded-xl object-cover" />
            <div className="flex gap-2 overflow-x-auto pb-1">
              {images.slice(0, 20).map((src, i) => (
                <button
                  key={src + i}
                  type="button"
                  onClick={() => setPhoto(i)}
                  aria-label={`Show photo ${i + 1}`}
                  className={`h-16 w-20 shrink-0 overflow-hidden rounded-md border-2 ${i === photo ? "border-primary" : "border-transparent"}`}
                >
                  <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="flex aspect-[4/3] items-center justify-center rounded-xl bg-muted text-sm text-muted-foreground">No photos</div>
        )}
      </div>
      <div className="space-y-4">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {listing.purpose === "rent" ? "For rent" : listing.purpose === "sale" ? "For sale" : ""} · {listing.propertyType}
          </p>
          <h1 className="font-heading text-2xl font-bold leading-tight">{listing.title}</h1>
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4" aria-hidden /> {[listing.subCommunity, listing.community, listing.city].filter(Boolean).join(", ")}
          </p>
        </div>
        <p className="font-mono text-2xl font-semibold">{priceLine(listing)}</p>
        {facts.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {facts.map((f) => (
              <li key={f.text} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm">
                <f.icon className="h-4 w-4" aria-hidden /> {f.text}
              </li>
            ))}
          </ul>
        )}
        {(listing.agent?.name || listing.agent?.phone || listing.agent?.email) && (
          <div className="space-y-1 rounded-lg border p-3 text-sm">
            <p className="font-semibold">{listing.agent.name || "Agent"}</p>
            {listing.agent.phone && (
              <a href={`tel:${listing.agent.phone}`} className="flex items-center gap-2 hover:underline">
                <Phone className="h-4 w-4" aria-hidden /> {listing.agent.phone}
              </a>
            )}
            {listing.agent.email && (
              <a href={`mailto:${listing.agent.email}`} className="flex items-center gap-2 hover:underline">
                <Mail className="h-4 w-4" aria-hidden /> {listing.agent.email}
              </a>
            )}
          </div>
        )}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          {[
            ["Reference", listing.reference],
            ["Permit", listing.permitNumber],
            ["Furnished", listing.furnished],
            ["Completion", listing.completionStatus],
          ]
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
        </dl>
        {mapUrl && (
          <Button asChild variant="outline" size="sm">
            <a href={mapUrl} target="_blank" rel="noreferrer">
              <MapPin className="mr-1.5 h-4 w-4" /> Open in Google Maps <ExternalLink className="ml-1 h-3 w-3" />
            </a>
          </Button>
        )}
        {listing.description && <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{listing.description}</p>}
      </div>
    </article>
  );
}

function ListingsView({ url, onOpen }: { url: string; onOpen: (ref: string) => void }) {
  const { data, isLoading } = useQuery({ queryKey: ["share-listings", url], queryFn: () => fetchVersionListings(url), staleTime: Infinity });
  const [query, setQuery] = useState("");
  const [purpose, setPurpose] = useState<"all" | "sale" | "rent">("all");
  const [shown, setShown] = useState(PAGE);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? []).filter(
      (l) =>
        (purpose === "all" || l.purpose === purpose) &&
        (!q || `${l.title} ${l.community} ${l.subCommunity} ${l.propertyType} ${l.reference}`.toLowerCase().includes(q)),
    );
  }, [data, query, purpose]);
  if (isLoading || !data) {
    return (
      <p className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Loading listings…
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShown(PAGE);
            }}
            placeholder="Search title, community or type"
            className="pl-8"
            aria-label="Search listings"
          />
        </div>
        <ToggleGroup type="single" value={purpose} onValueChange={(v) => v && setPurpose(v as typeof purpose)} aria-label="Purpose">
          <ToggleGroupItem value="all">All</ToggleGroupItem>
          <ToggleGroupItem value="sale">For sale</ToggleGroupItem>
          <ToggleGroupItem value="rent">For rent</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <p className="text-sm text-muted-foreground">{filtered.length.toLocaleString()} listings</p>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.slice(0, shown).map((l) => (
          <li key={l.reference || l.id}>
            <button
              type="button"
              onClick={() => onOpen(l.id || l.reference)}
              className="block w-full overflow-hidden rounded-xl border bg-card text-left transition-shadow hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {l.images?.[0] ? (
                <img src={l.images[0]} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" />
              ) : (
                <div className="aspect-[4/3] bg-muted" />
              )}
              <div className="space-y-1 p-3">
                <p className="font-mono text-sm font-semibold">
                  {l.price > 0 ? `${formatPriceCompact(l.price)}${l.purpose === "rent" ? ` ${RENT_PERIOD_LABEL[l.rentPeriod || "yearly"]}` : ""}` : "POA"}
                </p>
                <p className="line-clamp-2 text-sm font-medium">{l.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {[l.beds === 0 ? "Studio" : l.beds ? `${l.beds} bed` : null, l.propertyType, l.community].filter(Boolean).join(" · ")}
                </p>
              </div>
            </button>
          </li>
        ))}
      </ul>
      {filtered.length > shown && (
        <div className="text-center">
          <Button variant="outline" onClick={() => setShown((n) => n + PAGE)}>
            Show more
          </Button>
        </div>
      )}
    </div>
  );
}

/** Public, read-only page behind a share link. No account, no navigation into the private app. */
export default function SharePage() {
  useNoIndex();
  const { token = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const openRef = params.get("listing");
  const share = useQuery({ queryKey: ["public-share", token], queryFn: () => getPublicShare(token), retry: false });
  const sourceListings = useQuery({
    queryKey: ["share-listings", share.data?.listingsUrl],
    queryFn: () => fetchVersionListings(share.data!.listingsUrl!),
    enabled: !!share.data?.listingsUrl && !!openRef,
    staleTime: Infinity,
  });

  if (share.isLoading) {
    return (
      <Shell>
        <p className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Opening shared view…
        </p>
      </Shell>
    );
  }
  if (share.error || !share.data) {
    return (
      <Shell>
        <div className="mx-auto max-w-md space-y-3 py-24 text-center">
          <Link2Off className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden />
          <h1 className="font-heading text-2xl font-bold">This link isn't available</h1>
          <p className="text-sm text-muted-foreground">It may have expired or been switched off. Ask the person who shared it for a new link.</p>
        </div>
      </Shell>
    );
  }

  const s = share.data;
  const header = (
    <div className="mb-6 flex flex-wrap items-center gap-3">
      <AgencyLogo src={s.source.agencyInfo?.logo} name={s.source.name} className="h-12 w-12 border" />
      <div className="min-w-0 flex-1">
        <p className="font-heading text-lg font-bold">{s.source.name}</p>
        <p className="text-xs text-muted-foreground">
          Updated {timeAgo(s.updatedAt)}
          {s.expiresAt ? ` · link expires ${timeAgo(s.expiresAt)}` : ""}
        </p>
      </div>
    </div>
  );

  if (s.kind === "listing") {
    return (
      <Shell>
        {header}
        {s.listing ? <ListingView listing={s.listing} /> : <p className="py-12 text-center text-muted-foreground">This listing is no longer in the agency's feed.</p>}
      </Shell>
    );
  }

  const opened = openRef ? sourceListings.data?.find((l) => (l.id || l.reference) === openRef) : null;
  return (
    <Shell>
      {header}
      {openRef ? (
        <div className="space-y-4">
          <Button variant="ghost" size="sm" onClick={() => setParams({})}>
            <ArrowLeft className="mr-1.5 h-4 w-4" /> All listings
          </Button>
          {opened ? (
            <ListingView listing={opened} />
          ) : sourceListings.isLoading ? (
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
          ) : (
            <p className="py-12 text-center text-muted-foreground">This listing is no longer in the agency's feed.</p>
          )}
        </div>
      ) : (
        <ListingsView url={s.listingsUrl!} onOpen={(ref) => setParams({ listing: ref })} />
      )}
      <p className="mt-10 text-center text-xs text-muted-foreground">
        Shared with <Link to="/" className="underline">Feed Viewer Pro</Link>
      </p>
    </Shell>
  );
}
