import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { DataContext, type AppData, type ListingsScope } from "@/providers/dataContext";
import { useAuth } from "@/providers/AuthProvider";
import { SOURCES_KEY, useLiveListings, useSourcesQuery } from "@/hooks/useSources";
import { liveVersionOf, type SourceDTO } from "@/lib/sourcesApi";
import { importListingDiffKey } from "@/lib/importAnalysis";
import { currencyCode } from "@/lib/displayPrice";
import { amenityLabel } from "@/lib/amenityCodes";
import type { Listing } from "@/lib/types";
import { useAutoRetrain, useMatchModel } from "@/hooks/useMatching";

export type { ListingsScope, AppData } from "@/providers/dataContext";
export { useAppData } from "@/providers/useAppData";

const SCOPE_KEY = "fvp.scope";
const EMPTY: SourceDTO[] = [];

function readScope(): ListingsScope {
  try {
    const raw = localStorage.getItem(SCOPE_KEY);
    return raw ? (JSON.parse(raw) as ListingsScope) : { mode: "all" };
  } catch {
    return { mode: "all" };
  }
}

/**
 * Listings ids are made unique across sources and stable across versions, so favorites and
 * compare selections survive switching versions.
 */
function withSourceIds(source: SourceDTO, listings: Listing[]): Listing[] {
  return listings.map((l) => ({
    ...l,
    id: `${source.id}:${importListingDiffKey(l)}`,
    sourceAgency: source.name,
    currency: currencyCode(l.currency),
    amenities: (l.amenities ?? []).map(amenityLabel),
  }));
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const sourcesQuery = useSourcesQuery(!!user);
  const sources = sourcesQuery.data ?? EMPTY;
  const live = useLiveListings(sources);
  const [scope, setScopeState] = useState<ListingsScope>(readScope);

  const setScope = useCallback((next: ListingsScope) => {
    setScopeState(next);
    try {
      localStorage.setItem(SCOPE_KEY, JSON.stringify(next));
    } catch {
      // Private mode: scope just won't persist across reloads.
    }
  }, []);

  const listingsByAgency = useMemo(() => {
    const map = new Map<string, Listing[]>();
    for (const s of sources) {
      const rows = live.bySource.get(s.name);
      if (rows) map.set(s.name, withSourceIds(s, rows));
    }
    return map;
    // live.dataUpdatedAt changes whenever any live listing set lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources, live.dataUpdatedAt, live.bySource.size]);

  const selectedSource = scope.mode === "agency" ? sources.find((s) => s.name === scope.agencyName) ?? null : null;

  // A scoped source that was renamed or deleted falls back to all sources.
  useEffect(() => {
    if (scope.mode === "agency" && sourcesQuery.isSuccess && !selectedSource) setScope({ mode: "all" });
  }, [scope, selectedSource, sourcesQuery.isSuccess, setScope]);

  const listings = useMemo(() => {
    if (selectedSource) return listingsByAgency.get(selectedSource.name) ?? [];
    return [...listingsByAgency.values()].flat();
  }, [listingsByAgency, selectedSource]);

  const { modelKey: matchModelKey } = useMatchModel(!!user);
  useAutoRetrain(sources, listingsByAgency, sourcesQuery.isLoading || live.isLoading);

  const refreshAll = useCallback(() => {
    void qc.invalidateQueries({ queryKey: SOURCES_KEY });
  }, [qc]);

  const value = useMemo<AppData>(
    () => ({
      sources,
      isLoading: sourcesQuery.isLoading || live.isLoading,
      error: sourcesQuery.error ?? live.error,
      listingsByAgency,
      listings,
      scope,
      setScope,
      selectedSource,
      selectedLiveVersion: selectedSource ? liveVersionOf(selectedSource) : null,
      refreshAll,
      matchModelKey,
    }),
    [
      sources,
      sourcesQuery.isLoading,
      sourcesQuery.error,
      live.isLoading,
      live.error,
      listingsByAgency,
      listings,
      scope,
      setScope,
      selectedSource,
      refreshAll,
      matchModelKey,
    ],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
