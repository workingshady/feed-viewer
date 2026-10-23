import { createContext } from "react";
import type { Listing } from "@/lib/types";
import type { SourceDTO, VersionDTO } from "@/lib/sourcesApi";

export type ListingsScope = { mode: "all" } | { mode: "agency"; agencyName: string };

export type AppData = {
  sources: SourceDTO[];
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
};

export const DataContext = createContext<AppData | null>(null);
