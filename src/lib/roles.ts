/** The three roles the server enforces. Viewers read; editors manage feeds; admins manage users. */
export type AppRole = "admin" | "editor" | "viewer";

export const ROLE_RANK: Record<AppRole, number> = { viewer: 0, editor: 1, admin: 2 };

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Administrator",
  editor: "Editor",
  viewer: "Viewer",
};

export const ROLE_DESCRIPTIONS: Record<AppRole, string> = {
  admin: "Everything an editor can do, plus managing users and reading the audit log.",
  editor: "Upload feeds, apply or delete versions, edit mappings and source settings.",
  viewer: "Browse listings, agencies, maps, quality reports and comparisons.",
};

const asRole = (role: string | undefined | null): AppRole =>
  role === "admin" || role === "editor" ? role : "viewer";

export function roleLabel(role: string | undefined | null): string {
  return ROLE_LABELS[asRole(role)];
}

/** Client mirror of the server check — hides controls only; the server is the real gate. */
export function hasRole(role: string | undefined | null, min: AppRole): boolean {
  return ROLE_RANK[asRole(role)] >= ROLE_RANK[min];
}
