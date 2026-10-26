import { appendFileSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { it } from "vitest";
import { candidatePairs, compareLevels, prepareListings, type MatchSignal, type Prepared } from "@/lib/propertyMatch";
import type { WeightTable } from "@/lib/propertyMatchWeights";
import type { Listing } from "@/lib/types";

/**
 * Fellegi–Sunter calibration on real feeds, the Splink recipe:
 *
 *   m = P(level | same property)      from pairs sharing a permit number (reliable positives).
 *   u = P(level | different property) from random pairs in the same community (any type or bedrooms,
 *       so mismatches are represented) plus identical-looking units in one building (the hard case).
 *       Random pairs are almost never the same property, unlike candidate pairs.
 *   weight(level) = log2(m / u), Laplace-smoothed, clamped to its logical direction. The permit is
 *       hidden while learning; permit and floor weights are set by policy.
 *
 * Then, with the weights fixed, EM estimates one number — the share of real candidate pairs that are
 * true matches — which turns scores into match probabilities. Thresholds:
 *   match:    ≥ 95% estimated precision among candidate pairs AND ≤ 0.1% of random pairs pass
 *   possible: ≥ 60% estimated precision, at most 2.5 points below match
 *
 * "versions": each agency's oldest vs newest feed, positives limited to re-posted pairs (different
 * reference, same permit). "agencies": 55 agencies' feeds against each other.
 *
 * Run: BENCH_CACHE=… BENCH_WRITE=1 npm run bench -- bench/calibrate.bench.test.ts
 */
const cache = process.env.BENCH_CACHE ?? "";
/** Vitest holds console output until a test ends; progress goes straight to a file instead. */
const progress = (msg: string) => process.env.BENCH_PROGRESS && appendFileSync(process.env.BENCH_PROGRESS, `${new Date().toISOString().slice(11, 19)} ${msg}\n`);
const load = (f: string): Listing[] => JSON.parse(readFileSync(path.join(cache, f), "utf8")).listings;
const refKey = (l: Listing) => (l.reference || "").toLowerCase().replace(/[\s_-]+/g, "");

type Levels = { signal: MatchSignal; level: string }[];
type Samples = { pos: Levels[]; neg: Levels[]; cand: Levels[] };
type Weights = Record<string, Record<string, number>>;

const levelsOf = (a: Prepared, b: Prepared): Levels =>
  compareLevels({ ...a, permit: "" }, { ...b, permit: "" }).map(({ signal, level }) => ({ signal, level }));

/** Deterministic PRNG so calibration is reproducible. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

const knownSame = (a: Prepared, b: Prepared) =>
  (a.permit && a.permit === b.permit) || (refKey(a.listing) && refKey(a.listing) === refKey(b.listing));

function collect(groups: { group: string; listings: Listing[] }[], keepPos: (a: Prepared, b: Prepared) => boolean, out: Samples, maxCand: number) {
  const items = prepareListings(groups);
  const cand: Levels[] = [];
  for (const [i, j] of candidatePairs(items, (a, b) => a.group !== b.group)) {
    const a = items[i];
    const b = items[j];
    if (a.permit && a.permit === b.permit) {
      if (keepPos(a, b)) out.pos.push(levelsOf(a, b));
      continue;
    }
    if (refKey(a.listing) && refKey(a.listing) === refKey(b.listing)) continue;
    cand.push(levelsOf(a, b));
  }
  // Keep the candidate sample bounded per pool so one huge agency does not dominate.
  const rand = rng(groups.length * 7919 + items.length);
  for (const c of cand) if (cand.length <= maxCand || rand() < maxCand / cand.length) out.cand.push(c);

  const buckets = new Map<string, number[]>();
  const put = (k: string, i: number) => {
    const arr = buckets.get(k);
    if (arr) arr.push(i);
    else buckets.set(k, [i]);
  };
  items.forEach((p, i) => {
    if (p.community) put(`c|${p.community}`, i);
    if (p.building && p.building !== p.community) put(`b|${p.building}|${p.beds ?? "?"}`, i);
  });
  for (const idx of buckets.values()) {
    if (idx.length < 2) continue;
    for (const i of idx) {
      for (let t = 0; t < 2; t++) {
        const j = idx[Math.floor(rand() * idx.length)];
        const a = items[i];
        const b = items[j];
        if (j === i || a.group === b.group || knownSame(a, b)) continue;
        out.neg.push(levelsOf(a, b));
      }
    }
  }
}

const scoreOf = (ls: Levels, w: Weights) => ls.reduce((n, l) => n + (w[l.signal]?.[l.level] ?? 0), 0);

/** Levels where the two listings agree can only support a match; disagreeing levels can only oppose it. */
const AGREE = /^(same|exact|within1\.5|many|some|folder|near|nested|similar|partial)/;
const DISAGREE = /^(different|off|far|veryfar|none|within15)/;

function estimateWeights(pos: Levels[], neg: Levels[]): Weights {
  const count = (set: Levels[]) => {
    const m = new Map<string, number>();
    for (const ls of set) for (const l of ls) m.set(`${l.signal}|${l.level}`, (m.get(`${l.signal}|${l.level}`) ?? 0) + 1);
    return m;
  };
  const cm = count(pos);
  const cu = count(neg);
  const w: Weights = {};
  for (const k of new Set([...cm.keys(), ...cu.keys()])) {
    const [signal, level] = k.split("|");
    const m = ((cm.get(k) ?? 0) + 0.5) / (pos.length + 1);
    const u = ((cu.get(k) ?? 0) + 0.5) / (neg.length + 1);
    let v = Math.max(-9, Math.min(10, Math.log2(m / u)));
    // Sparse levels can come out with the wrong sign from small samples.
    if (AGREE.test(level)) v = Math.max(0, v);
    else if (DISAGREE.test(level)) v = Math.min(0, v);
    (w[signal] ??= {})[level] = Math.round(v * 10) / 10;
  }
  // The permit is the label, so its weight is policy: decisive when equal; a mild objection when
  // different, since permits are renewed and re-issued for the same unit.
  w.permit = { same: 12, different: -1.5 };
  // Floor identifies the unit inside a building but is filled too rarely to learn reliably.
  w.floor = { same: 1.5, different: -6 };
  return w;
}

/** EM for the match rate among candidate pairs, weights fixed. Returns per-pair match probability. */
function posteriors(cand: Levels[], w: Weights) {
  const scores = cand.map((c) => scoreOf(c, w));
  let lambda = 0.05;
  let p: number[] = [];
  for (let r = 0; r < 50; r++) {
    const prior = Math.log2(lambda / (1 - lambda));
    p = scores.map((s) => 1 / (1 + 2 ** -(prior + s)));
    const next = Math.min(0.9, Math.max(1e-5, p.reduce((n, x) => n + x, 0) / Math.max(1, p.length)));
    if (Math.abs(next - lambda) < 1e-6) break;
    lambda = next;
  }
  return { scores, p, lambda };
}

/** Lowest score where at most `fpr` of random different-property pairs pass. */
function fprThreshold(neg: Levels[], w: Weights, fpr: number) {
  const s = neg.map((x) => scoreOf(x, w)).sort((a, b) => b - a);
  return Math.ceil(((s[Math.floor(s.length * fpr)] ?? 0) + 0.05) * 2) / 2;
}

/** Lowest score at which candidate pairs above it are at least `target` likely to be matches on average. */
function precisionThreshold(scores: number[], p: number[], target: number) {
  const order = scores.map((s, i) => ({ s, p: p[i] })).sort((a, b) => b.s - a.s);
  let sum = 0;
  let best = Infinity;
  for (let i = 0; i < order.length; i++) {
    sum += order[i].p;
    if (i + 1 < order.length && order[i + 1].s === order[i].s) continue;
    if (i >= 19 && sum / (i + 1) >= target) best = order[i].s;
  }
  return Number.isFinite(best) ? Math.ceil(best * 2) / 2 : 30;
}

function report(name: string, pos: Levels[], neg: Levels[], w: Weights) {
  const ps = pos.map((x) => scoreOf(x, w));
  const ns = neg.map((x) => scoreOf(x, w));
  const rows = [4, 6, 8, 10, 12, 14].map((t) => {
    const r = ps.filter((x) => x >= t).length / Math.max(1, ps.length);
    const f = ns.filter((x) => x >= t).length / Math.max(1, ns.length);
    return `t=${String(t).padStart(2)}  recall ${(r * 100).toFixed(1).padStart(5)}%   random-pair false-match rate ${(f * 100).toFixed(3).padStart(7)}%`;
  });
  console.log(`\n${name} (${ps.length} permit pairs, ${ns.length} random pairs)\n  ${rows.join("\n  ")}`);
}

const half = <T,>(xs: T[], k: 0 | 1) => xs.filter((_, i) => i % 2 === k);

it("calibrates match weights", () => {
  const files = readdirSync(cache);

  const versions: Samples = { pos: [], neg: [], cand: [] };
  const spiders = [...new Set(files.filter((f) => f.startsWith("run__")).map((f) => f.split("__")[1]))];
  const pairs: [string, string][] = spiders.map((s) => [`run__${s}__old.json`, `run__${s}__new.json`]);
  pairs.push(["bh_old.json", "bh_b.json"]);
  for (const [o, n] of pairs) {
    if (!files.includes(o) || !files.includes(n)) continue;
    progress(`versions ${o}`);
    collect([{ group: "old", listings: load(o) }, { group: "new", listings: load(n) }], (x, y) => refKey(x.listing) !== refKey(y.listing), versions, 5000);
  }

  progress("agencies pool");
  const agencies: Samples = { pos: [], neg: [], cand: [] };
  collect(files.filter((f) => f.startsWith("agency__")).map((f) => ({ group: f, listings: load(f) })), () => true, agencies, 200_000);

  const table = {} as Record<"versions" | "agencies", WeightTable>;
  const summary: string[] = [];
  for (const [ctx, s] of [["versions", versions], ["agencies", agencies]] as const) {
    progress(`fit ${ctx}`);
    report(`${ctx}: weights from one half, measured on the other`, half(s.pos, 1), half(s.neg, 1), estimateWeights(half(s.pos, 0), half(s.neg, 0)));
    const weights = estimateWeights(s.pos, s.neg);
    report(`${ctx}: all`, s.pos, s.neg, weights);
    const { scores, p, lambda } = posteriors(s.cand, weights);
    const match = Math.max(fprThreshold(s.neg, weights, 0.001), precisionThreshold(scores, p, 0.95));
    const possible = Math.min(match - 1, Math.max(match - 2.5, fprThreshold(s.neg, weights, 0.02), precisionThreshold(scores, p, 0.6)));
    const recall = (t: number) => ((100 * s.pos.filter((x) => scoreOf(x, weights) >= t).length) / Math.max(1, s.pos.length)).toFixed(1);
    const line = `${ctx}: candidate pairs that are matches ~${(lambda * 100).toFixed(1)}% | match >= ${match} (recall ${recall(match)}%), possible >= ${possible} (recall ${recall(possible)}%)`;
    console.log(`  ${line}`);
    summary.push(line);
    table[ctx] = { match, possible, weights };
  }
  progress(summary.join(" || "));

  const out = `/* Generated by bench/calibrate.bench.test.ts on ${new Date().toISOString().slice(0, 10)}. Do not edit by hand. */
import type { MatchSignal } from "@/lib/propertyMatch";

export type WeightTable = { match: number; possible: number; weights: Partial<Record<MatchSignal, Record<string, number>>> };

/**
 * log2(m/u) weight per comparison level, learned from real feeds: m from ${(versions.pos.length + agencies.pos.length).toLocaleString("en")}
 * permit-matched pairs, u from ${(versions.neg.length + agencies.neg.length).toLocaleString("en")} random pairs (same community, plus identical-looking
 * units in one building). \`match\`: at least 95% estimated precision and at most 0.1% of random pairs
 * pass; \`possible\`: at least 60% precision, at most 2.5 points below \`match\`.
 */
export const MATCH_WEIGHTS: Record<"versions" | "agencies", WeightTable> = ${JSON.stringify(table, null, 2)};
`;
  progress("done");
  if (process.env.BENCH_WRITE === "1") writeFileSync(path.resolve(__dirname, "../src/lib/propertyMatchWeights.ts"), out);
});
