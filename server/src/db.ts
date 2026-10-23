import { PrismaClient } from "@prisma/client";

/** Reuse one client across hot reloads (tsx watch) and warm serverless invocations. */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ log: ["error"] });
globalForPrisma.prisma = prisma;
