import type { ImportListingDiff, Listing } from "@/lib/types";
import { UI_FIELDS } from "@/lib/types";
import { diffPlainText } from "@/lib/textLineDiff";
import type { UnifiedDiffLine } from "@/lib/textLineDiff";

/** Long text fields shown with unified line diff in import UI and listing detail. */
export const GIT_STYLE_TEXT_FIELDS: readonly (keyof Listing)[] = ["title", "description"] as const;

export type ImportFieldChangeRow = {
  key: keyof Listing;
  count: number;
  label: string;
};

/**
 * How often each UI field changed across listings marked `updated` in an import session.
 */
export function aggregateImportFieldChanges(
  listingDiffById: Record<string, ImportListingDiff>,
): ImportFieldChangeRow[] {
  const counts = new Map<string, number>();
  for (const d of Object.values(listingDiffById)) {
    if (d.status !== "updated") continue;
    for (const k of d.changedKeys) {
      counts.set(String(k), (counts.get(String(k)) ?? 0) + 1);
    }
  }
  const rows: ImportFieldChangeRow[] = [...counts.entries()].map(([key, count]) => ({
    key: key as keyof Listing,
    count,
    label: String(UI_FIELDS.find((f) => f.key === key)?.label ?? key),
  }));
  rows.sort((a, b) => b.count - a.count || String(a.key).localeCompare(String(b.key)));
  return rows;
}

function scalarForDiff(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  return String(v);
}

export type TextFieldDiffSample = {
  listingId: string;
  reference: string;
  field: keyof Listing;
  fieldLabel: string;
  lines: UnifiedDiffLine[];
  truncated: boolean;
  fallback: boolean;
};

/**
 * Build a few Git-style text diffs for title/description when baseline + current listings are available.
 */
export function buildTextFieldDiffSamples(
  baselineById: Map<string, Listing>,
  current: Listing[],
  opts?: { maxSamples?: number },
): TextFieldDiffSample[] {
  const maxSamples = opts?.maxSamples ?? 4;
  const out: TextFieldDiffSample[] = [];
  for (const cur of current) {
    if (out.length >= maxSamples) break;
    const prev = baselineById.get(cur.id);
    if (!prev) continue;
    for (const field of GIT_STYLE_TEXT_FIELDS) {
      if (out.length >= maxSamples) break;
      const a = scalarForDiff(prev[field]);
      const b = scalarForDiff(cur[field]);
      if (a === b) continue;
      const { lines, truncated, fallback } = diffPlainText(a, b);
      if (!lines.length) continue;
      out.push({
        listingId: cur.id,
        reference: cur.reference?.trim() || cur.id,
        field,
        fieldLabel: String(UI_FIELDS.find((f) => f.key === field)?.label ?? field),
        lines,
        truncated,
        fallback,
      });
    }
  }
  return out;
}

export function listingsIndexById(listings: Listing[]): Map<string, Listing> {
  const m = new Map<string, Listing>();
  for (const l of listings) {
    if (l.id) m.set(l.id, l);
  }
  return m;
}

export function isGitStyleTextField(key: keyof Listing): boolean {
  return GIT_STYLE_TEXT_FIELDS.includes(key as (typeof GIT_STYLE_TEXT_FIELDS)[number]);
}
