import { useEffect, useRef, useState } from "react";
import { OUTLIER_KINDS, detectGeoOutliers, type GeoOutlierResult, type OutlierKind } from "@/lib/geoOutliers";
import type { Listing } from "@/lib/types";
import type { GeoReply } from "@/workers/geoOutliers.worker";

const EMPTY: GeoOutlierResult = {
  byId: new Map(),
  clusters: [],
  counts: Object.fromEntries(Object.keys(OUTLIER_KINDS).map((k) => [k, 0])) as Record<OutlierKind, number>,
};

/** Only the fields the checks read: posting 100k full listings to a worker would cost more than it saves. */
const slim = (l: Listing) =>
  ({
    id: l.id,
    latitude: l.latitude,
    longitude: l.longitude,
    community: l.community,
    city: l.city,
    country: l.country,
    currency: l.currency,
    purpose: l.purpose,
    propertyType: l.propertyType,
    price: l.price,
    rentPeriod: l.rentPeriod,
    area: l.area,
    areaUnit: l.areaUnit,
  }) as Listing;

/**
 * Location and price outliers computed in a Web Worker, so typing in filters or panning the map
 * never waits for them. The latest request wins; earlier replies are ignored.
 */
export function useGeoOutliers(listings: Listing[]): { geo: GeoOutlierResult; running: boolean } {
  const [geo, setGeo] = useState<GeoOutlierResult>(EMPTY);
  const [running, setRunning] = useState(false);
  const worker = useRef<Worker | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (typeof Worker === "undefined") return;
    const w = new Worker(new URL("../workers/geoOutliers.worker.ts", import.meta.url), { type: "module" });
    worker.current = w;
    return () => {
      w.terminate();
      worker.current = null;
    };
  }, []);

  useEffect(() => {
    const w = worker.current;
    if (!listings.length) {
      setGeo(EMPTY);
      setRunning(false);
      return;
    }
    if (!w) {
      setGeo(detectGeoOutliers(listings));
      return;
    }
    const id = ++seq.current;
    const byId = new Map(listings.map((l) => [l.id, l]));
    setRunning(true);
    const onMessage = (e: MessageEvent<GeoReply>) => {
      if (e.data.seq !== seq.current) return;
      setGeo({
        byId: new Map(e.data.rows.filter(([lid]) => byId.has(lid)).map(([lid, o]) => [lid, { ...o, listing: byId.get(lid)! }])),
        clusters: e.data.clusters,
        counts: e.data.counts,
      });
      setRunning(false);
    };
    w.addEventListener("message", onMessage);
    w.postMessage({ seq: id, listings: listings.map(slim) });
    return () => w.removeEventListener("message", onMessage);
  }, [listings]);

  return { geo, running };
}
