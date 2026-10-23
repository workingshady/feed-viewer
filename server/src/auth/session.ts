import type { NextFunction, Request, Response } from "express";
import type { Role } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { prisma } from "../db.js";
import { env, isProduction } from "../env.js";
import { hasRole } from "./policy.js";

export const SESSION_COOKIE = "sid";
const DAY_MS = 24 * 60 * 60_000;

export type SessionUser = { id: string; username: string; role: Role };
export type AuthedRequest = Request & { user?: SessionUser };

const ttlMs = () => env.SESSION_TTL_DAYS * DAY_MS;

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProduction(),
    path: "/",
    maxAge: ttlMs(),
  };
}

export async function createSession(res: Response, userId: string): Promise<void> {
  const id = randomBytes(32).toString("base64url");
  await prisma.session.create({ data: { id, userId, expiresAt: new Date(Date.now() + ttlMs()) } });
  res.cookie(SESSION_COOKIE, id, cookieOptions());
}

export async function destroySession(req: Request, res: Response): Promise<void> {
  const sid = req.cookies?.[SESSION_COOKIE];
  if (typeof sid === "string") await prisma.session.deleteMany({ where: { id: sid } });
  res.clearCookie(SESSION_COOKIE, { ...cookieOptions(), maxAge: undefined });
}

/** Loads the session user (if any). Slides expiry at most once a day to keep writes rare. */
export async function authMiddleware(req: AuthedRequest, _res: Response, next: NextFunction) {
  try {
    const sid = req.cookies?.[SESSION_COOKIE];
    if (typeof sid !== "string" || !sid) return next();
    const session = await prisma.session.findUnique({
      where: { id: sid },
      include: { user: { select: { id: true, username: true, role: true } } },
    });
    if (!session) return next();
    const now = Date.now();
    if (session.expiresAt.getTime() <= now) {
      await prisma.session.deleteMany({ where: { id: sid } });
      return next();
    }
    if (now - session.lastSeenAt.getTime() > DAY_MS) {
      await prisma.session.update({
        where: { id: sid },
        data: { lastSeenAt: new Date(now), expiresAt: new Date(now + ttlMs()) },
      });
    }
    req.user = session.user;
    next();
  } catch (e) {
    next(e);
  }
}

export function requireRole(min: Role) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if (!hasRole(req.user, min)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    next();
  };
}
