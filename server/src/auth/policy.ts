import type { Role } from "@prisma/client";

export const ROLE_RANK: Record<Role, number> = { viewer: 0, editor: 1, admin: 2 };

export function hasRole(user: { role: Role }, min: Role): boolean {
  return ROLE_RANK[user.role] >= ROLE_RANK[min];
}

export type SignupDecision = { allowed: true; role: Role } | { allowed: false };

/** First account ever is the admin; afterwards signup is opt-in and creates viewers. */
export function signupDecision(userCount: number, allowSignup: boolean): SignupDecision {
  if (userCount === 0) return { allowed: true, role: "admin" };
  if (allowSignup) return { allowed: true, role: "viewer" };
  return { allowed: false };
}

export const RATE_WINDOW_MS = 15 * 60_000;
export const MAX_FAILED_ATTEMPTS = 5;

export function isRateLimited(failuresByUser: number, failuresByIp: number): boolean {
  return failuresByUser >= MAX_FAILED_ATTEMPTS || failuresByIp >= MAX_FAILED_ATTEMPTS;
}
