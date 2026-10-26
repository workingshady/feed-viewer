import { annualRent, inMarketBounds, marketOf, rentPeriodMisread } from "@/lib/markets";
import type { Listing } from "@/lib/types";
import { UI_FIELDS } from "@/lib/types";
import { isListingFieldFilled, LISTING_FIELD_QUALITY_KEYS } from "@/lib/listingFieldPresence";

/**
 * Field-level data profiling for a feed version, along the standard data-quality dimensions:
 *
 *   completeness  is the field filled?
 *   validity      does a filled value obey its format / range rules?
 *   uniqueness    are values that should identify a listing actually unique?
 *   consistency   do related fields agree with each other and with the rest of the feed?
 *
 * Plus a profile per field: distinct values, top values, value formats (patterns), numeric spread and
 * outliers, text length. Every rule result keeps example listings so the UI can drill down.
 */

export type Dimension = "completeness" | "validity" | "uniqueness" | "consistency";
export type Severity = "error" | "warning" | "info";

export type RuleResult = {
  id: string;
  dimension: Dimension;
  severity: Severity;
  field: keyof Listing | "agent.email" | "agent.phone" | "listing";
  title: string;
  /** What to do about it, in plain words. */
  hint: string;
  count: number;
  /** Up to 12 examples: listing reference + the offending value. */
  examples: { id: string; ref: string; value: string }[];
};

export type NumericStats = { min: number; p5: number; p25: number; median: number; p75: number; p95: number; max: number; mean: number; outliers: number };
export type ValueCount = { value: string; count: number };
export type PatternCount = { pattern: string; count: number; example: string };

export type FieldProfile = {
  key: keyof Listing;
  label: string;
  required: boolean;
  filled: number;
  fillPct: number;
  /** Share of filled values that pass this field's validity rules (100 when it has none). */
  validPct: number;
  invalid: number;
  distinct: number;
  /** Distinct / filled: 1 = every value unique, near 0 = a few repeated values. */
  uniqueness: number;
  top: ValueCount[];
  patterns: PatternCount[];
  numeric: NumericStats | null;
  length: { min: number; median: number; max: number } | null;
  /** Values that look like placeholders: "N/A", "-", "0", "test"… */
  placeholders: number;
  kind: "number" | "text" | "id" | "category" | "list" | "url" | "object";
};

export type QualityScores = Record<Dimension, number> & { overall: number };

export type DataProfile = {
  n: number;
  fields: FieldProfile[];
  rules: RuleResult[];
  scores: QualityScores;
  /** Listings with at least one error-severity issue. */
  listingsWithErrors: number;
};

/* ── helpers ─────────────────────────────────────────────────────────── */

const LABEL = Object.fromEntries(UI_FIELDS.map((f) => [f.key, f.label])) as Record<string, string>;
const REQUIRED = new Set(UI_FIELDS.filter((f) => f.required).map((f) => f.key));

const NUMERIC: ReadonlySet<keyof Listing> = new Set<keyof Listing>(["price", "downPaymentPrice", "serviceCharge", "beds", "baths", "area", "plotSize", "parking", "latitude", "longitude"]);
const ID_LIKE: ReadonlySet<keyof Listing> = new Set<keyof Listing>(["reference", "permitNumber"]);
const URL_LIKE: ReadonlySet<keyof Listing> = new Set<keyof Listing>(["view360", "videoTourUrl", "floorPlanUrl"]);
const LIST_LIKE: ReadonlySet<keyof Listing> = new Set<keyof Listing>(["images", "amenities"]);
const TEXT_LONG: ReadonlySet<keyof Listing> = new Set<keyof Listing>(["title", "description", "address"]);
/** Heavy-tailed money/size fields: outliers are judged on a log scale. */
const LOG_SCALE: ReadonlySet<keyof Listing> = new Set<keyof Listing>(["price", "area", "plotSize", "serviceCharge", "downPaymentPrice"]);

const PLACEHOLDER = /^(n\/?a|na|null|none|nil|-+|\.+|0+|tbd|tba|test|xxx+|unknown|not available|undefined|\?+)$/i;

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Tukey fences (1.5 × IQR), on log values for heavy-tailed fields. */
function tukey(values: number[], log: boolean): { lo: number; hi: number } {
  const v = (log ? values.filter((x) => x > 0).map(Math.log) : values).sort((a, b) => a - b);
  if (v.length < 8) return { lo: -Infinity, hi: Infinity };
  const q1 = quantile(v, 0.25);
  const q3 = quantile(v, 0.75);
  const iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr;
  const hi = q3 + 1.5 * iqr;
  return log ? { lo: Math.exp(lo), hi: Math.exp(hi) } : { lo, hi };
}

function numericStats(values: number[], log: boolean): NumericStats | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const f = tukey(values, log);
  return {
    min: s[0],
    p5: quantile(s, 0.05),
    p25: quantile(s, 0.25),
    median: quantile(s, 0.5),
    p75: quantile(s, 0.75),
    p95: quantile(s, 0.95),
    max: s[s.length - 1],
    mean: s.reduce((n, x) => n + x, 0) / s.length,
    outliers: values.filter((x) => x < f.lo || x > f.hi).length,
  };
}

/**
 * Value "shape": letters → A, digits → 9, runs collapsed with a count (AAA-999 → A3-9 3 style kept
 * readable as "AA-999999"), other characters kept. Shows whether a field follows one format.
 */
export function valuePattern(v: string): string {
  const s = v.trim().slice(0, 40);
  let out = "";
  for (const ch of s) {
    if (/[A-Za-z]/.test(ch)) out += "A";
    else if (/[0-9]/.test(ch)) out += "9";
    else if (/\s/.test(ch)) out += " ";
    else out += ch;
  }
  // Collapse long runs so 12-digit and 13-digit numbers read as one family only when lengths match.
  return out.replace(/A{6,}/g, (m) => `A{${m.length}}`).replace(/9{6,}/g, (m) => `9{${m.length}}`);
}

function stringValue(l: Listing, key: keyof Listing): string | null {
  const v = l[key] as unknown;
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : null;
  if (typeof v === "string") return v.trim() || null;
  if (Array.isArray(v)) return v.length ? String(v.length) : null;
  if (key === "agent") {
    const a = v as Listing["agent"];
    return (a.name || a.email || a.phone || "").trim() || null;
  }
  return JSON.stringify(v);
}

const ref = (l: Listing) => l.reference || l.id;

/* ── rules ───────────────────────────────────────────────────────────── */

type Rule = {
  id: string;
  dimension: Dimension;
  severity: Severity;
  field: RuleResult["field"];
  title: string;
  hint: string;
  /** Returns the offending value as a string when the listing fails, otherwise null. */
  test: (l: Listing, ctx: Ctx) => string | null;
};

type Ctx = {
  ppsfFences: Map<string, { lo: number; hi: number }>;
  refCounts: Map<string, number>;
  contentCounts: Map<string, number>;
  currencies: Map<string, number>;
  mainCurrency: string;
  thisYear: number;
};

const fmt = (n: number) => (Math.abs(n) >= 1000 ? Math.round(n).toLocaleString() : String(Math.round(n * 100) / 100));
const isUrl = (u: string) => /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(u.trim());
const ppsfKey = (l: Listing) => `${(l.currency || "").toUpperCase()}|${l.purpose}|${(l.propertyType || "").toLowerCase()}`;
const contentKey = (l: Listing) => `${(l.title || "").trim().toLowerCase()}|${l.price}|${(l.community || "").toLowerCase()}|${l.beds}|${Math.round(l.area || 0)}`;

const RULES: Rule[] = [
  // Validity
  {
    id: "price_missing",
    dimension: "validity",
    severity: "error",
    field: "price",
    title: "No price and not marked price-on-application",
    hint: "Set a numeric price, or price_on_application = Yes.",
    test: (l) => (!(l.price > 0) && !/^(yes|true|1)$/i.test((l.priceOnApplication || "").trim()) ? String(l.price ?? "") || "empty" : null),
  },
  {
    id: "price_implausible",
    dimension: "validity",
    severity: "warning",
    field: "price",
    title: "Price outside a plausible range",
    hint: "Checked against the listing's market (e.g. UAE sales AED 50K–500M, Singapore rents S$500+ a month). Usually a typo, extra zeros or the wrong unit.",
    test: (l) => {
      if (!(l.price > 0)) return null;
      const m = marketOf(l);
      if (l.purpose === "sale" && (l.price < m.minPrice.sale / 2 || l.price > m.maxPrice.sale)) return `${m.currency} ${fmt(l.price)}`;
      if (l.purpose === "rent") {
        const y = annualRent(l);
        if (y < m.minPrice.yearlyRent / 2 || y > m.maxPrice.yearlyRent) return `${m.currency} ${fmt(l.price)}${l.rentPeriod ? ` ${l.rentPeriod}` : ""}`;
      }
      return null;
    },
  },
  {
    id: "rent_period_misread",
    dimension: "validity",
    severity: "error",
    field: "price",
    title: "Monthly-market rent without a period (imported as yearly)",
    hint: "Singapore, Malaysia and Pakistan quote rents per month. Without <price><monthly>, Ziba reads the amount as yearly and shows the rent 12× too cheap.",
    test: (l) => (rentPeriodMisread(l) ? `${l.currency} ${fmt(l.price)} (no period, ${marketOf(l).code})` : null),
  },
  {
    id: "area_implausible",
    dimension: "validity",
    severity: "warning",
    field: "area",
    title: "Size outside a plausible range",
    hint: "Under 100 sqft or over 100,000 sqft (non-land) is usually a unit mix-up (sqm vs sqft) or a typo.",
    test: (l) => (l.area > 0 && (l.area < 100 || (l.area > 100_000 && !/land|plot/i.test(l.propertyType))) ? fmt(l.area) : null),
  },
  {
    id: "beds_implausible",
    dimension: "validity",
    severity: "warning",
    field: "beds",
    title: "Unusual bedroom count",
    hint: "More than 15 bedrooms is rare; check the feed value.",
    test: (l) => (l.beds > 15 ? String(l.beds) : null),
  },
  {
    id: "coords_outside_market",
    dimension: "validity",
    severity: "error",
    field: "latitude",
    title: "Map point outside the listing's country (or swapped)",
    hint: "Checked against the listing's market box (UAE, Singapore, Malaysia or Pakistan). Ziba re-geocodes these from the address; swapped values put the pin in the wrong country.",
    test: (l) => {
      if (l.latitude == null || l.longitude == null) return null;
      const lat = Number(l.latitude);
      const lng = Number(l.longitude);
      if (lat === 0 && lng === 0) return "0, 0";
      const m = marketOf(l);
      return inMarketBounds(m, lat, lng) ? null : `${lat}, ${lng} (${m.code})`;
    },
  },
  {
    id: "agent_email_invalid",
    dimension: "validity",
    severity: "warning",
    field: "agent.email",
    title: "Agent email is not a valid address",
    hint: "Fix the agent's email in the CRM so enquiries reach them.",
    test: (l) => {
      const e = (l.agent?.email || "").trim();
      return e && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(e) ? e : null;
    },
  },
  {
    id: "agent_phone_invalid",
    dimension: "validity",
    severity: "warning",
    field: "agent.phone",
    title: "Agent phone has too few or too many digits",
    hint: "International numbers have 9–15 digits including the country code (+971 UAE, +65 Singapore, +60 Malaysia, +92 Pakistan).",
    test: (l) => {
      const p = (l.agent?.phone || "").trim();
      const d = p.replace(/\D+/g, "");
      return p && (d.length < 9 || d.length > 15) ? p : null;
    },
  },
  {
    id: "image_url_invalid",
    dimension: "validity",
    severity: "error",
    field: "images",
    title: "Photo link is not a web address",
    hint: "Every photo must be a full http(s) URL the portal can download.",
    test: (l) => l.images?.find((u) => !isUrl(u)) ?? null,
  },
  {
    id: "media_url_invalid",
    dimension: "validity",
    severity: "warning",
    field: "videoTourUrl",
    title: "Video, 360° or floor-plan link is not a web address",
    hint: "Use full http(s) links.",
    test: (l) => [l.videoTourUrl, l.view360, l.floorPlanUrl].find((u) => u && u.trim() && !isUrl(u)) ?? null,
  },
  {
    id: "permit_format",
    dimension: "validity",
    severity: "warning",
    field: "permitNumber",
    title: "Permit number is not numeric",
    hint: "UAE permits (Trakheesi / DLD) are digits only; letters usually mean a reference was pasted instead. Other markets don't use these permits.",
    test: (l) => {
      if (!marketOf(l).permitsRequired) return null;
      const p = (l.permitNumber || "").trim();
      return p && !/^\d{5,15}$/.test(p.replace(/[\s-]/g, "")) ? p : null;
    },
  },
  {
    id: "build_year",
    dimension: "validity",
    severity: "warning",
    field: "buildYear",
    title: "Build year is not a plausible year",
    hint: "Expect a 4-digit year between 1950 and five years ahead.",
    test: (l, c) => {
      const y = (l.buildYear || "").trim();
      if (!y) return null;
      const n = Number(y);
      return !Number.isInteger(n) || n < 1950 || n > c.thisYear + 5 ? y : null;
    },
  },
  {
    id: "last_update",
    dimension: "validity",
    severity: "info",
    field: "lastUpdate",
    title: "Last-update date unreadable or in the future",
    hint: "Use YYYY-MM-DD HH:MM:SS.",
    test: (l) => {
      const v = (l.lastUpdate || "").trim();
      if (!v) return null;
      const t = Date.parse(v.replace(" ", "T"));
      return Number.isNaN(t) || t > Date.now() + 2 * 86_400_000 ? v : null;
    },
  },
  {
    id: "placeholder",
    dimension: "validity",
    severity: "warning",
    field: "listing",
    title: "Placeholder text instead of a value",
    hint: '"N/A", "-", "0", "test" and similar are counted as filled but carry no information.',
    test: (l) => {
      for (const k of ["community", "city", "propertyName", "developer", "furnished", "completionStatus", "title"] as (keyof Listing)[]) {
        const v = String(l[k] ?? "").trim();
        if (v && PLACEHOLDER.test(v)) return `${LABEL[k] ?? k}: "${v}"`;
      }
      return null;
    },
  },
  {
    id: "title_caps",
    dimension: "validity",
    severity: "info",
    field: "title",
    title: "Title in ALL CAPS",
    hint: "Portals often down-rank all-caps titles.",
    test: (l) => {
      const t = (l.title || "").trim();
      const letters = t.replace(/[^A-Za-z]/g, "");
      return letters.length >= 12 && letters === letters.toUpperCase() ? t.slice(0, 80) : null;
    },
  },
  {
    id: "description_short",
    dimension: "validity",
    severity: "info",
    field: "description",
    title: "Description shorter than 100 characters",
    hint: "Short copy converts poorly and gives buyers little to go on.",
    test: (l) => {
      const d = (l.description || "").trim();
      return d && d.length < 100 ? `${d.length} chars` : null;
    },
  },
  {
    id: "description_html",
    dimension: "validity",
    severity: "info",
    field: "description",
    title: "Description contains HTML tags or entities",
    hint: "Raw <br>, &amp; and similar show up as text on some portals.",
    test: (l) => {
      const d = l.description || "";
      const m = d.match(/<\/?[a-z][^>]*>|&[a-z]+;|&#\d+;/i);
      return m ? m[0] : null;
    },
  },
  // Uniqueness
  {
    id: "duplicate_reference",
    dimension: "uniqueness",
    severity: "error",
    field: "reference",
    title: "Reference used by more than one listing",
    hint: "References must be unique; duplicates overwrite each other on import.",
    test: (l, c) => {
      const r = (l.reference || "").trim().toLowerCase();
      return r && (c.refCounts.get(r) ?? 0) > 1 ? l.reference : null;
    },
  },
  {
    id: "duplicate_content",
    dimension: "uniqueness",
    severity: "warning",
    field: "listing",
    title: "Same title, price, community, beds and size as another listing",
    hint: "Likely posted twice under different references.",
    test: (l, c) => ((l.title || "").trim().length > 5 && (c.contentCounts.get(contentKey(l)) ?? 0) > 1 ? (l.title || "").slice(0, 60) : null),
  },
  {
    id: "duplicate_images",
    dimension: "uniqueness",
    severity: "info",
    field: "images",
    title: "Same photo repeated within a listing",
    hint: "Repeated photos pad the gallery; portals may reject them.",
    test: (l) => {
      const imgs = (l.images ?? []).map((u) => u.split("?")[0]);
      return new Set(imgs).size < imgs.length ? `${imgs.length - new Set(imgs).size} repeated` : null;
    },
  },
  // Consistency
  {
    id: "ppsf_outlier",
    dimension: "consistency",
    severity: "warning",
    field: "price",
    title: "Price per sqft far from similar listings",
    hint: "Compared within the same purpose and property type (Tukey fences on a log scale). Often a wrong price, size or period.",
    test: (l, c) => {
      if (!(l.price > 0 && l.area > 0)) return null;
      const f = c.ppsfFences.get(ppsfKey(l));
      if (!f) return null;
      const v = l.price / l.area;
      return v < f.lo || v > f.hi ? `${fmt(v)}/sqft` : null;
    },
  },
  {
    id: "baths_vs_beds",
    dimension: "consistency",
    severity: "info",
    field: "baths",
    title: "Far more bathrooms than bedrooms",
    hint: "More than beds + 3 bathrooms usually means beds and baths were swapped or mistyped.",
    test: (l) => (l.beds > 0 && l.baths > l.beds + 3 ? `${l.beds} beds / ${l.baths} baths` : null),
  },
  {
    id: "plot_smaller_than_area",
    dimension: "consistency",
    severity: "info",
    field: "plotSize",
    title: "Villa plot smaller than its built-up area",
    hint: "For villas and townhouses the plot is normally larger than the built-up area; values may be swapped.",
    test: (l) => (/villa|town/i.test(l.propertyType) && l.plotSize > 0 && l.area > 0 && l.plotSize < l.area * 0.5 ? `plot ${fmt(l.plotSize)} < area ${fmt(l.area)}` : null),
  },
  {
    id: "currency_mixed",
    dimension: "consistency",
    severity: "warning",
    field: "currency",
    title: "Different currency from the rest of the feed",
    hint: "One feed normally uses one currency; mixed currencies break price comparisons.",
    test: (l, c) => {
      const cur = (l.currency || "").trim().toUpperCase();
      return cur && c.mainCurrency && cur !== c.mainCurrency ? cur : null;
    },
  },
  {
    id: "unknown_purpose",
    dimension: "consistency",
    severity: "error",
    field: "purpose",
    title: "Sale or rent not recognised",
    hint: "offering_type should be RS, RR, CS or CR.",
    test: (l) => (l.purpose !== "sale" && l.purpose !== "rent" ? String(l.purpose || "empty") : null),
  },
];

/* ── profile ─────────────────────────────────────────────────────────── */

export function profileListings(listings: Listing[]): DataProfile {
  const n = listings.length;

  // Context for cross-listing rules.
  const ppsfByKey = new Map<string, number[]>();
  const refCounts = new Map<string, number>();
  const contentCounts = new Map<string, number>();
  const currencies = new Map<string, number>();
  for (const l of listings) {
    if (l.price > 0 && l.area > 0) {
      const k = ppsfKey(l);
      const arr = ppsfByKey.get(k);
      if (arr) arr.push(l.price / l.area);
      else ppsfByKey.set(k, [l.price / l.area]);
    }
    const r = (l.reference || "").trim().toLowerCase();
    if (r) refCounts.set(r, (refCounts.get(r) ?? 0) + 1);
    if ((l.title || "").trim().length > 5) contentCounts.set(contentKey(l), (contentCounts.get(contentKey(l)) ?? 0) + 1);
    const cur = (l.currency || "").trim().toUpperCase();
    if (cur) currencies.set(cur, (currencies.get(cur) ?? 0) + 1);
  }
  const ppsfFences = new Map<string, { lo: number; hi: number }>();
  for (const [k, v] of ppsfByKey) if (v.length >= 20) ppsfFences.set(k, tukey(v, true));
  const mainCurrency = [...currencies.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  const ctx: Ctx = { ppsfFences, refCounts, contentCounts, currencies, mainCurrency, thisYear: new Date().getFullYear() };

  // Rules.
  const errorListings = new Set<Listing>();
  const failingByDimension: Record<Dimension, Set<Listing>> = { completeness: new Set(), validity: new Set(), uniqueness: new Set(), consistency: new Set() };
  const invalidByField = new Map<string, number>();
  const rules: RuleResult[] = RULES.map((r) => {
    let count = 0;
    const examples: { id: string; ref: string; value: string }[] = [];
    for (const l of listings) {
      const bad = r.test(l, ctx);
      if (bad == null) continue;
      count++;
      failingByDimension[r.dimension].add(l);
      if (r.severity === "error") errorListings.add(l);
      if (examples.length < 12) examples.push({ id: l.id, ref: ref(l), value: bad });
    }
    if (count && r.dimension === "validity") invalidByField.set(String(r.field), (invalidByField.get(String(r.field)) ?? 0) + count);
    return { id: r.id, dimension: r.dimension, severity: r.severity, field: r.field, title: r.title, hint: r.hint, count, examples };
  }).filter((r) => r.count > 0);

  // Field profiles.
  const fields: FieldProfile[] = LISTING_FIELD_QUALITY_KEYS.map((key) => {
    let filled = 0;
    let placeholders = 0;
    const counts = new Map<string, number>();
    const patterns = new Map<string, { count: number; example: string }>();
    const nums: number[] = [];
    const lens: number[] = [];
    for (const l of listings) {
      if (!isListingFieldFilled(l, key)) continue;
      filled++;
      const v = stringValue(l, key);
      if (v == null) continue;
      if (PLACEHOLDER.test(v) && !NUMERIC.has(key)) placeholders++;
      counts.set(v, (counts.get(v) ?? 0) + 1);
      if (NUMERIC.has(key)) {
        const x = Number(l[key]);
        if (Number.isFinite(x)) nums.push(x);
      } else if (!LIST_LIKE.has(key) && key !== "agent") {
        lens.push(v.length);
        if (!TEXT_LONG.has(key)) {
          const p = valuePattern(v);
          const e = patterns.get(p);
          if (e) e.count++;
          else patterns.set(p, { count: 1, example: v.slice(0, 60) });
        }
      }
    }
    const sortedLens = [...lens].sort((a, b) => a - b);
    const kind: FieldProfile["kind"] = NUMERIC.has(key)
      ? "number"
      : ID_LIKE.has(key)
        ? "id"
        : URL_LIKE.has(key)
          ? "url"
          : LIST_LIKE.has(key)
            ? "list"
            : key === "agent"
              ? "object"
              : TEXT_LONG.has(key)
                ? "text"
                : "category";
    const invalid = invalidByField.get(String(key)) ?? 0;
    return {
      key,
      label: LABEL[key] ?? String(key),
      required: REQUIRED.has(key),
      filled,
      fillPct: n ? (filled / n) * 100 : 0,
      validPct: filled ? Math.max(0, (1 - invalid / filled) * 100) : 100,
      invalid,
      distinct: counts.size,
      uniqueness: filled ? counts.size / filled : 0,
      top: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([value, count]) => ({ value, count })),
      patterns: [...patterns.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 8).map(([pattern, e]) => ({ pattern, count: e.count, example: e.example })),
      numeric: NUMERIC.has(key) ? numericStats(nums, LOG_SCALE.has(key)) : null,
      length: sortedLens.length ? { min: sortedLens[0], median: quantile(sortedLens, 0.5), max: sortedLens[sortedLens.length - 1] } : null,
      placeholders,
      kind,
    };
  });

  // Scores (0–100). Completeness weights required fields double.
  let wSum = 0;
  let wFill = 0;
  for (const f of fields) {
    const w = f.required ? 2 : 1;
    wSum += w;
    wFill += w * f.fillPct;
  }
  const share = (set: Set<Listing>) => (n ? (1 - set.size / n) * 100 : 100);
  const scores = {
    completeness: wSum ? wFill / wSum : 0,
    validity: share(failingByDimension.validity),
    uniqueness: share(failingByDimension.uniqueness),
    consistency: share(failingByDimension.consistency),
  };
  const overall = scores.completeness * 0.4 + scores.validity * 0.3 + scores.consistency * 0.2 + scores.uniqueness * 0.1;

  return { n, fields, rules: rules.sort((a, b) => sevRank(a.severity) - sevRank(b.severity) || b.count - a.count), scores: { ...scores, overall }, listingsWithErrors: errorListings.size };
}

const sevRank = (s: Severity) => (s === "error" ? 0 : s === "warning" ? 1 : 2);

/* ── insights ────────────────────────────────────────────────────────── */

export type Insight = { severity: Severity; text: string; /** Where to look: a tab id the page understands. */ go?: "fields" | "issues" | "xml" | "patterns" | "segments"; field?: keyof Listing };

/** The few findings that matter most, written as sentences, worst first. */
export function profileInsights(p: DataProfile): Insight[] {
  const out: Insight[] = [];
  const pct = (x: number) => `${Math.round(x)}%`;
  const missingRequired = p.fields.filter((f) => f.required && f.fillPct < 99).sort((a, b) => a.fillPct - b.fillPct);
  for (const f of missingRequired.slice(0, 3)) {
    out.push({ severity: f.fillPct < 90 ? "error" : "warning", text: `Required field ${f.label} is empty in ${(p.n - f.filled).toLocaleString()} listings (${pct(100 - f.fillPct)}).`, go: "fields", field: f.key });
  }
  for (const r of p.rules.filter((r) => r.severity === "error").slice(0, 3)) {
    out.push({ severity: "error", text: `${r.title}: ${r.count.toLocaleString()} listing${r.count === 1 ? "" : "s"} (${pct((r.count / p.n) * 100)}).`, go: "issues" });
  }
  for (const r of p.rules.filter((r) => r.severity === "warning").slice(0, 3)) {
    out.push({ severity: "warning", text: `${r.title}: ${r.count.toLocaleString()} listing${r.count === 1 ? "" : "s"}.`, go: "issues" });
  }
  // Formats: an ID-like field split across several shapes.
  for (const f of p.fields.filter((f) => (f.kind === "id" || f.key === "buildYear") && f.patterns.length > 1)) {
    const main = f.patterns[0];
    const other = f.filled - main.count;
    if (other / Math.max(1, f.filled) > 0.02) {
      out.push({ severity: "info", text: `${f.label} uses ${f.patterns.length} formats; ${other.toLocaleString()} values don't follow the main one (${main.pattern}).`, go: "patterns", field: f.key });
    }
  }
  const outlierFields = p.fields.filter((f) => f.numeric && f.numeric.outliers > 0 && (f.key === "price" || f.key === "area")).sort((a, b) => b.numeric!.outliers - a.numeric!.outliers);
  for (const f of outlierFields) out.push({ severity: "info", text: `${f.numeric!.outliers.toLocaleString()} ${f.label.toLowerCase()} values are statistical outliers for this feed.`, go: "fields", field: f.key });
  const strong = p.fields.filter((f) => !f.required && f.fillPct < 20 && f.fillPct > 0).length;
  if (strong) out.push({ severity: "info", text: `${strong} optional fields are filled in under 20% of listings; filling them improves portal ranking.`, go: "fields" });
  if (!out.length) out.push({ severity: "info", text: "No significant issues: required fields are filled and values pass their checks." });
  return out;
}

export const DIMENSION_INFO: Record<Dimension, { label: string; description: string }> = {
  completeness: { label: "Completeness", description: "How much of each field is filled (required fields count double)." },
  validity: { label: "Validity", description: "Share of listings whose values pass format and range checks." },
  uniqueness: { label: "Uniqueness", description: "Share of listings that are not duplicates (reference or content)." },
  consistency: { label: "Consistency", description: "Share of listings whose fields agree with each other and with similar listings." },
};
