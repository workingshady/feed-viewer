import { gunzipSync, gzipSync, strToU8, strFromU8 } from "fflate";
import type { Listing } from "@/lib/types";

/**
 * Version files are immutable (each upload gets a unique URL), so results are cached for the
 * lifetime of the page and concurrent requests share one download.
 */
const cache = new Map<string, Promise<unknown>>();

async function fetchGzipText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not download version file (HTTP ${res.status})`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  // Some CDNs transparently decompress; only gunzip when the gzip magic bytes are present.
  if (!(bytes[0] === 0x1f && bytes[1] === 0x8b)) return strFromU8(bytes);
  // The browser's streaming decompressor runs off the main thread; large feeds no longer freeze the page.
  if (typeof DecompressionStream !== "undefined") {
    return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
  }
  return strFromU8(gunzipSync(bytes));
}

function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  let p = cache.get(key) as Promise<T> | undefined;
  if (!p) {
    p = load();
    cache.set(key, p);
    p.catch(() => cache.delete(key));
  }
  return p;
}

export const fetchVersionListings = (url: string) =>
  cached(`listings:${url}`, async () => JSON.parse(await fetchGzipText(url)) as Listing[]);

export const fetchVersionXml = (url: string) => cached(`xml:${url}`, () => fetchGzipText(url));

export const gzipText = (text: string): Uint8Array => gzipSync(strToU8(text), { level: 6 });
