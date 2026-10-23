import type { Listing } from "@/lib/types";

/** Rows from `getAllImportSessionListingsAsync` (includes session time for newest-wins merge). */
export type SessionListingsRow = {
  sessionId: string;
  fileName: string;
  createdAt: string;
  listings: Listing[];
  agencyName: string;
};

function normalizeReference(ref: string): string {
  return ref.replace(/\s+/g, " ").trim().toUpperCase();
}

/** Fast stable fingerprint when reference is missing (stream unstable rows, etc.). */
function listingContentFingerprint(listing: Listing, agencyBucket: string): string {
  const parts = [
    agencyBucket,
    String(listing.title || "").slice(0, 120),
    String(listing.price ?? ""),
    String(listing.purpose || ""),
    listing.latitude ?? "",
    listing.longitude ?? "",
    String(listing.permitNumber || "").toUpperCase(),
    String(listing.community || "").slice(0, 80),
    String(listing.reference || "").slice(0, 80),
  ];
  let h = 2166136261;
  const s = parts.join("\u241e");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

/**
 * Global key for “same property” within an agency bucket across classic + stream sessions.
 * Prefer reference + purpose; fallback to content fingerprint (not full SHA-256 — avoids async in hot paths).
 */
export function canonicalListingDedupeKey(listing: Listing, agencyBucket: string): string {
  const ag = agencyBucket.replace(/\s+/g, " ").trim();
  const ref = normalizeReference(listing.reference || "");
  if (ref.length > 0) {
    return `r:${ag}\0${ref}\0${listing.purpose || "unknown"}`;
  }
  return `c:${ag}\0${listingContentFingerprint(listing, ag)}`;
}

/**
 * Merge per-agency listing arrays from all sessions, deduplicating the same logical property.
 * When classic and stream both contain the same reference under one brand, keeps the row from the **newest** session (`createdAt`).
 */
export function mergeListingsByAgencyDeduped(rows: SessionListingsRow[]): Map<string, Listing[]> {
  const byBucket = new Map<string, Map<string, { listing: Listing; createdAt: string }>>();

  for (const row of rows) {
    const isStream = row.fileName.includes("(stream)");
    for (const l of row.listings) {
      const bucket = isStream ? (l.sourceAgency?.trim() || row.agencyName) : row.agencyName;
      const bKey = bucket.replace(/\s+/g, " ").trim() || "Unknown agency";
      const dedupeKey = canonicalListingDedupeKey(l, bKey);
      let inner = byBucket.get(bKey);
      if (!inner) {
        inner = new Map();
        byBucket.set(bKey, inner);
      }
      const prev = inner.get(dedupeKey);
      if (!prev || row.createdAt >= prev.createdAt) {
        inner.set(dedupeKey, { listing: l, createdAt: row.createdAt });
      }
    }
  }

  const out = new Map<string, Listing[]>();
  for (const [bucket, inner] of byBucket) {
    out.set(bucket, Array.from(inner.values()).map((x) => x.listing));
  }
  return out;
}
