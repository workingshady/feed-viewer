import { Router } from "express";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { asyncHandler, HttpError } from "../http.js";
import { recordAudit } from "../audit.js";
import { RATE_WINDOW_MS, isRateLimited, signupDecision } from "./policy.js";
import { createSession, destroySession, requireRole, type AuthedRequest } from "./session.js";

export const authRouter = Router();

const credentialsSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(32)
    .regex(/^[A-Za-z0-9_-]+$/),
  password: z.string().min(8).max(256),
});

const loginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(256),
});

const publicUser = { id: true, username: true, role: true, createdAt: true } as const;

authRouter.get(
  "/me",
  asyncHandler(async (req: AuthedRequest, res) => {
    if (!req.user) return res.json({ user: null });
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: publicUser });
    res.json({ user });
  }),
);

authRouter.get(
  "/signup-status",
  asyncHandler(async (_req, res) => {
    const count = await prisma.user.count();
    res.json({ open: signupDecision(count, env.ALLOW_SIGNUP).allowed, firstUser: count === 0 });
  }),
);

authRouter.post(
  "/register",
  asyncHandler(async (req: AuthedRequest, res) => {
    const { username, password } = credentialsSchema.parse(req.body);
    const passwordHash = await bcrypt.hash(password, 12);
    let user;
    try {
      // Serializable so two simultaneous "first" signups cannot both become admin.
      user = await prisma.$transaction(
        async (tx) => {
          const decision = signupDecision(await tx.user.count(), env.ALLOW_SIGNUP);
          if (!decision.allowed) throw new HttpError(403, "signup_closed");
          return tx.user.create({ data: { username, passwordHash, role: decision.role }, select: publicUser });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new HttpError(409, "username_taken");
      }
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034") {
        throw new HttpError(409, "try_again");
      }
      throw e;
    }
    await createSession(res, user.id);
    await recordAudit(user.id, "auth.register", "user", user.id, { role: user.role });
    res.status(201).json({ user });
  }),
);

authRouter.post(
  "/login",
  asyncHandler(async (req: AuthedRequest, res) => {
    const { username, password } = loginSchema.parse(req.body);
    const ip = req.ip ?? "unknown";
    const since = new Date(Date.now() - RATE_WINDOW_MS);
    const [byUser, byIp] = await Promise.all([
      prisma.loginAttempt.count({ where: { username, ok: false, createdAt: { gte: since } } }),
      prisma.loginAttempt.count({ where: { ip, ok: false, createdAt: { gte: since } } }),
    ]);
    if (isRateLimited(byUser, byIp)) throw new HttpError(429, "too_many_attempts");

    const row = await prisma.user.findUnique({ where: { username } });
    const ok = !!row && (await bcrypt.compare(password, row.passwordHash));
    await prisma.loginAttempt.create({ data: { username, ip, ok } });
    if (!ok || !row) throw new HttpError(401, "invalid_credentials");

    await createSession(res, row.id);
    res.json({ user: { id: row.id, username: row.username, role: row.role, createdAt: row.createdAt } });
  }),
);

authRouter.post(
  "/logout",
  asyncHandler(async (req, res) => {
    await destroySession(req, res);
    res.json({ ok: true });
  }),
);

authRouter.post(
  "/password",
  requireRole("viewer"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = z.object({ current: z.string().min(1).max(256), next: z.string().min(8).max(256) }).parse(req.body);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    if (!(await bcrypt.compare(body.current, row.passwordHash))) throw new HttpError(400, "invalid_credentials");
    await prisma.user.update({ where: { id: row.id }, data: { passwordHash: await bcrypt.hash(body.next, 12) } });
    await recordAudit(row.id, "auth.password_change", "user", row.id);
    res.json({ ok: true });
  }),
);
