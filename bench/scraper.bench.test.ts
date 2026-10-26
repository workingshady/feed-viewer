import { readFileSync } from "node:fs";
import path from "node:path";
import { it } from "vitest";
import { CATEGORY_LABEL } from "@/lib/listingChanges";
import { diffListings, priceChanges } from "@/lib/versionDiff";
import type { Listing } from "@/lib/types";

/**
 * Side by side with the scraper's own diff report (reference-only matching, every field difference
 * counted): where do the numbers differ, and why.
 *   BENCH_SCRAPER_REPORT  path to reports/diff_report.json of the newer run
 */
const cache = process.env.BENCH_CACHE ?? "";
const load = (n: string): Listing[] => JSON.parse(readFileSync(path.join(cache, `${n}.json`), "utf8")).listings;

it("compares with the scraper report", () => {
  const report = JSON.parse(readFileSync(process.env.BENCH_SCRAPER_REPORT ?? "", "utf8"));
  const t = report.totals;
  const d = diffListings(load("bh_a"), load("bh_b"));
  const prices = priceChanges(d);
  console.log("\n                 scraper   app (new)");
  console.log(`new              ${String(t.new).padStart(7)}   ${d.added.length}`);
  console.log(`removed          ${String(t.removed).padStart(7)}   ${d.removed.length}`);
  console.log(`changed          ${String(t.changed).padStart(7)}   ${d.changed.length}   (+${d.completenessOnly.length} only filled/emptied, not counted)`);
  console.log(`price changes    ${String(t.price_changed).padStart(7)}   ${prices.length}`);
  console.log(`relisted               -   ${d.relisted.length}   (same property, new reference)`);
  console.log(`to review              -   ${d.possibleRelists.length}`);
  console.log(`unchanged        ${String(t.unchanged).padStart(7)}   ${d.unchangedCount}`);

  const cat = new Map<string, number>();
  for (const c of d.changed) for (const k of new Set(c.changes.material.map((m) => m.category))) cat.set(k, (cat.get(k) ?? 0) + 1);
  console.log("\nchanged by area:", [...cat.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${CATEGORY_LABEL[k as keyof typeof CATEGORY_LABEL]} ${n}`).join(" · "));
  const minorOnly = d.changed.filter((c) => c.changes.material.every((m) => m.minor)).length;
  console.log(`changed with only minor edits (wording tweak, agent phone, small pin move): ${minorOnly}`);

  // Scraper "changed" listings we do not count, and why.
  const ours = new Set(d.changed.map((c) => c.after.reference.toLowerCase()));
  const gap = new Set(d.completenessOnly.map((c) => c.after.reference.toLowerCase()));
  const why = new Map<string, number>();
  for (const c of report.listings.changed as { reference_number: string; changed_fields: Record<string, unknown> }[]) {
    const r = c.reference_number.toLowerCase();
    if (ours.has(r)) continue;
    const key = gap.has(r) ? "value only filled/emptied" : `formatting only: ${Object.keys(c.changed_fields).join(",")}`;
    why.set(key, (why.get(key) ?? 0) + 1);
  }
  console.log("\nscraper 'changed' not counted by the app:", [...why.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8));
  for (const r of d.relisted.slice(0, 6)) console.log("  relisted", r.before.reference, "→", r.after.reference, r.score, r.signals.slice(0, 4).join(" · "));
});
