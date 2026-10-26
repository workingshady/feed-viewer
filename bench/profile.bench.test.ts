import { readFileSync } from "node:fs";
import { it } from "vitest";
import { profileInsights, profileListings } from "@/lib/dataProfile";
import { profileXmlPaths } from "@/lib/xmlPathProfile";
import { parseXmlString } from "@/lib/xmlParser";

/** Sanity check of the field and XML profilers on one real feed.  BENCH_XML=<path to feed.xml> */
it("profiles a real feed", () => {
  const res = parseXmlString(readFileSync(process.env.BENCH_XML ?? "", "utf8"));
  const listings = res.listings;
  let t = Date.now();
  const p = profileListings(listings);
  console.log(`fields profiled in ${Date.now() - t} ms`, Object.fromEntries(Object.entries(p.scores).map(([k, v]) => [k, Math.round(v * 10) / 10])), "errors in", p.listingsWithErrors);
  for (const r of p.rules) console.log(`  [${r.severity}] ${r.dimension.padEnd(11)} ${String(r.count).padStart(5)}  ${r.title}  e.g. ${r.examples.slice(0, 2).map((e) => e.value).join(" | ")}`);
  for (const i of profileInsights(p)) console.log(`  * ${i.severity}: ${i.text}`);
  const f = (k: string) => p.fields.find((x) => x.key === k)!;
  console.log("reference patterns", f("reference").patterns.slice(0, 3), "permit patterns", f("permitNumber").patterns.slice(0, 3));
  console.log("price", f("price").numeric, "area", f("area").numeric);
  t = Date.now();
  const x = profileXmlPaths(listings);
  console.log(`xml paths profiled in ${Date.now() - t} ms: ${x.paths.length} paths, ${x.unusedWithData} with unused data, skipped ${x.skippedNoXml}`);
  for (const s of x.paths.filter((s) => s.warnings.length).slice(0, 25)) console.log(`  ${s.short.padEnd(34)} fill ${s.fillPct.toFixed(0).padStart(3)}%  used ${s.usedPct.toFixed(0).padStart(3)}%  ${s.type}  ×${s.maxRepeat}  ${s.warnings.join("; ")}`);
});
