import { useEffect, useState } from "react";
import { profileListings, type DataProfile } from "@/lib/dataProfile";
import type { Listing } from "@/lib/types";
import { profileXmlPaths, type XmlProfile } from "@/lib/xmlPathProfile";
import type { ProfileMessage } from "@/workers/dataProfile.worker";

export type DataProfileState = {
  profile: DataProfile | null;
  xml: XmlProfile | null;
  /** 0–1 while the XML scan runs. */
  progress: number;
  running: boolean;
  error: string | null;
};

/** Results for the same listings are reused for the session (switching tabs or pages is instant). */
const memo = new Map<string, { profile: DataProfile; xml: XmlProfile }>();

/**
 * Profiles ALL given listings — field quality rules and every raw XML path — in a Web Worker.
 * `key` must change whenever the listings change (version id + filter).
 */
export function useDataProfile(listings: Listing[], key: string): DataProfileState {
  const [state, setState] = useState<DataProfileState>({ profile: null, xml: null, progress: 0, running: false, error: null });

  useEffect(() => {
    const hit = memo.get(key);
    if (hit) {
      setState({ ...hit, progress: 1, running: false, error: null });
      return;
    }
    if (!listings.length) {
      setState({ profile: null, xml: null, progress: 0, running: false, error: null });
      return;
    }
    setState((s) => ({ ...s, progress: 0, running: true, error: null }));
    const finish = (profile: DataProfile, xml: XmlProfile) => {
      memo.set(key, { profile, xml });
      if (memo.size > 6) memo.delete(memo.keys().next().value as string);
      setState({ profile, xml, progress: 1, running: false, error: null });
    };
    if (typeof Worker === "undefined") {
      finish(profileListings(listings), profileXmlPaths(listings));
      return;
    }
    const worker = new Worker(new URL("../workers/dataProfile.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<ProfileMessage>) => {
      const m = e.data;
      if (m.type === "progress") setState((s) => ({ ...s, progress: m.done / Math.max(1, m.total) }));
      else if (m.type === "done") {
        finish(m.profile, m.xml);
        worker.terminate();
      } else {
        setState((s) => ({ ...s, running: false, error: m.error }));
        worker.terminate();
      }
    };
    worker.onerror = (e) => {
      setState((s) => ({ ...s, running: false, error: e.message || "Profiling failed" }));
      worker.terminate();
    };
    worker.postMessage({ listings });
    return () => worker.terminate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` identifies the listings
  }, [key]);

  return state;
}
