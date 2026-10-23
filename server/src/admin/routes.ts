import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../http.js";
import { recordAudit } from "../audit.js";
import { requireRole, type AuthedRequest } from "../auth/session.js";

export const adminRouter = Router();
adminRouter.use(requireRole("admin"));

const publicUser = { id: true, username: true, role: true, createdAt: true } as const;

/** Refuses any change that would leave the deployment without an admin. */
async function assertNotLastAdmin(userId: string) {
  const target = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (target.role !== "admin") return;
  const admins = await prisma.user.count({ where: { role: "admin" } });
  if (admins <= 1) throw new HttpError(400, "last_admin");
}

adminRouter.get(
  "/users",
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({ select: publicUser, orderBy: { createdAt: "asc" } });
    res.json({ users });
  }),
);

adminRouter.patch(
  "/users/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const { role } = z.object({ role: z.enum(["admin", "editor", "viewer"]) }).parse(req.body);
    if (role !== "admin") await assertNotLastAdmin(req.params.id);
    const user = await prisma.user.update({ where: { id: req.params.id }, data: { role }, select: publicUser });
    // Sign the user out everywhere so the new role applies immediately (but keep the caller signed in).
    if (user.id !== req.user!.id) await prisma.session.deleteMany({ where: { userId: user.id } });
    await recordAudit(req.user!.id, "user.role_change", "user", user.id, { role });
    res.json({ user });
  }),
);

adminRouter.delete(
  "/users/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    if (req.params.id === req.user!.id) throw new HttpError(400, "cannot_delete_self");
    await assertNotLastAdmin(req.params.id);
    await prisma.user.delete({ where: { id: req.params.id } });
    await recordAudit(req.user!.id, "user.delete", "user", req.params.id);
    res.json({ ok: true });
  }),
);

adminRouter.get(
  "/audit",
  asyncHandler(async (req, res) => {
    const q = z
      .object({
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
        /** Action prefix filter, e.g. "version." or "client.error". */
        prefix: z.string().max(40).optional(),
      })
      .parse(req.query);
    const rows = await prisma.auditEvent.findMany({
      where: q.prefix ? { action: { startsWith: q.prefix } } : undefined,
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { user: { select: { username: true } } },
    });
    const events = rows.slice(0, q.limit);
    res.json({ events, nextCursor: rows.length > q.limit ? events[events.length - 1].id : null });
  }),
);
