import { appendFileSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { it } from "vitest";
import { candidatePairs, prepareListings, scorePair, type MatchContext, type Prepared } from "@/lib/propertyMatch";
import { MATCH_WEIGHTS } from "@/lib/propertyMatchWeights";
import type { Listing } from "@/lib/types";

/**
 * Picks the match / possible thresholds by replaying the real jobs with permits hidden and grading
 * the result against them:
 *
 *   versions  For each agency's oldest vs newest feed, the listings that disappeared and the ones that
 *             appeared (by reference) are matched one-to-one, exactly as the version diff does.
 *   agencies  Every cross-agency candidate pair across 55 agencies is scored.
 *
 * A predicted pair where both listings have permits is graded: same permit = correct, different =
 * wrong (a lower bound — a re-permitted unit counts as wrong). Recall = share of same-permit pairs
 * found. `match` is the lowest threshold with precision ≥ 95% (versions) / 90% (agencies);
 * `possible` the lowest with precision ≥ 60%.
 *
 * BENCH_WRITE=1 writes the thresholds into src/lib/propertyMatchWeights.ts (weights unchanged).
 */
const cache = process.env.BENCH_CACHE ?? "";
const progress = (msg: string) => process.env.BENCH_PROGRESS && appendFileSync(process.env.BENCH_PROGRESS, `${new Date().toISOString().slice(11, 19)} ${msg}\n`);
const load = (f: string): Listing[] => JSON.parse(readFileSync(path.join(cache, f), "utf8")).listings;
const refKey = (l: Listing) => (l.reference || "").toLowerCase().replace(/[\s_-]+/g, "");

type Scored = { s: number; i: number; j: number; label: boolean | null };
type Task = { scored: Scored[]; positives: number; oneToOne: boolean };

/** Scores candidate pairs with permits hidden; labels come from the real permits. */
function scoreTask(groups: { group: string; listings: Listing[] }[], ctx: MatchContext, oneToOne: boolean): Task {
  const items = prepareListings(groups);
  const hidden: Prepared[] = items.map((p) => ({ ...p, permit: "" }));
  const scored: Scored[] = [];
  for (const [i, j] of candidatePairs(hidden, (a, b) => a.group !== b.group)) {
    const s = scorePair(hidden[i], hidden[j], ctx).score;
    const a = items[i].permit;
    const b = items[j].permit;
    scored.push({ s, i, j, label: a && b ? a === b : null });
  }
  // Every same-permit cross pair is a positive, whether or not blocking proposed it.
  const byPermit = new Map<string, Prepared[]>();
  for (const p of items) if (p.permit) byPermit.set(p.permit, [...(byPermit.get(p.permit) ?? []), p]);
  let positives = 0;
  for (const g of byPermit.values()) for (let x = 0; x < g.length; x++) for (let y = x + 1; y < g.length; y++) if (g[x].group !== g[y].group) positives++;
  return { scored, positives, oneToOne };
}

function evaluate(tasks: Task[], t: number) {
  let tp = 0;
  let fp = 0;
  let pos = 0;
  for (const task of tasks) {
    pos += task.positives;
    const above = task.scored.filter((x) => x.s >= t).sort((a, b) => b.s - a.s);
    const used = new Set<number>();
    for (const x of above) {
      if (task.oneToOne) {
        if (used.has(x.i) || used.has(x.j)) continue;
        used.add(x.i);
        used.add(x.j);
      }
      if (x.label === true) tp++;
      else if (x.label === false) fp++;
    }
  }
  return { precision: tp / Math.max(1, tp + fp), recall: tp / Math.max(1, pos), tp, fp };
}

function pick(name: string, tasks: Task[], target: number) {
  const grid = Array.from({ length: 41 }, (_, k) => k / 2);
  const rows = grid.map((t) => ({ t, ...evaluate(tasks, t) }));
  console.log(`\n${name}`);
  for (const r of rows.filter((r) => r.t % 2 === 0)) {
    console.log(`  t=${String(r.t).padStart(4)}  precision ${(r.precision * 100).toFixed(1).padStart(5)}%  recall ${(r.recall * 100).toFixed(1).padStart(5)}%  (tp ${r.tp}, fp ${r.fp})`);
  }
  const ok = (p: number) => rows.find((r) => r.precision >= p && r.tp >= 10)?.t ?? 20;
  const match = ok(target);
  const possible = Math.min(match - 0.5, ok(0.6));
  const m = rows.find((r) => r.t === match)!;
  const p = rows.find((r) => r.t === possible)!;
  const line = `${name}: match >= ${match} (precision ${(m.precision * 100).toFixed(1)}%, recall ${(m.recall * 100).toFixed(1)}%) | possible >= ${possible} (precision ${(p.precision * 100).toFixed(1)}%, recall ${(p.recall * 100).toFixed(1)}%)`;
  console.log("  " + line);
  progress(line);
  return { match, possible };
}

it("picks thresholds on the real tasks", () => {
  const files = readdirSync(cache);
  const versionTasks: Task[] = [];
  const spiders = [...new Set(files.filter((f) => f.startsWith("run__")).map((f) => f.split("__")[1]))];
  const pairs: [string, string][] = spiders.map((s) => [`run__${s}__old.json`, `run__${s}__new.json`]);
  pairs.push(["bh_old.json", "bh_b.json"]);
  for (const [o, n] of pairs) {
    if (!files.includes(o) || !files.includes(n)) continue;
    const A = load(o);
    const B = load(n);
    const refsB = new Set(B.map(refKey));
    const refsA = new Set(A.map(refKey));
    // Only what the diff hands to the matcher: listings whose reference disappeared or appeared.
    versionTasks.push(scoreTask([{ group: "old", listings: A.filter((l) => !refsB.has(refKey(l))) }, { group: "new", listings: B.filter((l) => !refsA.has(refKey(l))) }], "versions", true));
  }
  progress("versions scored");
  const versions = pick("versions (re-posts among removed/added, one-to-one)", versionTasks, 0.95);

  const agencyTask = scoreTask(files.filter((f) => f.startsWith("agency__")).map((f) => ({ group: f, listings: load(f) })), "agencies", false);
  progress("agencies scored");
  const agencies = pick("agencies (pairs across 55 agencies)", [agencyTask], 0.9);

  if (process.env.BENCH_WRITE === "1") {
    const file = path.resolve(__dirname, "../src/lib/propertyMatchWeights.ts");
    const table = { versions: { ...MATCH_WEIGHTS.versions, ...versions }, agencies: { ...MATCH_WEIGHTS.agencies, ...agencies } };
    const src = readFileSync(file, "utf8");
    const head = src.slice(0, src.indexOf("export const MATCH_WEIGHTS"));
    writeFileSync(
      file,
      head.replace(/ \* `match`:[\s\S]*?\*\//, ` * Thresholds from replaying the real jobs with permits hidden (bench/thresholds.bench.test.ts):\n * versions match ${versions.match} / possible ${versions.possible}; agencies match ${agencies.match} / possible ${agencies.possible}.\n */`) +
        `export const MATCH_WEIGHTS: Record<"versions" | "agencies", WeightTable> = ${JSON.stringify(table, null, 2)};\n`,
    );
  }
  progress("done");
});
