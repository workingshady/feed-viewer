import { formatPriceCompact } from "@/lib/displayPrice";
import type { ImportListingStatus, Listing } from "@/lib/types";

export const DB_MISSING = "NAN";

/**
 * Many Dubai/XML feeds use &lt;price_on_application&gt;Yes&lt;/...&gt; / No.
 * Only affirmative values mean "no fixed numeric price"; "No" means a normal price is provided.
 */
export function priceOnApplicationIsAffirmative(poa: string | undefined | null): boolean {
  const t = String(poa ?? "").trim().toLowerCase();
  if (!t) return false;
  if (t === "no" || t === "n" || t === "false" || t === "0") return false;
  if (t === "yes" || t === "y" || t === "true" || t === "1" || t === "poa") return true;
  if (t.includes("on application") && !t.startsWith("no")) return true;
  return false;
}

export function clipDb(s: string, max: number): string {
  const t = (s ?? "").trim();
  if (!t) return DB_MISSING;
  return t.length <= max ? t : `${t.slice(0, Math.max(1, max - 1))}…`;
}

export function dbStr(raw: unknown): string {
  const t = String(raw ?? "").trim();
  return t.length ? t : DB_MISSING;
}

export function dbNum(n: unknown): string {
  if (typeof n === "number" && Number.isFinite(n)) return String(n);
  return DB_MISSING;
}

export function dbPriceLabel(l: Listing): string {
  if (priceOnApplicationIsAffirmative(l.priceOnApplication)) return DB_MISSING;
  const p = l.price;
  if (!Number.isFinite(p) || p <= 0) return DB_MISSING;
  return formatPriceCompact(p);
}

export function dbCurrency(l: Listing): string {
  const c = (l.currency ?? "").trim();
  return c ? c.slice(0, 3) : DB_MISSING;
}

export function dbDate(iso: string | undefined | null): string {
  if (!iso || !String(iso).trim()) return DB_MISSING;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return DB_MISSING;
  return d.toLocaleDateString();
}

export function dbPurpose(p: Listing["purpose"] | undefined): string {
  if (p === "sale" || p === "rent" || p === "unknown") return p;
  return DB_MISSING;
}

export function statusBadgeClass(s: ImportListingStatus): string {
  switch (s) {
    case "new":
      return "border-green-500/40 bg-green-500/10 text-green-600 dark:text-green-400";
    case "updated":
      return "border-primary/40 bg-primary/10 text-primary-text";
    case "unchanged":
      return "border-border bg-muted/60 text-muted-foreground";
    case "removed":
      return "border-destructive/40 bg-destructive/10 text-destructive-text";
    case "duplicate":
      return "border-warning/40 bg-warning/10 text-warning";
    default:
      return "border-border";
  }
}
