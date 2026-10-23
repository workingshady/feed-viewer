import { apiFetch, jsonBody } from "@/lib/api";
import type { AppRole } from "@/lib/roles";
import type { ImportResult, Listing } from "@/lib/types";

export type InviteDTO = {
  id: string;
  kind: "invite" | "reset";
  role: AppRole;
  note?: string | null;
  userId?: string | null;
  expiresAt: string;
  createdAt: string;
};

export type ShareDTO = {
  id: string;
  kind: "listing" | "source";
  sourceId: string;
  listingRef: string | null;
  label: string;
  expiresAt: string | null;
  viewCount: number;
  lastViewedAt: string | null;
  createdAt: string;
  source: { name: string };
};

export type PublicShare = {
  kind: "listing" | "source";
  label: string;
  expiresAt: string | null;
  updatedAt: string;
  source: { name: string; agencyInfo: ImportResult["agencyInfo"] | null };
  listing?: Listing | null;
  listingsUrl?: string;
  listingCount?: number;
};

/** Full links are only known when created (the server keeps a hash), so they're built here once. */
export const inviteUrl = (token: string) => `${location.origin}/invite/${token}`;
export const shareUrl = (token: string) => `${location.origin}/s/${token}`;

export const listInvites = () => apiFetch<{ invites: InviteDTO[] }>("/api/admin/invites").then((r) => r.invites);
export const createInvite = (role: AppRole, note?: string) =>
  apiFetch<{ invite: InviteDTO; token: string }>("/api/admin/invites", { method: "POST", ...jsonBody({ role, note }) });
export const createResetLink = (userId: string) =>
  apiFetch<{ invite: InviteDTO; token: string; username: string }>(`/api/admin/users/${userId}/reset-link`, { method: "POST" });
export const revokeInvite = (id: string) => apiFetch<{ ok: true }>(`/api/admin/invites/${id}`, { method: "DELETE" });

export const getInvite = (token: string) =>
  apiFetch<{ kind: "invite" | "reset"; role: AppRole; username: string | null; expiresAt: string }>(`/api/invites/${token}`);
export const acceptInvite = (token: string, body: { username?: string; password: string }) =>
  apiFetch<{ user: { id: string; username: string; role: AppRole } }>(`/api/invites/${token}/accept`, {
    method: "POST",
    ...jsonBody(body),
  });

export const listShares = (filter: { sourceId?: string; listingRef?: string } = {}) => {
  const q = new URLSearchParams(Object.entries(filter).filter(([, v]) => v) as [string, string][]);
  return apiFetch<{ shares: ShareDTO[] }>(`/api/shares${q.size ? `?${q}` : ""}`).then((r) => r.shares);
};
export const createShare = (body: {
  kind: "listing" | "source";
  sourceId: string;
  listingRef?: string;
  label: string;
  expiresInDays: 1 | 7 | 30 | 90 | null;
}) => apiFetch<{ share: ShareDTO; token: string }>("/api/shares", { method: "POST", ...jsonBody(body) });
export const revokeShare = (id: string) => apiFetch<{ ok: true }>(`/api/shares/${id}`, { method: "DELETE" });

export const getPublicShare = (token: string) => apiFetch<PublicShare>(`/api/public/shares/${token}`);
