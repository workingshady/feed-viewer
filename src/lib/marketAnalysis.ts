import { annualizedPrice } from "@/lib/feedValidation";
import type { Listing } from "@/lib/types";

/** Market analytics on asking prices: price per sq ft, gross yield, freshness and concentration. */

const SQM_TO_SQFT = 10.7639;

/** Built area in square feet, or null when missing or implausible. */
export function areaSqft(l: Listing): number | null {
  if (!(l.area > 0)) return null;
  const unit = (l.areaUnit || "sqft").toLowerCase();
  const ft = /m/.test(unit.replace(/ft|feet/g, "")) ? l.area * SQM_TO_SQFT : l.area;
  return ft >= 150 && ft <= 200_000 ? ft : null;
}

export function quantile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

export type GroupStat = { name: string; n: number; median: number; p25: number; p75: number };

function groupStats(rows: { key: string; value: number }[], minN: number): GroupStat[] {
  const m = new Map<string, number[]>();
  for (const r of rows) {
    if (!r.key) continue;
    const arr = m.get(r.key);
    if (arr) arr.push(r.value);
    else m.set(r.key, [r.value]);
  }
  return [...m.entries()]
    .filter(([, v]) => v.length >= minN)
    .map(([name, v]) => {
      const s = v.sort((a, b) => a - b);
      return { name, n: s.length, median: quantile(s, 0.5), p25: quantile(s, 0.25), p75: quantile(s, 0.75) };
    })
    .sort((a, b) => b.median - a.median);
}

const isSale = (l: Listing) => l.purpose === "sale" && l.price > 0;
const isRent = (l: Listing) => l.purpose === "rent" && l.price > 0;
const bedsLabel = (b: number) => (b === 0 ? "Studio" : b >= 5 ? "5+ BR" : `${b} BR`);

/** Median sale asking price per sq ft, per group (only groups with at least `minN` listings). */
export function ppsfBy(listings: Listing[], key: (l: Listing) => string, minN = 5): GroupStat[] {
  const rows: { key: string; value: number }[] = [];
  for (const l of listings) {
    const ft = isSale(l) ? areaSqft(l) : null;
    if (ft) rows.push({ key: key(l), value: l.price / ft });
  }
  return groupStats(rows, minN);
}

export const ppsfByCommunity = (listings: Listing[], minN = 5) => ppsfBy(listings, (l) => l.community?.trim() ?? "", minN);
export const ppsfByBeds = (listings: Listing[], minN = 5) =>
  ppsfBy(listings, (l) => (Number.isFinite(l.beds) && l.beds >= 0 ? bedsLabel(l.beds) : ""), minN).sort((a, b) => bedOrder(a.name) - bedOrder(b.name));
const bedOrder = (label: string) => (label === "Studio" ? 0 : parseInt(label, 10) || 99);

export function completionGroup(l: Listing): "Off-plan" | "Ready" | "" {
  const s = (l.completionStatus ?? "").toLowerCase();
  if (/off|under|plan/.test(s)) return "Off-plan";
  if (/ready|complete|secondary/.test(s)) return "Ready";
  return "";
}

export type YieldStat = { community: string; yieldPct: number; saleN: number; rentN: number; segments: number };

/**
 * Gross asking yield per community: median annual rent ÷ median sale price, compared like for like
 * (same community, property type and bedrooms), then the median across those segments.
 * Asking prices, not transactions — a screening signal, not a valuation.
 */
export function grossYieldByCommunity(listings: Listing[], minN = 3): YieldStat[] {
  const seg = new Map<string, { community: string; sale: number[]; rent: number[] }>();
  for (const l of listings) {
    if (!l.community?.trim() || !Number.isFinite(l.beds)) continue;
    const sale = isSale(l);
    const rent = isRent(l);
    if (!sale && !rent) continue;
    const k = `${l.community.trim()}|${(l.propertyType || "").toLowerCase()}|${bedsLabel(l.beds)}`;
    const s = seg.get(k) ?? { community: l.community.trim(), sale: [], rent: [] };
    if (sale) s.sale.push(l.price);
    else s.rent.push(annualizedPrice(l));
    seg.set(k, s);
  }
  const byCommunity = new Map<string, { yields: number[]; saleN: number; rentN: number }>();
  for (const s of seg.values()) {
    if (s.sale.length < minN || s.rent.length < minN) continue;
    const y = (quantile(s.rent.sort((a, b) => a - b), 0.5) / quantile(s.sale.sort((a, b) => a - b), 0.5)) * 100;
    if (!(y > 0.5 && y < 25)) continue;
    const c = byCommunity.get(s.community) ?? { yields: [], saleN: 0, rentN: 0 };
    c.yields.push(y);
    c.saleN += s.sale.length;
    c.rentN += s.rent.length;
    byCommunity.set(s.community, c);
  }
  return [...byCommunity.entries()]
    .map(([community, c]) => ({ community, yieldPct: quantile(c.yields.sort((a, b) => a - b), 0.5), saleN: c.saleN, rentN: c.rentN, segments: c.yields.length }))
    .sort((a, b) => b.yieldPct - a.yieldPct);
}

const AGE_BUCKETS: [number, string][] = [
  [7, "≤ 7 days"],
  [30, "8–30 days"],
  [90, "1–3 months"],
  [180, "3–6 months"],
  [365, "6–12 months"],
  [Infinity, "> 1 year"],
];

/** Days since each listing's last update, bucketed. `now` is injectable for tests. */
export function freshness(listings: Listing[], now = Date.now()) {
  const counts = AGE_BUCKETS.map(([, label]) => ({ label, count: 0 }));
  const ages: number[] = [];
  let unknown = 0;
  for (const l of listings) {
    const t = Date.parse((l.lastUpdate ?? "").replace(" ", "T"));
    if (!Number.isFinite(t)) {
      unknown++;
      continue;
    }
    const days = Math.max(0, (now - t) / 864e5);
    ages.push(days);
    counts[AGE_BUCKETS.findIndex(([max]) => days <= max)].count++;
  }
  const sorted = ages.sort((a, b) => a - b);
  return { buckets: counts, unknown, medianDays: sorted.length ? quantile(sorted, 0.5) : null, stalePct: sorted.length ? (sorted.filter((d) => d > 180).length / sorted.length) * 100 : 0 };
}

export type Concentration = { groups: number; top1: { name: string; share: number } | null; top5Share: number; hhi: number; effective: number; level: "low" | "moderate" | "high" };

/**
 * Herfindahl–Hirschman index of listing shares (0–10,000). Below 1,500 is unconcentrated,
 * 1,500–2,500 moderately and above 2,500 highly concentrated (US DOJ / FTC thresholds).
 */
export function concentration(listings: Listing[], key: (l: Listing) => string): Concentration {
  const m = new Map<string, number>();
  for (const l of listings) {
    const k = key(l)?.trim();
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  const total = [...m.values()].reduce((a, b) => a + b, 0);
  const shares = [...m.entries()].map(([name, n]) => ({ name, share: total ? (n / total) * 100 : 0 })).sort((a, b) => b.share - a.share);
  const hhi = shares.reduce((s, x) => s + x.share * x.share, 0);
  return {
    groups: shares.length,
    top1: shares[0] ?? null,
    top5Share: shares.slice(0, 5).reduce((s, x) => s + x.share, 0),
    hhi,
    effective: hhi ? 10_000 / hhi : 0,
    level: hhi < 1500 ? "low" : hhi < 2500 ? "moderate" : "high",
  };
}
