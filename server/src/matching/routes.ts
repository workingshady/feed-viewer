import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../http.js";
import { recordAudit } from "../audit.js";
import { requireRole, type AuthedRequest } from "../auth/session.js";

/**
 * Property matching: reviewer decisions (shared, audited, applied before scoring) and learned model
 * versions (one active, history kept for rollback). Training itself runs in an editor's browser in a
 * Web Worker — it needs every live feed in memory and minutes of CPU, which a serverless request
 * cannot give — and the result is posted here.
 */
export const matchingRouter = Router();
matchingRouter.use(requireRole("viewer"));

const pairKey = (ids: string[]) => [...new Set(ids)].sort().join("|");

/** A training claim older than this is considered abandoned (tab closed mid-run). */
const CLAIM_TTL_MS = 30 * 60_000;

matchingRouter.get(
  "/decisions",
  asyncHandler(async (_req, res) => {
    const rows = await prisma.matchDecision.findMany({
      orderBy: { updatedAt: "desc" },
      take: 20_000,
      include: { createdBy: { select: { username: true } } },
    });
    res.json({
      decisions: rows.map((r) => ({
        pairKey: r.pairKey,
        listingIds: r.listingIds,
        snapshot: r.snapshot,
        verdict: r.verdict,
        context: r.context,
        by: r.createdBy?.username ?? null,
        updatedAt: r.updatedAt,
      })),
    });
  }),
);

matchingRouter.put(
  "/decisions",
  requireRole("editor"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = z
      .object({
        listingIds: z.array(z.string().min(1).max(300)).min(2).max(12),
        verdict: z.enum(["same", "different"]).nullable(),
        context: z.enum(["versions", "agencies"]),
        snapshot: z
          .array(
            z.object({
              id: z.string().max(300),
              agency: z.string().max(200).optional(),
              reference: z.string().max(200).optional(),
              title: z.string().max(300).optional(),
              price: z.number().finite().optional(),
              currency: z.string().max(10).optional(),
              image: z.string().max(1000).optional(),
              community: z.string().max(200).optional(),
              beds: z.number().finite().optional(),
              area: z.number().finite().optional(),
              permit: z.string().max(100).optional(),
            }),
          )
          .max(12)
          .optional(),
      })
      .parse(req.body);
    const snapshot = (body.snapshot ?? undefined) as Prisma.InputJsonValue | undefined;
    const key = pairKey(body.listingIds);
    if (body.verdict === null) {
      await prisma.matchDecision.deleteMany({ where: { pairKey: key } });
    } else {
      await prisma.matchDecision.upsert({
        where: { pairKey: key },
        create: { pairKey: key, listingIds: body.listingIds, snapshot, verdict: body.verdict, context: body.context, createdById: req.user!.id },
        update: { verdict: body.verdict, context: body.context, createdById: req.user!.id, ...(snapshot ? { snapshot } : {}) },
      });
    }
    await recordAudit(req.user!.id, "matching.decision", "match", key, { verdict: body.verdict, context: body.context });
    res.json({ ok: true, pairKey: key });
  }),
);

const modelSummary = { id: true, metrics: true, active: true, trigger: true, createdAt: true, activatedAt: true, createdBy: { select: { username: true } } } as const;

matchingRouter.get(
  "/model",
  asyncHandler(async (_req, res) => {
    const [model, latest, decisions, lastClaim] = await Promise.all([
      prisma.matchModel.findFirst({ where: { active: true }, orderBy: { activatedAt: "desc" } }),
      prisma.matchModel.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
      prisma.matchDecision.count(),
      prisma.auditEvent.findFirst({ where: { action: "matching.train.claim" }, orderBy: { createdAt: "desc" } }),
    ]);
    // Retraining is scheduled from the last attempt (activated or held back), so a model that fails
    // the gate does not trigger a retrain on every visit.
    const lastTrainedAt = latest?.createdAt ?? null;
    const decisionsSince = lastTrainedAt ? await prisma.matchDecision.count({ where: { updatedAt: { gt: lastTrainedAt } } }) : decisions;
    res.json({
      model: model ? { id: model.id, weights: model.weights, metrics: model.metrics, trigger: model.trigger, createdAt: model.createdAt, activatedAt: model.activatedAt } : null,
      decisions,
      decisionsSince,
      lastTrainedAt,
      trainingSince: lastClaim && Date.now() - lastClaim.createdAt.getTime() < CLAIM_TTL_MS ? lastClaim.createdAt : null,
    });
  }),
);

matchingRouter.get(
  "/models",
  requireRole("editor"),
  asyncHandler(async (_req, res) => {
    const models = await prisma.matchModel.findMany({ select: modelSummary, orderBy: { createdAt: "desc" }, take: 30 });
    res.json({ models: models.map(({ createdBy, ...m }) => ({ ...m, by: createdBy?.username ?? null })) });
  }),
);

/** One trainer at a time: refuses while another browser's claim is fresh. */
matchingRouter.post(
  "/train-claim",
  requireRole("editor"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const last = await prisma.auditEvent.findFirst({ where: { action: "matching.train.claim" }, orderBy: { createdAt: "desc" } });
    if (last && Date.now() - last.createdAt.getTime() < CLAIM_TTL_MS && !z.object({ force: z.boolean().optional() }).parse(req.body ?? {}).force) {
      throw new HttpError(409, "training_in_progress");
    }
    await recordAudit(req.user!.id, "matching.train.claim", "match_model", null);
    res.json({ ok: true });
  }),
);

const weightTable = z.object({
  match: z.number().finite(),
  possible: z.number().finite(),
  weights: z.record(z.string().max(40), z.record(z.string().max(40), z.number().finite().min(-20).max(20))),
});
const modelBody = z.object({
  weights: z.object({ versions: weightTable, agencies: weightTable }),
  metrics: z.record(z.string(), z.unknown()),
  trigger: z.enum(["auto", "manual"]),
  /** Set by the trainer when the new model passed the accuracy gate against the active one. */
  activate: z.boolean(),
});

matchingRouter.post(
  "/models",
  requireRole("editor"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = modelBody.parse(req.body);
    if (Buffer.byteLength(JSON.stringify(body)) > 256 * 1024) throw new HttpError(413, "too_large");
    const created = await prisma.$transaction(async (tx) => {
      if (body.activate) await tx.matchModel.updateMany({ where: { active: true }, data: { active: false } });
      return tx.matchModel.create({
        data: {
          weights: body.weights as Prisma.InputJsonValue,
          metrics: body.metrics as Prisma.InputJsonValue,
          trigger: body.trigger,
          active: body.activate,
          activatedAt: body.activate ? new Date() : null,
          createdById: req.user!.id,
        },
        select: modelSummary,
      });
    });
    await recordAudit(req.user!.id, body.activate ? "matching.model.activate" : "matching.model.store", "match_model", created.id, {
      trigger: body.trigger,
    });
    res.json({ model: created });
  }),
);

/** Activate any stored model (promote a held-back one, or roll back). */
matchingRouter.post(
  "/models/:id/activate",
  requireRole("admin"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const id = z.string().min(1).parse(req.params.id);
    await prisma.$transaction([
      prisma.matchModel.updateMany({ where: { active: true }, data: { active: false } }),
      prisma.matchModel.update({ where: { id }, data: { active: true, activatedAt: new Date() } }),
    ]);
    await recordAudit(req.user!.id, "matching.model.activate", "match_model", id, { manual: true });
    res.json({ ok: true });
  }),
);

/** Back to the built-in weights shipped with the app. */
matchingRouter.post(
  "/models/deactivate",
  requireRole("admin"),
  asyncHandler(async (req: AuthedRequest, res) => {
    await prisma.matchModel.updateMany({ where: { active: true }, data: { active: false } });
    await recordAudit(req.user!.id, "matching.model.builtin", "match_model", null);
    res.json({ ok: true });
  }),
);
