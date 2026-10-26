import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import {
  applyVersion,
  deleteSource,
  deleteVersion,
  listSources,
  liveVersionOf,
  updateSource,
  updateVersion,
  type SourceDTO,
  type VersionDTO,
} from "@/lib/sourcesApi";
import { fetchVersionListings, fetchVersionXml } from "@/lib/versionBlobs";
import { commitVersion, prepareVersion } from "@/lib/uploadVersion";
import type { Listing } from "@/lib/types";

export const SOURCES_KEY = ["sources"] as const;

export function useSourcesQuery(enabled = true) {
  return useQuery({
    queryKey: SOURCES_KEY,
    queryFn: listSources,
    enabled,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });
}

/** Listings of one version (blob URLs are immutable, so the cache never goes stale). */
export function useVersionListings(version: VersionDTO | null) {
  return useQuery({
    queryKey: ["version-listings", version?.listingsBlobUrl],
    queryFn: () => fetchVersionListings(version!.listingsBlobUrl),
    enabled: !!version,
    staleTime: Infinity,
    gcTime: 10 * 60_000,
  });
}

export function useVersionXml(version: VersionDTO | null) {
  return useQuery({
    queryKey: ["version-xml", version?.xmlBlobUrl],
    queryFn: () => fetchVersionXml(version!.xmlBlobUrl),
    enabled: !!version,
    staleTime: Infinity,
    gcTime: 5 * 60_000,
  });
}

/** Live listings of every source, keyed by source name. */
export function useLiveListings(sources: SourceDTO[]) {
  const lives = sources.map((s) => ({ source: s, live: liveVersionOf(s) }));
  const results = useQueries({
    queries: lives.map(({ live }) => ({
      queryKey: ["version-listings", live?.listingsBlobUrl],
      queryFn: () => fetchVersionListings(live!.listingsBlobUrl),
      enabled: !!live,
      staleTime: Infinity,
      gcTime: 10 * 60_000,
    })),
  });
  const bySource = new Map<string, Listing[]>();
  lives.forEach(({ source, live }, i) => {
    if (live && results[i].data) bySource.set(source.name, results[i].data!);
  });
  return {
    bySource,
    isLoading: results.some((r) => r.isLoading),
    error: results.find((r) => r.error)?.error ?? null,
    dataUpdatedAt: Math.max(0, ...results.map((r) => r.dataUpdatedAt)),
  };
}

const errorCode = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e));

function useSourcesMutation<A>(fn: (args: A) => Promise<unknown>, success?: (args: A) => string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (_d, args) => {
      const msg = success?.(args);
      if (msg) toast.success(msg);
    },
    onError: (e) => toast.error(`Action failed: ${errorCode(e)}`),
    onSettled: () => qc.invalidateQueries({ queryKey: SOURCES_KEY }),
  });
}

export const useApplyVersion = () =>
  useSourcesMutation(
    (a: { source: SourceDTO; version: VersionDTO }) => applyVersion(a.source.id, a.version.id),
    (a) => `v${a.version.number} is now live for ${a.source.name}`,
  );

export const useDeleteVersion = () =>
  useSourcesMutation(
    async (a: { source: SourceDTO; version: VersionDTO }) => {
      try {
        await deleteVersion(a.source.id, a.version.id);
      } catch (e) {
        // Another tab already removed it — the refetch will catch up.
        if (e instanceof ApiError && e.status === 404) return;
        throw e;
      }
    },
    (a) => `v${a.version.number} deleted`,
  );

export const useUpdateVersion = () =>
  useSourcesMutation((a: { source: SourceDTO; version: VersionDTO; note?: string | null; pinned?: boolean }) =>
    updateVersion(a.source.id, a.version.id, { note: a.note, pinned: a.pinned }),
  );

export const useUpdateSource = () =>
  useSourcesMutation(
    (a: { source: SourceDTO; name?: string; market?: string; mapping?: SourceDTO["mapping"]; retainVersions?: number }) =>
      updateSource(a.source.id, { name: a.name, market: a.market, mapping: a.mapping, retainVersions: a.retainVersions }),
    () => "Source updated",
  );

export const useDeleteSource = () =>
  useSourcesMutation(
    (a: { source: SourceDTO }) => deleteSource(a.source.id),
    (a) => `${a.source.name} deleted`,
  );

/** Re-parses the live version's original XML with the source's current mapping as a new version. */
export function useReparseLiveVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ source, sources }: { source: SourceDTO; sources: SourceDTO[] }) => {
      const live = liveVersionOf(source);
      if (!live) throw new Error("This source has no live version");
      const xml = await fetchVersionXml(live.xmlBlobUrl);
      const prepared = await prepareVersion(new File([xml], live.fileName, { type: "text/xml" }), sources, {
        target: source,
      });
      return commitVersion(prepared, source);
    },
    onSuccess: (r) => {
      if (r.duplicate) toast.message(`Nothing changed — already v${r.version.number}`);
      else if (r.applied) toast.success(`Re-parsed as v${r.version.number} (live)`);
      else toast.warning(`Saved as v${r.version.number}, not applied: listing count dropped sharply`);
    },
    onError: (e) => toast.error(`Re-parse failed: ${errorCode(e)}`),
    onSettled: () => qc.invalidateQueries({ queryKey: SOURCES_KEY }),
  });
}
