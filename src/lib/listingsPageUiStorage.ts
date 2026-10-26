import type { ImportListingStatus } from "@/lib/types";

const KEY = "feedviewer.listings.pageUi.v3";

export type ListingsPageUiSnapshot = {
  search: string;
  priceMin: string;
  priceMax: string;
  beds: string;
  baths: string;
  propType: string;
  community: string;
  purpose: string;
  agent: string;
  city: string;
  furnished: string;
  areaMin: string;
  areaMax: string;
  completion: string;
  developer: string;
  /** Keys of `LISTING_FEATURES` that must all hold. */
  features: string[];
  sort: string;
  page: number;
  showFilters: boolean;
  statusFilter: "all" | ImportListingStatus;
  viewMode: "grid" | "map";
};

export function readListingsPageUi(): Partial<ListingsPageUiSnapshot> | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<ListingsPageUiSnapshot>;
    return o && typeof o === "object" ? o : null;
  } catch {
    return null;
  }
}

export function writeListingsPageUi(snapshot: ListingsPageUiSnapshot): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(snapshot));
  } catch {
    /* quota / private mode */
  }
}
