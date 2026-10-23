import type express from "express";
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { requireRole } from "./auth/session.js";
import { isAllowedBlobPath, type BlobStore } from "./sources/blobStore.js";

const ROOT = path.resolve(".e2e-blobs");
const PREFIX = "/api/_e2e/blob/";

/**
 * Local stand-in for Vercel Blob, for end-to-end tests only. Files land in `.e2e-blobs/` and are
 * served from `/api/_e2e/blob/*`. Refuses to run in production.
 */
export function e2eFakeBlob(): { store: BlobStore; mount: (app: express.Express) => void } {
  if (process.env.NODE_ENV === "production") throw new Error("E2E_FAKE_BLOB must never run in production");
  mkdirSync(ROOT, { recursive: true });

  const fileFor = (url: string) => {
    const p = new URL(url).pathname;
    return p.startsWith(PREFIX) ? path.join(ROOT, decodeURIComponent(p.slice(PREFIX.length))) : null;
  };

  const store: BlobStore = {
    async del(urls) {
      for (const u of urls) {
        const f = fileFor(u);
        if (f && existsSync(f)) rmSync(f);
      }
    },
  };

  const mount = (app: express.Express) => {
    app.put(
      "/api/_e2e/upload",
      requireRole("editor"),
      (req, res, next) => {
        const pathname = String(req.query.pathname ?? "");
        if (!isAllowedBlobPath(pathname)) {
          res.status(400).json({ error: "invalid_blob_path" });
          return;
        }
        const chunks: Buffer[] = [];
        req.on("data", (c: Buffer) => chunks.push(c));
        req.on("end", () => {
          const stored = pathname.replace(/\.gz$/, `-${randomBytes(6).toString("hex")}.gz`);
          const file = path.join(ROOT, stored);
          mkdirSync(path.dirname(file), { recursive: true });
          writeFileSync(file, Buffer.concat(chunks));
          res.json({ url: `${req.protocol}://${req.get("host")}${PREFIX}${stored}` });
        });
        req.on("error", next);
      },
    );
    app.get(`${PREFIX}*`, (req, res) => {
      const f = fileFor(`http://x${req.path}`);
      if (!f || !existsSync(f)) {
        res.status(404).end();
        return;
      }
      res.type("application/gzip").send(readFileSync(f));
    });
  };

  return { store, mount };
}
