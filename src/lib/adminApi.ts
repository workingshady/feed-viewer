import { apiFetch, jsonBody } from "@/lib/api";
import type { AppRole } from "@/lib/roles";

export type AdminUser = { id: string; username: string; role: AppRole; createdAt: string };

export type AdminAuditEvent = {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  meta: unknown;
  createdAt: string;
  user: { username: string } | null;
};

export const fetchAdminUsers = () => apiFetch<{ users: AdminUser[] }>("/api/admin/users").then((r) => r.users);

export const adminUpdateUserRole = (id: string, role: AppRole) =>
  apiFetch<{ user: AdminUser }>(`/api/admin/users/${id}`, { method: "PATCH", ...jsonBody({ role }) }).then(
    (r) => r.user,
  );

export const adminDeleteUser = (id: string) =>
  apiFetch<{ ok: true }>(`/api/admin/users/${id}`, { method: "DELETE" });

export const fetchAdminAudit = (cursor?: string | null, limit = 50, prefix?: string) => {
  const q = new URLSearchParams({ limit: String(limit) });
  if (cursor) q.set("cursor", cursor);
  if (prefix) q.set("prefix", prefix);
  return apiFetch<{ events: AdminAuditEvent[]; nextCursor: string | null }>(`/api/admin/audit?${q}`);
};

export type AdminStatus = {
  dbMs: number;
  blobConfigured: boolean;
  region: string;
  commit: string | null;
  environment: string;
  totals: { users: number; sources: number; versions: number; uploadedBytes: number };
  last24h: { uploads: number; failedLogins: number; clientErrors: number };
};

export const fetchAdminStatus = () => apiFetch<AdminStatus>("/api/admin/status");
