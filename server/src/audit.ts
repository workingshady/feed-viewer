import type { Prisma } from "@prisma/client";
import { prisma } from "./db.js";

/** Server-side audit trail. Failures are logged, never thrown — auditing must not break the action. */
export async function recordAudit(
  userId: string | null,
  action: string,
  targetType: string,
  targetId: string | null,
  meta?: Prisma.InputJsonValue,
): Promise<void> {
  try {
    await prisma.auditEvent.create({ data: { userId, action, targetType, targetId, meta } });
  } catch (e) {
    console.error("[audit] failed to record", action, e);
  }
}
