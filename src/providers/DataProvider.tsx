import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { DataContext, type AppData, type ListingsScope, type MarketFilter, type MarketOption } from "@/providers/dataContext";
import { MARKETS, dominantMarket, marketCodeOf, marketOf, marketsIn, type MarketCode } from "@/lib/markets";
import { hasRole } from "@/lib/roles";
import { useAuth } from "@/providers/AuthProvider";
import { SOURCES_KEY, useLiveListings, useSourcesQuery } from "@/hooks/useSources";
import { liveVersionOf, updateSource, type SourceDTO } from "@/lib/sourcesApi";
import type { Listing } from "@/lib/types";
import { withSourceIds } from "@/lib/listingIds";
import { useAutoRetrain, useMatchModel } from "@/hooks/useMatching";

export type { ListingsScope, AppData, MarketFilter, MarketOption } from "@/providers/dataContext";
export { useAppData } from "@/providers/useAppData";

const SCOPE_KEY = "fvp.scope";
const MARKET_KEY = "fvp.market";

function readMarket(): MarketFilter {
  try {
    const raw = localStorage.getItem(MARKET_KEY);
    return raw && (raw === "all" || raw in MARKETS) ? (raw as MarketFilter) : "all";
  } catch {
    return "all";
  }
}
const EMPTY: SourceDTO[] = [];

function readScope(): ListingsScope {
  try {
    const raw = localStorage.getItem(SCOPE_KEY);
    return raw ? (JSON.parse(raw) as ListingsScope) : { mode: "all" };
  } catch {
    return { mode: "all" };
  }
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const sourcesQuery = useSourcesQuery(!!user);
  const allSources = sourcesQuery.data ?? EMPTY;
  const live = useLiveListings(allSources);
  const [scope, setScopeState] = useState<ListingsScope>(readScope);
  const [market, setMarketState] = useState<MarketFilter>(readMarket);

  const setMarket = useCallback((next: MarketFilter) => {
    setMarketState(next);
    try {
      localStorage.setItem(MARKET_KEY, next);
    } catch {
      // Private mode: the filter just won't persist across reloads.
    }
  }, []);

  const setScope = useCallback((next: ListingsScope) => {
    setScopeState(next);
    try {
      localStorage.setItem(SCOPE_KEY, JSON.stringify(next));
    } catch {
      // Private mode: scope just won't persist across reloads.
    }
  }, []);

  /** Live listings of every source, whatever the market filter. */
  const allListingsByAgency = useMemo(() => {
    const map = new Map<string, Listing[]>();
    for (const s of allSources) {
      const rows = live.bySource.get(s.name);
      if (rows) map.set(s.name, withSourceIds(s, rows));
    }
    return map;
    // live.dataUpdatedAt changes whenever any live listing set lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSources, live.dataUpdatedAt, live.bySource.size]);

  /** Per source: its saved market (else the one most of its listings belong to) and every market it has listings in. */
  const sourceMarkets = useMemo(() => {
    const m = new Map<string, { main: MarketCode | null; all: Set<MarketCode> }>();
    for (const s of allSources) {
      const rows = allListingsByAgency.get(s.name) ?? [];
      const present = new Set(marketsIn(rows).map((x) => x.market.code));
      const saved = marketCodeOf(s.market);
      const main = saved ?? (rows.length ? dominantMarket(rows).code : null);
      if (main) present.add(main);
      m.set(s.id, { main, all: present });
    }
    return m;
  }, [allSources, allListingsByAgency]);
  const sourceMarket = useCallback((s: SourceDTO) => sourceMarkets.get(s.id)?.main ?? null, [sourceMarkets]);

  const marketOptions = useMemo<MarketOption[]>(() => {
    const out = new Map<MarketCode, MarketOption>();
    for (const s of allSources) {
      const info = sourceMarkets.get(s.id);
      if (!info) continue;
      const rows = allListingsByAgency.get(s.name) ?? [];
      for (const code of info.all) {
        const o = out.get(code) ?? { market: MARKETS[code], sources: 0, listings: 0 };
        o.sources++;
        o.listings += rows.filter((l) => marketOf(l).code === code).length;
        out.set(code, o);
      }
    }
    return [...out.values()].sort((a, b) => b.listings - a.listings || b.sources - a.sources);
  }, [allSources, sourceMarkets, allListingsByAgency]);

  // A saved market that no source has any more falls back to all markets.
  useEffect(() => {
    if (market !== "all" && sourcesQuery.isSuccess && !live.isLoading && !marketOptions.some((o) => o.market.code === market)) setMarket("all");
  }, [market, marketOptions, sourcesQuery.isSuccess, live.isLoading, setMarket]);

  const sources = useMemo(
    () => (market === "all" ? allSources : allSources.filter((s) => sourceMarkets.get(s.id)?.all.has(market))),
    [allSources, market, sourceMarkets],
  );

  /** Live listings per source in the current market: a mixed feed contributes only its listings in that market. */
  const listingsByAgency = useMemo(() => {
    if (market === "all") return allListingsByAgency;
    const map = new Map<string, Listing[]>();
    for (const s of sources) {
      const rows = allListingsByAgency.get(s.name);
      if (rows) map.set(s.name, rows.filter((l) => marketOf(l).code === market));
    }
    return map;
  }, [allListingsByAgency, sources, market]);

  // Backfill: sources saved before markets existed get the market detected from their live listings.
  const canEdit = hasRole(user?.role, "editor");
  const backfilled = useRef(new Set<string>());
  useEffect(() => {
    if (!canEdit || live.isLoading) return;
    const todo = allSources.filter((s) => !s.market && !backfilled.current.has(s.id) && sourceMarkets.get(s.id)?.main);
    if (!todo.length) return;
    for (const s of todo) backfilled.current.add(s.id);
    void Promise.allSettled(todo.map((s) => updateSource(s.id, { market: sourceMarkets.get(s.id)!.main! }))).then(() =>
      qc.invalidateQueries({ queryKey: SOURCES_KEY }),
    );
  }, [canEdit, live.isLoading, allSources, sourceMarkets, qc]);

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
  useAutoRetrain(allSources, allListingsByAgency, sourcesQuery.isLoading || live.isLoading);

  const refreshAll = useCallback(() => {
    void qc.invalidateQueries({ queryKey: SOURCES_KEY });
  }, [qc]);

  const value = useMemo<AppData>(
    () => ({
      sources,
      allSources,
      market,
      setMarket,
      marketOptions,
      sourceMarket,
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
      allSources,
      market,
      setMarket,
      marketOptions,
      sourceMarket,
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
