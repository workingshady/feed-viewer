import { Router } from "express";
import { gunzipSync } from "node:zlib";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../http.js";
import { recordAudit } from "../audit.js";
import { hasRole } from "../auth/policy.js";
import { requireRole, type AuthedRequest } from "../auth/session.js";
import { hashToken, newToken } from "../tokens.js";

/** Loads a version's listings JSON (gzip) from storage. Injected so tests don't need Vercel Blob. */
export type ListingsLoader = (url: string) => Promise<Record<string, unknown>[]>;

const cache = new Map<string, Promise<Record<string, unknown>[]>>();

export const httpListingsLoader: ListingsLoader = (url) => {
  let p = cache.get(url);
  if (!p) {
    p = fetch(url).then(async (r) => {
      if (!r.ok) throw new Error(`listings fetch failed: ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      const raw = buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf) : buf;
      return JSON.parse(raw.toString("utf8")) as Record<string, unknown>[];
    });
    p.catch(() => cache.delete(url));
    // Version files never change; keep only a few to bound memory in a warm function.
    if (cache.size >= 3) cache.delete(cache.keys().next().value!);
    cache.set(url, p);
  }
  return p;
};

const listingKey = (l: Record<string, unknown>) => String(l.id || l.reference || "");

const shareSelect = {
  id: true,
  kind: true,
  sourceId: true,
  listingRef: true,
  label: true,
  expiresAt: true,
  revokedAt: true,
  viewCount: true,
  lastViewedAt: true,
  createdAt: true,
  createdById: true,
  source: { select: { name: true } },
} as const;

export function sharesRouter(loadListings: ListingsLoader) {
  const router = Router();

  /** Editors create, list and revoke share links. */
  router.post(
    "/shares",
    requireRole("editor"),
    asyncHandler(async (req: AuthedRequest, res) => {
      const body = z
        .object({
          kind: z.enum(["listing", "source"]),
          sourceId: z.string().min(1),
          listingRef: z.string().min(1).max(200).optional(),
          label: z.string().trim().min(1).max(200),
          expiresInDays: z.union([z.literal(1), z.literal(7), z.literal(30), z.literal(90), z.null()]).default(30),
        })
        .parse(req.body);
      if (body.kind === "listing" && !body.listingRef) throw new HttpError(400, "invalid_body");
      await prisma.source.findUniqueOrThrow({ where: { id: body.sourceId } });
      const token = newToken();
      const share = await prisma.shareLink.create({
        data: {
          tokenHash: hashToken(token),
          kind: body.kind,
          sourceId: body.sourceId,
          listingRef: body.kind === "listing" ? body.listingRef : null,
          label: body.label,
          createdById: req.user!.id,
          expiresAt: body.expiresInDays ? new Date(Date.now() + body.expiresInDays * 86_400_000) : null,
        },
        select: shareSelect,
      });
      await recordAudit(req.user!.id, "share.create", "share", share.id, { kind: body.kind, label: body.label });
      res.status(201).json({ share, token });
    }),
  );

  router.get(
    "/shares",
    requireRole("editor"),
    asyncHandler(async (req: AuthedRequest, res) => {
      const q = z.object({ sourceId: z.string().optional(), listingRef: z.string().optional() }).parse(req.query);
      const shares = await prisma.shareLink.findMany({
        where: {
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          ...(q.sourceId ? { sourceId: q.sourceId } : {}),
          ...(q.listingRef ? { listingRef: q.listingRef } : {}),
          // Editors see their own links; admins see everyone's.
          ...(hasRole(req.user!, "admin") ? {} : { createdById: req.user!.id }),
        },
        orderBy: { createdAt: "desc" },
        select: shareSelect,
      });
      res.json({ shares });
    }),
  );

  router.delete(
    "/shares/:id",
    requireRole("editor"),
    asyncHandler(async (req: AuthedRequest, res) => {
      const share = await prisma.shareLink.findUniqueOrThrow({ where: { id: req.params.id } });
      if (share.createdById !== req.user!.id && !hasRole(req.user!, "admin")) throw new HttpError(403, "forbidden");
      await prisma.shareLink.update({ where: { id: share.id }, data: { revokedAt: new Date() } });
      await recordAudit(req.user!.id, "share.revoke", "share", share.id, { label: share.label });
      res.json({ ok: true });
    }),
  );

  /** Anyone with the link: read-only view data. Same 404 for unknown, expired and revoked links. */
  router.get(
    "/public/shares/:token",
    asyncHandler(async (req, res) => {
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
      res.setHeader("Cache-Control", "private, no-store");
      const share = await prisma.shareLink.findUnique({
        where: { tokenHash: hashToken(req.params.token) },
        include: { source: { include: { activeVersion: true } } },
      });
      const now = new Date();
      if (!share || share.revokedAt || (share.expiresAt && share.expiresAt <= now)) throw new HttpError(404, "invalid_link");
      const live = share.source.activeVersion;
      if (!live) throw new HttpError(404, "invalid_link");

      const base = {
        kind: share.kind,
        label: share.label,
        expiresAt: share.expiresAt,
        source: { name: share.source.name, agencyInfo: share.source.agencyInfo },
        updatedAt: live.createdAt,
      };
      let body: Record<string, unknown>;
      if (share.kind === "listing") {
        const listings = await loadListings(live.listingsBlobUrl);
        const listing = listings.find((l) => listingKey(l) === share.listingRef) ?? null;
        // A listing that left the feed reads as gone rather than an error.
        body = { ...base, listing };
      } else {
        body = { ...base, listingsUrl: live.listingsBlobUrl, listingCount: live.listingCount };
      }
      await prisma.shareLink.update({ where: { id: share.id }, data: { viewCount: { increment: 1 }, lastViewedAt: now } });
      res.json(body);
    }),
  );

  return router;
}
