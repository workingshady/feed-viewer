import { apiFetch, jsonBody } from "@/lib/api";

export const changePassword = (current: string, next: string) =>
  apiFetch<{ ok: true }>("/api/auth/password", { method: "POST", ...jsonBody({ current, next }) });
