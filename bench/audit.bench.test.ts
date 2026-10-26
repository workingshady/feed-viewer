import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { it } from "vitest";
import { clusterSameProperty } from "@/lib/propertyMatch";
import type { Listing } from "@/lib/types";

/**
 * Manual precision audit: prints a random sample of cross-agency matches that do NOT share a permit
 * (the "likely" tier), so a person can judge them, plus the cluster size distribution (large
 * clusters would mean chaining different units together).
 *   BENCH_AUDIT_AGENCIES  comma-separated agency file stems (default: all)
 */
const cache = process.env.BENCH_CACHE ?? "";
const pick = (process.env.BENCH_AUDIT_AGENCIES ?? "").split(",").filter(Boolean);

it("audits likely matches", () => {
  const files = readdirSync(cache).filter((f) => f.startsWith("agency__") && (!pick.length || pick.includes(f.slice(8, -5))));
  const groups = files.map((f) => ({ group: f.slice(8, -5), listings: JSON.parse(readFileSync(path.join(cache, f), "utf8")).listings as Listing[] }));
  const { clusters } = clusterSameProperty(groups, { crossGroupOnly: true });
  const sizes: Record<string, number> = {};
  for (const c of clusters) sizes[c.items.length > 5 ? "6+" : c.items.length] = (sizes[c.items.length > 5 ? "6+" : c.items.length] ?? 0) + 1;
  const likely = clusters.filter((c) => !c.links.some((l) => l.evidence.some((e) => e.signal === "permit" && e.weight > 0)));
  console.log("cluster sizes", sizes, "likely (no shared permit):", likely.length, "of", clusters.length);
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const sample = [...likely].sort(() => rand() - 0.5).slice(0, 20);
  const fmt = (l: Listing) =>
    `${l.purpose} ${l.propertyType} ${l.beds}bd ${l.baths}ba ${Math.round(l.area)}sqft fl:${l.floor || "-"} ${l.price} | ${l.propertyName} / ${l.community} | permit ${l.permitNumber || "-"} | ${l.title.slice(0, 50)}`;
  for (const c of sample) {
    console.log(`\n[${c.confidence}] ${c.links[0].evidence.map((e) => `${e.signal}${e.weight > 0 ? "+" : ""}${e.weight}`).join(" ")}`);
    for (const it of c.items) console.log(`  ${it.group.padEnd(20)} ${fmt(it.listing)}`);
  }
});
