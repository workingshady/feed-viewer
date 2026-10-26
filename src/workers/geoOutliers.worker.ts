/// <reference lib="webworker" />
import { detectGeoOutliers, type GeoOutlier, type MarketCluster, type OutlierKind } from "@/lib/geoOutliers";
import type { Listing } from "@/lib/types";

/** Runs the map's outlier checks off the main thread; listings arrive slimmed to the fields used. */
export type GeoRequest = { seq: number; listings: Listing[] };
export type GeoReply = {
  seq: number;
  rows: [string, Omit<GeoOutlier, "listing">][];
  clusters: MarketCluster[];
  counts: Record<OutlierKind, number>;
};

self.onmessage = (e: MessageEvent<GeoRequest>) => {
  const r = detectGeoOutliers(e.data.listings);
  const rows = [...r.byId].map(([id, { listing: _l, ...rest }]) => [id, rest] as [string, Omit<GeoOutlier, "listing">]);
  (self as unknown as Worker).postMessage({ seq: e.data.seq, rows, clusters: r.clusters, counts: r.counts } satisfies GeoReply);
};
