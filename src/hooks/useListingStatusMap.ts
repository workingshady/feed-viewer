import { useMemo } from "react";
import { useAppData } from "@/providers/DataProvider";
import { useVersionListings } from "@/hooks/useSources";
import { importListingDiffKey } from "@/lib/importAnalysis";
import { diffListings } from "@/lib/versionDiff";
import type { ImportListingStatus, Listing } from "@/lib/types";

/**
 * Per-listing change status of the scoped source's live version versus the version just older.
 * Empty when scope is "all", or the live version has no older version.
 */
export function useListingStatusMap(): { statusById: Map<string, ImportListingStatus>; hasDiff: boolean } {
  const { selectedSource, selectedLiveVersion, listings } = useAppData();
  const previousVersion = useMemo(() => {
    if (!selectedSource || !selectedLiveVersion) return null;
    const idx = selectedSource.versions.findIndex((v) => v.id === selectedLiveVersion.id);
    return idx >= 0 ? (selectedSource.versions[idx + 1] ?? null) : null;
  }, [selectedSource, selectedLiveVersion]);
  const previous = useVersionListings(previousVersion);
  return useMemo(() => {
    const statusById = new Map<string, ImportListingStatus>();
    if (!previous.data) return { statusById, hasDiff: false };
    const d = diffListings(previous.data, listings);
    const mark = (l: Listing, st: ImportListingStatus) => {
      statusById.set(l.id, st);
      statusById.set(importListingDiffKey(l), st);
    };
    for (const l of d.added) mark(l, "new");
    for (const c of d.changed) mark(c.after, "updated");
    return { statusById, hasDiff: true };
  }, [previous.data, listings]);
}
