/**
 * Recently opened listing detail pages — localStorage MRU for quick return via command palette.
 */
export type RecentListingEntry = {
  id: string;
  title: string;
  reference: string;
  viewedAt: number;
};

const STORAGE_KEY = "rexml_recent_listings_v1";
export const RECENT_LISTINGS_MAX = 12;
export const RECENT_LISTINGS_UPDATED_EVENT = "rexml:recent_listings_updated";

export function mergeRecentListings(
  prev: RecentListingEntry[],
  entry: Omit<RecentListingEntry, "viewedAt"> & { viewedAt?: number },
  max = RECENT_LISTINGS_MAX,
): RecentListingEntry[] {
  const viewedAt = entry.viewedAt ?? Date.now();
  const deduped = prev.filter((e) => e.id !== entry.id);
  return [{ ...entry, viewedAt }, ...deduped].slice(0, max);
}

function parseStored(raw: string | null): RecentListingEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is RecentListingEntry =>
        x != null &&
        typeof x === "object" &&
        typeof (x as RecentListingEntry).id === "string" &&
        typeof (x as RecentListingEntry).viewedAt === "number",
    );
  } catch {
    return [];
  }
}

export function getRecentListings(): RecentListingEntry[] {
  if (typeof localStorage === "undefined") return [];
  return parseStored(localStorage.getItem(STORAGE_KEY));
}

export function recordRecentListingView(entry: Omit<RecentListingEntry, "viewedAt">): void {
  if (typeof localStorage === "undefined") return;
  const next = mergeRecentListings(getRecentListings(), { ...entry, viewedAt: Date.now() });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(RECENT_LISTINGS_UPDATED_EVENT));
}

export function clearRecentListings(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(RECENT_LISTINGS_UPDATED_EVENT));
}
