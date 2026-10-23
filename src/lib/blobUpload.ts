import { upload } from "@vercel/blob/client";

/**
 * Uploads a gzip file straight from the browser to Vercel Blob; our API only signs the token.
 * With VITE_E2E_FAKE_BLOB=1 (end-to-end tests only) files go to the local fake store instead.
 */
export async function uploadBlob(pathname: string, data: Uint8Array): Promise<{ url: string }> {
  const body = new Blob([data], { type: "application/gzip" });
  if (import.meta.env.VITE_E2E_FAKE_BLOB === "1") {
    const res = await fetch(`/api/_e2e/upload?pathname=${encodeURIComponent(pathname)}`, {
      method: "PUT",
      body,
      credentials: "include",
    });
    if (!res.ok) throw new Error(`Upload failed (HTTP ${res.status})`);
    return res.json();
  }
  try {
    const blob = await upload(pathname, body, {
      access: "public",
      handleUploadUrl: "/api/blob/upload",
      contentType: "application/gzip",
    });
    return { url: blob.url };
  } catch (e) {
    throw new Error(explainBlobError(e));
  }
}

/** The SDK's errors are generic; translate the common setup problems into what to fix. */
function explainBlobError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/client token/i.test(msg)) {
    return "File storage is not set up: connect a Public Vercel Blob store to this project, then redeploy.";
  }
  if (/private|access/i.test(msg)) {
    return "The Vercel Blob store is Private. This app needs a Public store (Vercel → Storage → create a Public Blob store).";
  }
  return `Upload failed: ${msg}`;
}
