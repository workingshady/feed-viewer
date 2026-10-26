import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { it } from "vitest";
import { parseXmlString } from "@/lib/xmlParser";

/**
 * Parses real feed XML with the app's own parser and caches listings as JSON, so the matching
 * benchmarks run in seconds. Inputs come from env vars so no machine paths live in the repo:
 *   BENCH_XML_DIRS  ";"-separated directories of *.xml (each file = one agency feed)
 *   BENCH_XML_FILES ";"-separated label=path pairs (e.g. versions of one feed)
 *   BENCH_RUN_ROOT  scraper runs root (<spider>/<run>/enrich/output/*.xml): oldest and newest run per spider
 *   BENCH_CACHE     output directory
 */
const cache = process.env.BENCH_CACHE ?? "";

function dump(label: string, file: string) {
  const out = path.join(cache, `${label}.json`);
  if (existsSync(out)) return;
  const res = parseXmlString(readFileSync(file, "utf8"));
  writeFileSync(out, JSON.stringify({ agency: res.agencyInfo?.name ?? label, listings: res.listings.map((l) => ({ ...l, rawXml: "" })) }));
  console.log(label, res.listings.length);
}

it("dumps feeds", () => {
  if (!cache) return;
  mkdirSync(cache, { recursive: true });
  for (const pair of (process.env.BENCH_XML_FILES ?? "").split(";").filter(Boolean)) {
    const [label, file] = pair.split("=");
    dump(label, file);
  }
  for (const dir of (process.env.BENCH_XML_DIRS ?? "").split(";").filter(Boolean)) {
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".xml"))) dump(`agency__${f.replace(/\.xml$/, "")}`, path.join(dir, f));
  }
  const root = process.env.BENCH_RUN_ROOT;
  if (root) {
    for (const spider of readdirSync(root)) {
      if (/smoke|raw/.test(spider)) continue;
      const runs = readdirSync(path.join(root, spider))
        .sort()
        .map((r) => path.join(root, spider, r, "enrich", "output"))
        .filter((d) => existsSync(d) && readdirSync(d).some((f) => f.endsWith(".xml")));
      if (runs.length < 2) continue;
      const xml = (d: string) => path.join(d, readdirSync(d).find((f) => f.endsWith(".xml"))!);
      dump(`run__${spider}__old`, xml(runs[0]));
      dump(`run__${spider}__new`, xml(runs[runs.length - 1]));
    }
  }
});
