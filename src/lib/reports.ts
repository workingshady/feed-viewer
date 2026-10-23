import type { Listing } from "@/lib/types";
import type { FeedCheckResult } from "@/lib/feedValidation";
import type { VersionDiff } from "@/lib/versionDiff";
import { UI_FIELDS } from "@/lib/types";

/** CSV builders for the per-version downloads. Excel-friendly: quoted where needed, BOM added by the caller. */

const cell = (v: unknown): string => {
  const s = v == null ? "" : Array.isArray(v) ? v.join(" | ") : typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
/** Header + rows → CSV text (values quoted when needed). */
export const toCsv = (header: string[], data: unknown[][]) => [header, ...data].map((r) => r.map(cell).join(",")).join("\n");

/** One row per check rule with its count, severity, hint and example references. */
export function feedCheckCsv(result: FeedCheckResult): string {
  return toCsv(
    ["severity", "check", "listings", "share", "how_to_fix", "examples"],
    result.issues.map((i) => [
      i.severity,
      i.title,
      i.count,
      `${Math.round((i.count / Math.max(1, result.listingCount)) * 100)}%`,
      i.hint,
      i.examples.join(" "),
    ]),
  );
}

const FIELD_LABEL = Object.fromEntries(UI_FIELDS.map((f) => [f.key, f.label])) as Record<string, string>;

/** Every change between two versions: added, removed, and each changed field with old and new value. */
export function changesCsv(diff: VersionDiff): string {
  const out: unknown[][] = [];
  for (const l of diff.added) out.push(["added", l.reference, l.title, "", "", l.price]);
  for (const l of diff.removed) out.push(["removed", l.reference, l.title, "", l.price, ""]);
  for (const r of diff.relisted) {
    out.push(["relisted", r.after.reference, r.after.title, "Reference", r.before.reference, r.after.reference]);
    for (const k of r.keys) if (k !== "reference") out.push(["relisted", r.after.reference, r.after.title, FIELD_LABEL[k] ?? k, r.before[k], r.after[k]]);
  }
  for (const c of diff.changed) {
    for (const k of c.keys) {
      out.push(["changed", c.after.reference, c.after.title, FIELD_LABEL[k] ?? k, c.before[k], c.after[k]]);
    }
  }
  return toCsv(["change", "reference", "title", "field", "old_value", "new_value"], out);
}

const LISTING_COLUMNS: (keyof Listing)[] = [
  "reference", "title", "purpose", "propertyType", "price", "rentPeriod", "currency", "beds", "baths", "area", "areaUnit",
  "city", "community", "subCommunity", "propertyName", "latitude", "longitude", "furnished", "completionStatus",
  "permitNumber", "lastUpdate",
];

/** Flat export of a version's listings (without raw XML). */
export function listingsCsv(listings: Listing[]): string {
  return toCsv(
    [...LISTING_COLUMNS.map((k) => FIELD_LABEL[k] ?? k), "Photos", "Agent", "Agent phone", "Agent email"],
    listings.map((l) => [
      ...LISTING_COLUMNS.map((k) => l[k]),
      l.images?.length ?? 0,
      l.agent?.name,
      l.agent?.phone,
      l.agent?.email,
    ]),
  );
}
