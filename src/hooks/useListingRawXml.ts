import { useMemo } from "react";
import { useAppData } from "@/providers/useAppData";
import { liveVersionOf, type VersionDTO } from "@/lib/sourcesApi";
import { useVersionListings, useVersionXml } from "@/hooks/useSources";
import type { Listing } from "@/lib/types";

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The `<property>…</property>` block whose reference_number matches, or "" when not found. */
export function extractPropertyXml(xml: string, reference: string): string {
  if (!xml || !reference) return "";
  const ref = new RegExp(`<reference_number>\\s*(?:<!\\[CDATA\\[)?\\s*${escapeRe(reference)}\\s*(?:\\]\\]>)?\\s*</reference_number>`);
  const m = ref.exec(xml);
  if (!m) return "";
  const start = xml.lastIndexOf("<property", m.index);
  const end = xml.indexOf("</property>", m.index);
  return start >= 0 && end > start ? xml.slice(start, end + "</property>".length) : "";
}

/**
 * Raw XML for a listing. Older versions stored it on the listing itself; newer ones keep it only in
 * the original feed file, which is downloaded (and cached) the first time a detail page needs it.
 */
export function useListingRawXml(listing: Listing | null): { rawXml: string; isLoading: boolean } {
  const { sources } = useAppData();
  const inline = listing?.rawXml ?? "";
  const live = useMemo(() => {
    if (inline || !listing) return null;
    const source = sources.find((s) => s.name === listing.sourceAgency);
    return source ? liveVersionOf(source) : null;
  }, [inline, listing, sources]);
  const xml = useVersionXml(live);
  const rawXml = useMemo(
    () => inline || (xml.data && listing ? extractPropertyXml(xml.data, listing.reference) : ""),
    [inline, xml.data, listing],
  );
  return { rawXml, isLoading: !inline && xml.isLoading };
}

/** Single pass over a feed: reference → its `<property>` block. */
export function indexPropertyXml(xml: string): Map<string, string> {
  const map = new Map<string, string>();
  const re = /<property\b[^>]*>[\s\S]*?<\/property>/g;
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    const ref = /<reference_number>\s*(?:<!\[CDATA\[)?\s*([^<\]]*?)\s*(?:\]\]>)?\s*<\/reference_number>/.exec(m[0]);
    if (ref?.[1]) map.set(ref[1], m[0]);
  }
  return map;
}

/**
 * A version's listings with `rawXml` filled from the original feed — for analyses of XML paths
 * (Field quality). Costs one extra download, so only pages that need raw XML use it.
 */
export function useListingsWithRawXml(version: VersionDTO | null) {
  const listingsQ = useVersionListings(version);
  const needsXml = !!listingsQ.data && listingsQ.data.length > 0 && !listingsQ.data[0].rawXml;
  const xmlQ = useVersionXml(needsXml ? version : null);
  const data = useMemo(() => {
    if (!listingsQ.data) return undefined;
    if (!needsXml) return listingsQ.data;
    if (!xmlQ.data) return undefined;
    const index = indexPropertyXml(xmlQ.data);
    return listingsQ.data.map((l) => ({ ...l, rawXml: index.get(l.reference) ?? "" }));
  }, [listingsQ.data, needsXml, xmlQ.data]);
  return {
    data,
    isLoading: listingsQ.isLoading || (needsXml && xmlQ.isLoading),
    error: listingsQ.error ?? xmlQ.error,
  };
}
