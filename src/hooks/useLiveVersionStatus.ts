import { useMemo } from "react";
import { useVersionListings } from "@/hooks/useSources";
import { diffListings } from "@/lib/versionDiff";
import type { SourceDTO } from "@/lib/sourcesApi";
import type { ImportListingStatus, Listing } from "@/lib/types";

/** Per-listing status (new/updated) of a source's live version versus the version just older than it. */
export function useLiveVersionStatus(source: SourceDTO | null | undefined, live: Listing[]) {
  const idx = source ? source.versions.findIndex((v) => v.id === source.activeVersionId) : -1;
  const prevVersion = source && idx >= 0 ? (source.versions[idx + 1] ?? null) : null;
  const { data: prev } = useVersionListings(prevVersion);
  return useMemo(() => {
    const map = new Map<string, ImportListingStatus>();
    if (!prev) return map;
    const d = diffListings(prev, live);
    for (const l of d.added) map.set(l.id, "new");
    for (const c of d.changed) map.set(c.after.id, "updated");
    return map;
  }, [prev, live]);
}
