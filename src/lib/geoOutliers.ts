import { areaSqft } from "@/lib/marketAnalysis";
import { MARKETS, annualRent, inMarketBounds, marketOf, type MarketCode } from "@/lib/markets";
import type { Listing } from "@/lib/types";

/**
 * Location and price outliers for listings on a map, judged within each listing's own market.
 *
 * - Placeholder (0,0), swapped latitude/longitude, and pins outside the listing's country.
 * - Default coordinates: one point reused by listings in several different communities (one
 *   building's listings sharing a point is normal and not flagged).
 * - Far from its city: beyond twice the city's 95th-percentile distance (or median + 10 MAD); the market
 *   centre is used only for listings whose city has too few listings.
 * - Wrong community: far from the median location of the listing's own community.
 * - Price vs neighbours: price per sq ft against the median of the nearest similar listings
 *   (same market, purpose and property family; Lu et al.'s median neighbourhood function).
 */

export type OutlierKind = "zero" | "swapped" | "outside_market" | "default_coords" | "far_from_city" | "wrong_community" | "price_vs_neighbours";
export type OutlierSeverity = "high" | "medium" | "low";

export const OUTLIER_KINDS: Record<OutlierKind, { label: string; description: string; severity: OutlierSeverity; location: boolean }> = {
  zero: { label: "Placeholder (0, 0)", description: "Coordinates are 0, 0: the feed has no real location.", severity: "high", location: true },
  swapped: { label: "Latitude and longitude swapped", description: "Swapping the two values puts the pin inside the listing's country.", severity: "high", location: true },
  outside_market: { label: "Outside its country", description: "The pin is outside the listing's market; Ziba re-geocodes it from the address.", severity: "high", location: true },
  default_coords: { label: "Default coordinates", description: "The same point is used by listings in several different communities, usually a fallback such as the city centre.", severity: "medium", location: true },
  far_from_city: { label: "Far from its city", description: "More than twice as far from its city's centre as 95% of that city's listings. Usually a wrong pin or a wrong city label (e.g. an Abu Dhabi community filed under Dubai).", severity: "medium", location: true },
  wrong_community: { label: "Not in its community", description: "Far from where the other listings of the same community are.", severity: "medium", location: true },
  price_vs_neighbours: { label: "Price unlike neighbours", description: "Price per sq ft is 3× above or below similar listings nearby.", severity: "medium", location: false },
};

const SEVERITY_WEIGHT: Record<OutlierSeverity, number> = { high: 3, medium: 2, low: 1 };

export type OutlierFlag = { kind: OutlierKind; severity: OutlierSeverity; detail: string };

export type GeoOutlier = {
  listing: Listing;
  market: MarketCode;
  flags: OutlierFlag[];
  /** Sum of flag severities: sort key for review. */
  score: number;
  kmFromMarketCentre: number | null;
  kmFromCommunityCentre: number | null;
  ppsf: number | null;
  neighbourPpsf: number | null;
  /** ppsf ÷ neighbour median. */
  ppsfRatio: number | null;
};

export type MarketCluster = {
  code: MarketCode;
  centre: { lat: number; lng: number };
  /** Median distance from the centre (km). */
  typicalKm: number;
  /** 95th percentile distance (km): the ring drawn on the map. */
  ringKm: number;
  listings: number;
  outliers: number;
};

export type GeoOutlierResult = {
  byId: Map<string, GeoOutlier>;
  clusters: MarketCluster[];
  counts: Record<OutlierKind, number>;
};

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const quantile = (xs: number[], p: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * p;
  return s[Math.floor(i)] + (s[Math.ceil(i)] - s[Math.floor(i)]) * (i - Math.floor(i));
};
const mad = (xs: number[], m: number) => median(xs.map((x) => Math.abs(x - m)));

const typeFamily = (t: string) => {
  const s = (t || "").toLowerCase();
  if (/villa|town|bungalow/.test(s)) return "house";
  if (/land|plot/.test(s)) return "land";
  if (/office|shop|retail|warehouse|commercial|building|floor|show/.test(s)) return "commercial";
  return "apartment";
};

/** Price per sq ft (yearly for rents), or null. */
export function listingPpsf(l: Listing): number | null {
  const ft = areaSqft(l);
  if (!ft || !(l.price > 0) || (l.purpose !== "sale" && l.purpose !== "rent")) return null;
  return (l.purpose === "rent" ? annualRent(l) : l.price) / ft;
}

const hasPoint = (l: Listing) => l.latitude != null && l.longitude != null && Number.isFinite(l.latitude) && Number.isFinite(l.longitude);

const NEIGHBOURS = 10;
const MIN_NEIGHBOURS = 5;
const NEIGHBOUR_KM = 3;
const PRICE_RATIO = 3;

export function detectGeoOutliers(listings: Listing[]): GeoOutlierResult {
  const byId = new Map<string, GeoOutlier>();
  const counts = Object.fromEntries(Object.keys(OUTLIER_KINDS).map((k) => [k, 0])) as Record<OutlierKind, number>;
  const clusters: MarketCluster[] = [];
  const flag = (l: Listing, market: MarketCode, f: OutlierFlag, extra: Partial<GeoOutlier> = {}) => {
    let o = byId.get(l.id);
    if (!o) {
      o = { listing: l, market, flags: [], score: 0, kmFromMarketCentre: null, kmFromCommunityCentre: null, ppsf: null, neighbourPpsf: null, ppsfRatio: null };
      byId.set(l.id, o);
    }
    if (o.flags.some((x) => x.kind === f.kind)) return;
    o.flags.push(f);
    o.score += SEVERITY_WEIGHT[f.severity];
    Object.assign(o, extra);
    counts[f.kind]++;
  };

  const byMarket = new Map<MarketCode, Listing[]>();
  for (const l of listings) {
    if (!hasPoint(l)) continue;
    const c = marketOf(l).code;
    const arr = byMarket.get(c);
    if (arr) arr.push(l);
    else byMarket.set(c, [l]);
  }

  // Default coordinates: one rounded point used across 3+ different communities.
  const pointCommunities = new Map<string, Set<string>>();
  const pointKey = (l: Listing) => `${l.latitude!.toFixed(4)},${l.longitude!.toFixed(4)}`;
  for (const l of listings) {
    if (!hasPoint(l)) continue;
    const k = pointKey(l);
    const set = pointCommunities.get(k) ?? new Set<string>();
    set.add((l.community || "").trim().toLowerCase());
    pointCommunities.set(k, set);
  }

  for (const [code, group] of byMarket) {
    const market = MARKETS[code];
    const valid: Listing[] = [];
    for (const l of group) {
      const lat = l.latitude!;
      const lng = l.longitude!;
      if (Math.abs(lat) < 0.1 && Math.abs(lng) < 0.1) {
        flag(l, code, { kind: "zero", severity: "high", detail: `${lat}, ${lng}` });
      } else if (!inMarketBounds(market, lat, lng)) {
        if (inMarketBounds(market, lng, lat)) flag(l, code, { kind: "swapped", severity: "high", detail: `${lat}, ${lng} → ${lng}, ${lat}` });
        else flag(l, code, { kind: "outside_market", severity: "high", detail: `${lat.toFixed(4)}, ${lng.toFixed(4)} is outside ${market.name}` });
      } else valid.push(l);
      const shared = pointCommunities.get(pointKey(l));
      if (shared && shared.size >= 3 && !(Math.abs(lat) < 0.1 && Math.abs(lng) < 0.1)) {
        flag(l, code, { kind: "default_coords", severity: "medium", detail: `point shared by ${shared.size} communities` });
      }
    }
    if (!valid.length) continue;

    // Market cluster: robust centre and spread from in-country pins.
    const centre = { lat: median(valid.map((l) => l.latitude!)), lng: median(valid.map((l) => l.longitude!)) };
    const dist = valid.map((l) => haversineKm(centre, { lat: l.latitude!, lng: l.longitude! }));
    const dMed = median(dist);
    const dMad = mad(dist, dMed);
    valid.forEach((l, i) => {
      if (byId.has(l.id)) byId.get(l.id)!.kmFromMarketCentre = dist[i];
    });

    // Far from its city: multi-city markets (UAE: Dubai, Abu Dhabi, RAK…) are judged city by city.
    const byCity = new Map<string, Listing[]>();
    for (const l of valid) {
      const k = (l.city || "").trim().toLowerCase();
      const arr = byCity.get(k);
      if (arr) arr.push(l);
      else byCity.set(k, [l]);
    }
    for (const [city, members] of byCity) {
      const useCity = city && members.length >= 10;
      const c = useCity ? { lat: median(members.map((l) => l.latitude!)), lng: median(members.map((l) => l.longitude!)) } : centre;
      const ref = useCity ? members.map((l) => haversineKm(c, { lat: l.latitude!, lng: l.longitude! })) : dist;
      const m = median(ref);
      const madKm = mad(ref, m);
      // Cities are often long and thin (Dubai runs ~60 km along the coast), so "far" means beyond
      // twice the distance that 95% of the city's listings are within (or median + 10 MAD).
      const farKm = Math.max(m + 10 * madKm, 2 * quantile(ref, 0.95), 15);
      const where = useCity ? members[0].city.trim() : market.name;
      for (const l of members) {
        const km = haversineKm(c, { lat: l.latitude!, lng: l.longitude! });
        if (km > farKm) flag(l, code, { kind: "far_from_city", severity: "medium", detail: `${km.toFixed(1)} km from the centre of ${where} (95% of ${where} listings within ${quantile(ref, 0.95).toFixed(1)} km): wrong pin or wrong city` }, { kmFromMarketCentre: haversineKm(centre, { lat: l.latitude!, lng: l.longitude! }) });
      }
    }

    // Wrong community: compare with the community's own median location.
    const byCommunity = new Map<string, Listing[]>();
    for (const l of valid) {
      const k = (l.community || "").trim().toLowerCase();
      if (!k) continue;
      const arr = byCommunity.get(k);
      if (arr) arr.push(l);
      else byCommunity.set(k, [l]);
    }
    for (const members of byCommunity.values()) {
      if (members.length < 5) continue;
      const c = { lat: median(members.map((l) => l.latitude!)), lng: median(members.map((l) => l.longitude!)) };
      const d = members.map((l) => haversineKm(c, { lat: l.latitude!, lng: l.longitude! }));
      const m = median(d);
      const limit = Math.max(3, m + 6 * mad(d, m));
      members.forEach((l, i) => {
        if (d[i] > limit) {
          flag(l, code, { kind: "wrong_community", severity: d[i] > 3 * limit ? "high" : "medium", detail: `${d[i].toFixed(1)} km from the rest of ${l.community.trim()} (typical ${m.toFixed(1)} km)` }, { kmFromCommunityCentre: d[i] });
        }
      });
    }

    // Price vs nearest similar listings, via a ~2 km grid index.
    const CELL = 0.02;
    const cellKey = (lat: number, lng: number) => `${Math.floor(lat / CELL)}|${Math.floor(lng / CELL)}`;
    const priced = valid.map((l) => ({ l, ppsf: listingPpsf(l), fam: `${l.purpose}|${typeFamily(l.propertyType)}` })).filter((x) => x.ppsf != null) as { l: Listing; ppsf: number; fam: string }[];
    const grid = new Map<string, typeof priced>();
    for (const p of priced) {
      const k = cellKey(p.l.latitude!, p.l.longitude!);
      const arr = grid.get(k);
      if (arr) arr.push(p);
      else grid.set(k, [p]);
    }
    const reach = Math.ceil(NEIGHBOUR_KM / 2.2);
    for (const p of priced) {
      const cy = Math.floor(p.l.latitude! / CELL);
      const cx = Math.floor(p.l.longitude! / CELL);
      const near: { d: number; ppsf: number }[] = [];
      for (let dy = -reach; dy <= reach; dy++)
        for (let dx = -reach; dx <= reach; dx++)
          for (const q of grid.get(`${cy + dy}|${cx + dx}`) ?? []) {
            if (q === p || q.fam !== p.fam) continue;
            const d = haversineKm({ lat: p.l.latitude!, lng: p.l.longitude! }, { lat: q.l.latitude!, lng: q.l.longitude! });
            if (d <= NEIGHBOUR_KM) near.push({ d, ppsf: q.ppsf });
          }
      if (near.length < MIN_NEIGHBOURS) continue;
      near.sort((a, b) => a.d - b.d);
      const ref = median(near.slice(0, NEIGHBOURS).map((x) => x.ppsf));
      const ratio = p.ppsf / ref;
      if (ratio > PRICE_RATIO || ratio < 1 / PRICE_RATIO) {
        flag(
          p.l,
          code,
          { kind: "price_vs_neighbours", severity: ratio > 5 || ratio < 0.2 ? "high" : "medium", detail: `${ratio >= 1 ? `${ratio.toFixed(1)}× above` : `${(1 / ratio).toFixed(1)}× below`} ${Math.min(NEIGHBOURS, near.length)} nearby similar listings` },
          { ppsf: p.ppsf, neighbourPpsf: ref, ppsfRatio: ratio },
        );
      }
    }

    clusters.push({
      code,
      centre,
      typicalKm: dMed,
      ringKm: quantile(dist, 0.95),
      listings: group.length,
      outliers: group.filter((l) => byId.has(l.id)).length,
    });
  }
  clusters.sort((a, b) => b.listings - a.listings);
  return { byId, clusters, counts };
}

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Every outlier with its reasons and measurements, for review outside the app. */
export function geoOutliersCsv(outliers: GeoOutlier[], origin = ""): string {
  const head = ["reference", "source", "market", "severity_score", "flags", "details", "title", "community", "city", "purpose", "property_type", "price", "currency", "latitude", "longitude", "km_from_market_centre", "km_from_community_centre", "price_per_sqft", "neighbour_price_per_sqft", "ratio_to_neighbours", "link"];
  const rows = outliers.map((o) => {
    const l = o.listing;
    return [
      l.reference,
      l.sourceAgency ?? "",
      o.market,
      o.score,
      o.flags.map((f) => OUTLIER_KINDS[f.kind].label).join("; "),
      o.flags.map((f) => f.detail).join("; "),
      l.title,
      l.community,
      l.city,
      l.purpose,
      l.propertyType,
      l.price,
      l.currency,
      l.latitude,
      l.longitude,
      o.kmFromMarketCentre?.toFixed(2) ?? "",
      o.kmFromCommunityCentre?.toFixed(2) ?? "",
      o.ppsf?.toFixed(0) ?? "",
      o.neighbourPpsf?.toFixed(0) ?? "",
      o.ppsfRatio?.toFixed(2) ?? "",
      `${origin}/listing/${encodeURIComponent(l.id)}`,
    ];
  });
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
}
