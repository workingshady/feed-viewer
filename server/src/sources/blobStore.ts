import { del } from "@vercel/blob";

/** Where uploaded feed files live. Injected so tests can run without Vercel. */
export interface BlobStore {
  del(urls: string[]): Promise<void>;
}

export const vercelBlobStore: BlobStore = {
  async del(urls) {
    if (urls.length === 0) return;
    await del(urls);
  },
};

/** Blob folder for one upload: `sources/<sourceId>/<uploadId>/`. */
const BLOB_PATH_RE = /^sources\/([a-z0-9]+)\/([A-Za-z0-9_-]{10,})\/(feed\.xml|listings\.json)\.gz$/;

export function isAllowedBlobPath(pathname: string): boolean {
  return BLOB_PATH_RE.test(pathname);
}

/** Source id from an uploaded blob URL (the store appends a random suffix to the file name). */
export function sourceIdFromBlobUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && !(process.env.E2E_FAKE_BLOB === "1" && parsed.protocol === "http:")) return null;
  const m = /\/sources\/([a-z0-9]+)\/[A-Za-z0-9_-]{10,}\/(?:feed\.xml|listings\.json)[^/]*\.gz$/.exec(parsed.pathname);
  return m ? m[1] : null;
}
