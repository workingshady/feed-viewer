/// <reference lib="webworker" />
import { profileListings, type DataProfile } from "@/lib/dataProfile";
import type { Listing } from "@/lib/types";
import { profileXmlPaths, type XmlProfile } from "@/lib/xmlPathProfile";

/** Profiles every listing (fields, rules and every raw XML path) off the main thread. */
export type ProfileRequest = { listings: Listing[] };
export type ProfileMessage =
  | { type: "progress"; done: number; total: number }
  | { type: "done"; profile: DataProfile; xml: XmlProfile }
  | { type: "error"; error: string };

self.onmessage = (e: MessageEvent<ProfileRequest>) => {
  const post = (m: ProfileMessage) => (self as unknown as Worker).postMessage(m);
  try {
    const { listings } = e.data;
    const profile = profileListings(listings);
    const xml = profileXmlPaths(listings, Infinity, (done, total) => post({ type: "progress", done, total }));
    post({ type: "done", profile, xml });
  } catch (err) {
    post({ type: "error", error: err instanceof Error ? err.message : String(err) });
  }
};
