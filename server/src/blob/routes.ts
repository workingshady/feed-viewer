import { Router } from "express";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../http.js";
import { requireRole } from "../auth/session.js";
import { isAllowedBlobPath, sourceIdFromBlobUrl, type BlobStore } from "../sources/blobStore.js";

/** Gzipped feed or listings file; a 300 MB XML feed compresses to roughly 50 MB. */
const MAX_UPLOAD_BYTES = 150 * 1024 * 1024;

/**
 * Browsers upload feed files straight to Vercel Blob (bypassing the 4.5 MB function body limit).
 * This route only signs short-lived upload tokens for paths inside an existing source.
 */
export function blobRouter(blobStore: BlobStore) {
  const router = Router();
  router.use(requireRole("editor"));

  router.post(
    "/upload",
    asyncHandler(async (req, res) => {
      // Without a token the SDK throws a generic error; say what is actually missing.
      if (!process.env.BLOB_READ_WRITE_TOKEN) throw new HttpError(503, "blob_not_configured");
      const result = await handleUpload({
        body: req.body as HandleUploadBody,
        request: req,
        onBeforeGenerateToken: async (pathname) => {
          if (!isAllowedBlobPath(pathname)) throw new HttpError(400, "invalid_blob_path");
          const sourceId = pathname.split("/")[1];
          if (!(await prisma.source.findUnique({ where: { id: sourceId } }))) throw new HttpError(404, "not_found");
          return {
            allowedContentTypes: ["application/gzip"],
            maximumSizeInBytes: MAX_UPLOAD_BYTES,
            addRandomSuffix: true,
          };
        },
        // Versions are registered explicitly by the client after both files are uploaded.
        onUploadCompleted: async () => {},
      });
      res.json(result);
    }),
  );

  /** Deletes blobs from an upload that could not be registered (no orphaned files). */
  router.post(
    "/discard",
    asyncHandler(async (req, res) => {
      const { urls } = z.object({ urls: z.array(z.string().url()).max(10) }).parse(req.body);
      const safe = urls.filter((u) => sourceIdFromBlobUrl(u) !== null);
      // Only delete files that no version references.
      const referenced = await prisma.feedVersion.findMany({
        where: { OR: [{ xmlBlobUrl: { in: safe } }, { listingsBlobUrl: { in: safe } }] },
        select: { xmlBlobUrl: true, listingsBlobUrl: true },
      });
      const keep = new Set(referenced.flatMap((v) => [v.xmlBlobUrl, v.listingsBlobUrl]));
      await blobStore.del(safe.filter((u) => !keep.has(u)));
      res.json({ ok: true });
    }),
  );

  return router;
}
