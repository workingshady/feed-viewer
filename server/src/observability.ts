import { Router, type NextFunction, type Response } from "express";
import { z } from "zod";
import { prisma } from "./db.js";
import { env } from "./env.js";
import { asyncHandler, HttpError } from "./http.js";
import { recordAudit } from "./audit.js";
import { requireRole, type AuthedRequest } from "./auth/session.js";

/**
 * One JSON line per API request (method, route, status, duration, role). Vercel's log view
 * parses JSON lines, so requests can be filtered by route, status or slowness.
 */
export function requestLog(req: AuthedRequest, res: Response, next: NextFunction) {
  if (env.NODE_ENV === "test" || req.path === "/api/health") return next();
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const line = {
      type: "request",
      method: req.method,
      // The matched pattern keeps ids out of the logs and groups requests by route.
      route: (req.baseUrl || "") + (req.route?.path ?? req.path),
      status: res.statusCode,
      ms: Math.round(ms),
      role: req.user?.role ?? "anon",
      region: process.env.VERCEL_REGION,
    };
    (res.statusCode >= 500 ? console.error : console.log)(JSON.stringify(line));
  });
  next();
}

async function dbLatencyMs(): Promise<number | null> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Date.now() - start;
  } catch {
    return null;
  }
}

const blobConfigured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN) || process.env.E2E_FAKE_BLOB === "1";

const clientErrorSchema = z.object({
  message: z.string().trim().min(1).max(500),
  stack: z.string().max(4000).optional(),
  path: z.string().max(300).optional(),
  kind: z.enum(["error", "unhandledrejection", "render"]).default("error"),
});

/** Browser errors per IP per hour; beyond this they are dropped (still answered 202). */
const CLIENT_ERRORS_PER_HOUR = 30;

export const observabilityRouter = Router();

/** Liveness plus, with `?deep=1`, database reachability and storage configuration. */
observabilityRouter.get(
  "/health",
  asyncHandler(async (req, res) => {
    if (req.query.deep !== "1") return res.json({ ok: true });
    const db = await dbLatencyMs();
    res.status(db === null ? 503 : 200).json({ ok: db !== null, dbMs: db, blob: blobConfigured() });
  }),
);

observabilityRouter.post(
  "/telemetry/error",
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = clientErrorSchema.parse(req.body);
    const ip = req.ip ?? "unknown";
    const recent = await prisma.auditEvent.count({
      where: { action: "client.error", targetId: ip, createdAt: { gte: new Date(Date.now() - 3_600_000) } },
    });
    if (recent < CLIENT_ERRORS_PER_HOUR) {
      console.error(JSON.stringify({ type: "client_error", ...body, role: req.user?.role ?? "anon" }));
      await recordAudit(req.user?.id ?? null, "client.error", "client", ip, {
        message: body.message,
        path: body.path ?? null,
        kind: body.kind,
        stack: body.stack?.split("\n").slice(0, 8).join("\n") ?? null,
      });
    }
    res.status(202).json({ ok: true });
  }),
);

/** Operational overview for the admin console. */
observabilityRouter.get(
  "/admin/status",
  requireRole("admin"),
  asyncHandler(async (_req, res) => {
    const since = new Date(Date.now() - 24 * 3_600_000);
    const [dbMs, users, sources, versions, bytes, failedLogins, clientErrors, uploads] = await Promise.all([
      dbLatencyMs(),
      prisma.user.count(),
      prisma.source.count(),
      prisma.feedVersion.count(),
      prisma.feedVersion.aggregate({ _sum: { fileBytes: true } }),
      prisma.loginAttempt.count({ where: { ok: false, createdAt: { gte: since } } }),
      prisma.auditEvent.count({ where: { action: "client.error", createdAt: { gte: since } } }),
      prisma.auditEvent.count({ where: { action: "version.upload", createdAt: { gte: since } } }),
    ]);
    if (dbMs === null) throw new HttpError(503, "database_unreachable");
    res.json({
      dbMs,
      blobConfigured: blobConfigured(),
      region: process.env.VERCEL_REGION ?? "local",
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      environment: process.env.VERCEL_ENV ?? env.NODE_ENV,
      totals: { users, sources, versions, uploadedBytes: bytes._sum.fileBytes ?? 0 },
      last24h: { uploads, failedLogins, clientErrors },
    });
  }),
);
