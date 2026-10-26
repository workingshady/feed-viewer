import { createContext } from "react";
import type { Listing } from "@/lib/types";
import type { SourceDTO, VersionDTO } from "@/lib/sourcesApi";
import type { Market, MarketCode } from "@/lib/markets";

export type MarketFilter = MarketCode | "all";
export type MarketOption = { market: Market; sources: number; listings: number };

export type ListingsScope = { mode: "all" } | { mode: "agency"; agencyName: string };

export type AppData = {
  /** Sources in the current market (all of them when the market filter is "all"). */
  sources: SourceDTO[];
  /** Every source, whatever the market filter (uploads match files against these). */
  allSources: SourceDTO[];
  /** Global market filter; "all" mixes every market. */
  market: MarketFilter;
  setMarket: (market: MarketFilter) => void;
  /** Markets present in the workspace with their source and listing counts. */
  marketOptions: MarketOption[];
  /** A source's market: its saved market, else detected from its live listings. */
  sourceMarket: (source: SourceDTO) => MarketCode | null;
  /** True until sources and every live version's listings have loaded. */
  isLoading: boolean;
  error: unknown;
  /** Live listings per source name. */
  listingsByAgency: Map<string, Listing[]>;
  /** Live listings in the current scope (all sources, or one). */
  listings: Listing[];
  scope: ListingsScope;
  setScope: (scope: ListingsScope) => void;
  /** The scoped source, or null when viewing all sources. */
  selectedSource: SourceDTO | null;
  /** Live version of the scoped source. */
  selectedLiveVersion: VersionDTO | null;
  refreshAll: () => void;
  /** Id of the matching model in use ("builtin" until the server's active one loads). */
  matchModelKey: string;
};

export const DataContext = createContext<AppData | null>(null);
