import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../http.js";
import { recordAudit } from "../audit.js";
import { requireRole, type AuthedRequest } from "../auth/session.js";
import { sourceIdFromBlobUrl, type BlobStore } from "./blobStore.js";
import { decideAutoApply, selectVersionsToPrune } from "./policy.js";

const versionInclude = { createdBy: { select: { id: true, username: true } } } as const;
const sourceInclude = {
  versions: { include: versionInclude, orderBy: { number: "desc" } },
} as const satisfies Prisma.SourceInclude;

const json = z.custom<Prisma.InputJsonValue>((v) => v !== undefined);

const createSourceSchema = z.object({
  name: z.string().trim().min(1).max(120),
  agencyName: z.string().trim().max(200).default(""),
  agencyInfo: json.optional(),
});

const updateSourceSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  mapping: json.nullable().optional(),
  retainVersions: z.number().int().min(1).max(50).optional(),
});

const registerVersionSchema = z.object({
  uploadId: z.string().regex(/^[A-Za-z0-9_-]{10,64}$/),
  fileName: z.string().trim().min(1).max(255),
  fileBytes: z.number().int().min(0),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  mappingFingerprint: z.string().max(128).default(""),
  xmlBlobUrl: z.string().url(),
  listingsBlobUrl: z.string().url(),
  listingCount: z.number().int().min(0),
  added: z.number().int().min(0).default(0),
  removed: z.number().int().min(0).default(0),
  changed: z.number().int().min(0).default(0),
  warnings: json.optional(),
  stats: json.optional(),
  apply: z.enum(["auto", "never"]).default("auto"),
});

const updateVersionSchema = z.object({
  note: z.string().trim().max(200).nullable().optional(),
  pinned: z.boolean().optional(),
});

async function loadSource(id: string) {
  const source = await prisma.source.findUnique({ where: { id }, include: sourceInclude });
  if (!source) throw new HttpError(404, "not_found");
  return source;
}

async function loadVersion(sourceId: string, versionId: string) {
  const version = await prisma.feedVersion.findFirst({ where: { id: versionId, sourceId } });
  if (!version) throw new HttpError(404, "not_found");
  return version;
}

const blobUrlsOf = (v: { xmlBlobUrl: string; listingsBlobUrl: string }) => [v.xmlBlobUrl, v.listingsBlobUrl];

function isUniqueViolation(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

export function sourcesRouter(blobStore: BlobStore) {
  const router = Router();
  router.use(requireRole("viewer"));
  const editor = requireRole("editor");

  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      const sources = await prisma.source.findMany({ include: sourceInclude, orderBy: { name: "asc" } });
      res.json({ sources });
    }),
  );

  router.post(
    "/",
    editor,
    asyncHandler(async (req: AuthedRequest, res) => {
      const body = createSourceSchema.parse(req.body);
      try {
        const created = await prisma.source.create({
          data: { name: body.name, agencyName: body.agencyName, agencyInfo: body.agencyInfo },
        });
        await recordAudit(req.user!.id, "source.create", "source", created.id, { name: created.name });
        res.status(201).json({ source: await loadSource(created.id) });
      } catch (e) {
        if (isUniqueViolation(e)) throw new HttpError(409, "name_taken");
        throw e;
      }
    }),
  );

  router.patch(
    "/:id",
    editor,
    asyncHandler(async (req: AuthedRequest, res) => {
      const body = updateSourceSchema.parse(req.body);
      try {
        await prisma.source.update({
          where: { id: req.params.id },
          data: {
            name: body.name,
            retainVersions: body.retainVersions,
            mapping: body.mapping === null ? Prisma.DbNull : body.mapping,
          },
        });
      } catch (e) {
        if (isUniqueViolation(e)) throw new HttpError(409, "name_taken");
        throw e;
      }
      await recordAudit(req.user!.id, "source.update", "source", req.params.id, { fields: Object.keys(body) });
      res.json({ source: await loadSource(req.params.id) });
    }),
  );

  // Wipes every source, version and stored file. Admin only, with a typed confirmation.
  router.post(
    "/clear-all",
    requireRole("admin"),
    asyncHandler(async (req: AuthedRequest, res) => {
      z.object({ confirm: z.literal("DELETE ALL") }).parse(req.body);
      const sources = await prisma.source.findMany({ include: { versions: true } });
      const versions = sources.flatMap((s) => s.versions);
      await blobStore.del(versions.flatMap(blobUrlsOf));
      await prisma.source.deleteMany({ where: { id: { in: sources.map((s) => s.id) } } });
      await recordAudit(req.user!.id, "source.clear_all", "source", null, { sources: sources.length, versions: versions.length });
      res.json({ ok: true, deletedSources: sources.length, deletedVersions: versions.length });
    }),
  );

  router.delete(
    "/:id",
    editor,
    asyncHandler(async (req: AuthedRequest, res) => {
      const source = await loadSource(req.params.id);
      await blobStore.del(source.versions.flatMap(blobUrlsOf));
      await prisma.source.delete({ where: { id: source.id } });
      await recordAudit(req.user!.id, "source.delete", "source", source.id, {
        name: source.name,
        versions: source.versions.length,
      });
      res.json({ ok: true, deletedVersions: source.versions.length });
    }),
  );

  router.post(
    "/:id/versions",
    editor,
    asyncHandler(async (req: AuthedRequest, res) => {
      const body = registerVersionSchema.parse(req.body);
      const source = await loadSource(req.params.id);
      const uploaded = [body.xmlBlobUrl, body.listingsBlobUrl];
      if (uploaded.some((u) => sourceIdFromBlobUrl(u) !== source.id)) throw new HttpError(400, "invalid_blob_url");

      const existing = source.versions.find(
        (v) => v.sha256 === body.sha256 && v.mappingFingerprint === body.mappingFingerprint,
      );
      if (existing) {
        await blobStore.del(uploaded);
        return res.json({ version: existing, duplicate: true, applied: false, pruned: [] });
      }

      const live = source.versions.find((v) => v.id === source.activeVersionId) ?? null;
      const decision = body.apply === "auto" ? decideAutoApply(live?.listingCount ?? null, body.listingCount) : null;
      const applied = decision?.apply === true;

      let version;
      try {
        version = await prisma.$transaction(async (tx) => {
          const max = await tx.feedVersion.aggregate({ where: { sourceId: source.id }, _max: { number: true } });
          const { apply: _apply, ...data } = body;
          const created = await tx.feedVersion.create({
            data: { ...data, sourceId: source.id, number: (max._max.number ?? 0) + 1, createdById: req.user!.id },
            include: versionInclude,
          });
          if (applied) await tx.source.update({ where: { id: source.id }, data: { activeVersionId: created.id } });
          return created;
        });
      } catch (e) {
        await blobStore.del(uploaded);
        if (isUniqueViolation(e)) throw new HttpError(409, "try_again");
        throw e;
      }

      // Retention: drop the oldest unpinned, non-live versions beyond the source's limit.
      const all = [...source.versions, version];
      const liveId = applied ? version.id : source.activeVersionId;
      const pruneIds = selectVersionsToPrune(all, source.retainVersions, liveId);
      const pruned = all.filter((v) => pruneIds.includes(v.id));
      if (pruned.length) {
        await blobStore.del(pruned.flatMap(blobUrlsOf));
        await prisma.feedVersion.deleteMany({ where: { id: { in: pruneIds } } });
      }

      await recordAudit(req.user!.id, "version.upload", "version", version.id, {
        sourceId: source.id,
        number: version.number,
        applied,
        pruned: pruned.map((v) => v.number),
      });
      res.status(201).json({
        version,
        duplicate: false,
        applied,
        ...(decision && !decision.apply ? { blockedReason: decision.reason } : {}),
        pruned: pruneIds,
      });
    }),
  );

  router.post(
    "/:id/versions/:vid/apply",
    editor,
    asyncHandler(async (req: AuthedRequest, res) => {
      const version = await loadVersion(req.params.id, req.params.vid);
      await prisma.source.update({ where: { id: req.params.id }, data: { activeVersionId: version.id } });
      await recordAudit(req.user!.id, "version.apply", "version", version.id, {
        sourceId: req.params.id,
        number: version.number,
      });
      res.json({ source: await loadSource(req.params.id) });
    }),
  );

  router.patch(
    "/:id/versions/:vid",
    editor,
    asyncHandler(async (req: AuthedRequest, res) => {
      const body = updateVersionSchema.parse(req.body);
      await loadVersion(req.params.id, req.params.vid);
      const version = await prisma.feedVersion.update({
        where: { id: req.params.vid },
        data: body,
        include: versionInclude,
      });
      res.json({ version });
    }),
  );

  router.delete(
    "/:id/versions/:vid",
    editor,
    asyncHandler(async (req: AuthedRequest, res) => {
      const version = await loadVersion(req.params.id, req.params.vid);
      const source = await prisma.source.findUniqueOrThrow({ where: { id: req.params.id } });
      if (source.activeVersionId === version.id) throw new HttpError(409, "version_is_live");
      await blobStore.del(blobUrlsOf(version));
      await prisma.feedVersion.delete({ where: { id: version.id } });
      await recordAudit(req.user!.id, "version.delete", "version", version.id, {
        sourceId: source.id,
        number: version.number,
      });
      res.json({ ok: true });
    }),
  );

  return router;
}
