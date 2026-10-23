const KEY = "rexml_compare_ids";
export const COMPARE_UPDATED_EVENT = "compare:updated";

export function getCompareListingIds(): string[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    const a = raw ? JSON.parse(raw) : [];
    return Array.isArray(a) ? a.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function emit() {
  try {
    window.dispatchEvent(new CustomEvent(COMPARE_UPDATED_EVENT));
  } catch {
    // ignore
  }
}

export function setCompareListingIds(ids: string[]): void {
  const next = ids.slice(0, 4);
  try {
    sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  emit();
}

/** Most recently added first; max 4 unique ids. */
export function addCompareListingId(id: string): string[] {
  const cur = getCompareListingIds().filter((x) => x !== id);
  cur.unshift(id);
  const next = cur.slice(0, 4);
  setCompareListingIds(next);
  return next;
}

export function removeCompareListingId(id: string): void {
  setCompareListingIds(getCompareListingIds().filter((x) => x !== id));
}

export function clearCompareListingIds(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
  emit();
}

/**
 * Fill the compare tray (max 4 unique ids) and return true when at least two listings are available.
 * Use before navigating to `/compare` from cluster views or bulk actions.
 */
export function prepareCompareTrayFromIds(ids: string[]): boolean {
  const unique = [...new Set(ids.map((x) => String(x).trim()).filter(Boolean))].slice(0, 4);
  if (unique.length < 2) return false;
  setCompareListingIds(unique);
  return true;
}
