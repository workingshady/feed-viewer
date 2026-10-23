import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../http.js";
import { requireRole, type AuthedRequest } from "../auth/session.js";

/** Small per-user JSON settings: `favorites`, `mapping.presets`. */
export const prefsRouter = Router();

const KEY_RE = /^[a-z][a-z0-9_.-]{0,63}$/;
const MAX_VALUE_BYTES = 256 * 1024;

function keyParam(raw: string): string {
  if (!KEY_RE.test(raw)) throw new HttpError(400, "invalid_key");
  return raw;
}

prefsRouter.use(requireRole("viewer"));

prefsRouter.get(
  "/:key",
  asyncHandler(async (req: AuthedRequest, res) => {
    const key = keyParam(req.params.key);
    const row = await prisma.userPref.findUnique({ where: { userId_key: { userId: req.user!.id, key } } });
    res.json({ value: row?.value ?? null });
  }),
);

prefsRouter.put(
  "/:key",
  asyncHandler(async (req: AuthedRequest, res) => {
    const key = keyParam(req.params.key);
    const { value } = z.object({ value: z.unknown() }).parse(req.body);
    if (value === undefined) throw new HttpError(400, "invalid_body");
    if (Buffer.byteLength(JSON.stringify(value)) > MAX_VALUE_BYTES) throw new HttpError(413, "too_large");
    const json = value as Prisma.InputJsonValue;
    await prisma.userPref.upsert({
      where: { userId_key: { userId: req.user!.id, key } },
      create: { userId: req.user!.id, key, value: json },
      update: { value: json },
    });
    res.json({ ok: true });
  }),
);
