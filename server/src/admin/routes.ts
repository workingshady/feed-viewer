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

/** Activity buckets used by the admin dashboard charts. */
const ACTIVITY_GROUPS = ["version", "source", "user", "share", "client"] as const;

adminRouter.get(
  "/activity",
  asyncHandler(async (req, res) => {
    const { days } = z.object({ days: z.coerce.number().int().min(7).max(90).default(30) }).parse(req.query);
    const since = new Date(Date.now() - days * 86_400_000);
    const [events, logins] = await Promise.all([
      prisma.$queryRaw<{ day: Date; grp: string; n: bigint }[]>`
        SELECT date_trunc('day', "createdAt") AS day, split_part(action, '.', 1) AS grp, count(*) AS n
        FROM "AuditEvent" WHERE "createdAt" >= ${since} GROUP BY 1, 2`,
      prisma.$queryRaw<{ day: Date; ok: boolean; n: bigint }[]>`
        SELECT date_trunc('day', "createdAt") AS day, ok, count(*) AS n
        FROM "LoginAttempt" WHERE "createdAt" >= ${since} GROUP BY 1, 2`,
    ]);
    const empty = () => ({ ...Object.fromEntries(ACTIVITY_GROUPS.map((g) => [g, 0])), signIns: 0, failedSignIns: 0 });
    const byDay = new Map<string, Record<string, number>>();
    for (let i = days - 1; i >= 0; i--) {
      byDay.set(new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10), empty());
    }
    for (const e of events) {
      const row = byDay.get(e.day.toISOString().slice(0, 10));
      const grp = (ACTIVITY_GROUPS as readonly string[]).includes(e.grp) ? e.grp : null;
      if (row && grp) row[grp] += Number(e.n);
    }
    for (const l of logins) {
      const row = byDay.get(l.day.toISOString().slice(0, 10));
      if (row) row[l.ok ? "signIns" : "failedSignIns"] += Number(l.n);
    }
    res.json({ days: [...byDay.entries()].map(([day, counts]) => ({ day, ...counts })) });
  }),
);
