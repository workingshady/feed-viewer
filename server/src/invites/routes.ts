import { Router } from "express";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../http.js";
import { recordAudit } from "../audit.js";
import { createSession, requireRole, type AuthedRequest } from "../auth/session.js";
import { hashToken, newToken } from "../tokens.js";

const INVITE_DAYS = 7;
const RESET_HOURS = 24;

const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .regex(/^[A-Za-z0-9_-]+$/);
const passwordSchema = z.string().min(8).max(256);

/** Admin side: create and revoke invite / reset links. Mounted at /api/admin. */
export const adminInvitesRouter = Router();
adminInvitesRouter.use(requireRole("admin"));

adminInvitesRouter.get(
  "/invites",
  asyncHandler(async (_req, res) => {
    const invites = await prisma.invite.findMany({
      where: { usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { id: true, kind: true, role: true, note: true, userId: true, expiresAt: true, createdAt: true },
    });
    res.json({ invites });
  }),
);

adminInvitesRouter.post(
  "/invites",
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = z.object({ role: z.enum(["admin", "editor", "viewer"]), note: z.string().trim().max(120).optional() }).parse(req.body);
    const token = newToken();
    const invite = await prisma.invite.create({
      data: {
        tokenHash: hashToken(token),
        kind: "invite",
        role: body.role,
        note: body.note || null,
        createdById: req.user!.id,
        expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
      },
      select: { id: true, kind: true, role: true, note: true, expiresAt: true, createdAt: true },
    });
    await recordAudit(req.user!.id, "invite.create", "invite", invite.id, { role: body.role });
    res.status(201).json({ invite, token });
  }),
);

adminInvitesRouter.post(
  "/users/:id/reset-link",
  asyncHandler(async (req: AuthedRequest, res) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.params.id } });
    // Only the newest reset link for a user stays valid.
    await prisma.invite.deleteMany({ where: { kind: "reset", userId: user.id, usedAt: null } });
    const token = newToken();
    const invite = await prisma.invite.create({
      data: {
        tokenHash: hashToken(token),
        kind: "reset",
        role: user.role,
        userId: user.id,
        createdById: req.user!.id,
        expiresAt: new Date(Date.now() + RESET_HOURS * 3_600_000),
      },
      select: { id: true, kind: true, expiresAt: true },
    });
    await recordAudit(req.user!.id, "user.reset_link", "user", user.id);
    res.status(201).json({ invite, token, username: user.username });
  }),
);

adminInvitesRouter.delete(
  "/invites/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    await prisma.invite.delete({ where: { id: req.params.id } });
    await recordAudit(req.user!.id, "invite.revoke", "invite", req.params.id);
    res.json({ ok: true });
  }),
);

/** Public side: inspect and accept a link. Mounted at /api/invites. */
export const invitesRouter = Router();

async function findValidInvite(token: string) {
  const invite = await prisma.invite.findUnique({ where: { tokenHash: hashToken(token) } });
  // One answer for unknown, used and expired links, so tokens can't be probed.
  if (!invite || invite.usedAt || invite.expiresAt <= new Date()) throw new HttpError(404, "invalid_link");
  return invite;
}

invitesRouter.get(
  "/:token",
  asyncHandler(async (req, res) => {
    const invite = await findValidInvite(req.params.token);
    const user = invite.userId ? await prisma.user.findUnique({ where: { id: invite.userId }, select: { username: true } }) : null;
    res.json({ kind: invite.kind, role: invite.role, username: user?.username ?? null, expiresAt: invite.expiresAt });
  }),
);

invitesRouter.post(
  "/:token/accept",
  asyncHandler(async (req, res) => {
    const invite = await findValidInvite(req.params.token);
    const body = z.object({ username: usernameSchema.optional(), password: passwordSchema }).parse(req.body);
    const passwordHash = await bcrypt.hash(body.password, 12);

    let userId: string;
    if (invite.kind === "invite") {
      if (!body.username) throw new HttpError(400, "invalid_body");
      try {
        const user = await prisma.$transaction(async (tx) => {
          // Mark used first so a double submit can't create two accounts.
          const used = await tx.invite.updateMany({ where: { id: invite.id, usedAt: null }, data: { usedAt: new Date() } });
          if (used.count === 0) throw new HttpError(404, "invalid_link");
          return tx.user.create({ data: { username: body.username!, passwordHash, role: invite.role } });
        });
        userId = user.id;
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new HttpError(409, "username_taken");
        throw e;
      }
      await recordAudit(userId, "auth.register", "user", userId, { role: invite.role, via: "invite" });
    } else {
      userId = invite.userId!;
      await prisma.$transaction([
        prisma.invite.update({ where: { id: invite.id }, data: { usedAt: new Date() } }),
        prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
        prisma.session.deleteMany({ where: { userId } }),
      ]);
      await recordAudit(userId, "auth.password_reset", "user", userId);
    }
    await createSession(res, userId);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, username: true, role: true, createdAt: true },
    });
    res.json({ user });
  }),
);
