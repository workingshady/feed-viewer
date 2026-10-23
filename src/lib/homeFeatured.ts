import type { Listing } from "@/lib/types";

/** When imports have no images, Unsplash fallbacks aligned with luxury property aesthetic */
export const FALLBACK_IMAGES = {
  hero: "https://images.unsplash.com/photo-1613977257592-4871e5fcd7c4?w=1200&q=80",
  wide: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1600&q=80",
  cta: "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=1200&q=80",
  quality: [
    "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80",
    "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800&q=80",
    "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=800&q=80",
  ],
  workflow: [
    "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=1200&q=80",
    "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80",
    "https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=1200&q=80",
  ],
} as const;

export function pickFeaturedListing(listings: Listing[]): Listing | null {
  if (!listings?.length) return null;
  const withImage = listings.find((l) => (l.images?.length ?? 0) > 0);
  return withImage ?? listings[0] ?? null;
}

/** Fisher–Yates shuffle (copy) */
function shuffleListings<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Up to three listings with a hero image, randomized for the home deck */
export function pickHeroDeckListings(listings: Listing[]): Listing[] {
  const withImg = listings.filter((l) => Boolean(l?.images?.[0]));
  if (withImg.length === 0) return [];
  if (withImg.length <= 3) {
    const s = shuffleListings(withImg);
    while (s.length < 3) s.push(s[s.length % withImg.length]);
    return s.slice(0, 3);
  }
  return shuffleListings(withImg).slice(0, 3);
}

/**
 * Three random listings with images, preferring a **new** trio when `excludeIds`
 * is set (avoids repeating the same three on every reshuffle when the pool is large enough).
 */
export function pickHeroDeckListingsFresh(listings: Listing[], excludeIds?: Set<string>): Listing[] {
  const withImg = listings.filter((l) => Boolean(l?.images?.[0]));
  if (withImg.length === 0) return [];
  if (withImg.length <= 3) {
    return pickHeroDeckListings(listings);
  }
  const pool = excludeIds?.size
    ? withImg.filter((l) => !excludeIds.has(l.id))
    : [...withImg];
  if (pool.length < 3) {
    return pickHeroDeckListings(listings);
  }
  return shuffleListings(pool).slice(0, 3);
}

export function formatListingPriceShort(l: Listing): string {
  if (!Number.isFinite(l.price) || l.price <= 0) return "POA";
  const cur = (l.currency || "").trim();
  const n = l.price.toLocaleString();
  return cur ? `${cur} ${n}` : n;
}

export function purposeLabel(l: Listing): string {
  if (l.purpose === "sale") return "For sale";
  if (l.purpose === "rent") return "For rent";
  return "Listing";
}
