import { candidatePairs, compareLevels, prepareListings, scoreWith, type MatchContext, type MatchSignal, type Prepared } from "@/lib/propertyMatch";
import type { WeightTable } from "@/lib/propertyMatchWeights";
import type { Listing } from "@/lib/types";

/**
 * Learns property-matching weights from the live feeds and the team's review decisions, measures
 * them on the real jobs, and decides whether the new model may replace the active one.
 *
 * Fellegi–Sunter, the Splink recipe:
 *   m = P(level | same property)       pairs sharing a permit + pairs a reviewer marked "same"
 *   u = P(level | different property)  random pairs in one community (any type/bedrooms, so mismatches
 *                                      are represented) + identical-looking units in one building +
 *                                      pairs a reviewer marked "not the same"
 *   weight = log2(m / u), smoothed, clamped to its logical direction; permit and floor by policy.
 *
 * Thresholds come from replaying the real jobs with permits hidden:
 *   versions  removed vs added listings of each feed, matched one-to-one → precision/recall on re-posts
 *   agencies  a shared permit is required for "match" (feed data alone cannot tell identical units
 *             apart); "possible" is the score where hidden-permit precision reaches the review target
 *
 * Gate: the new model is activated only if it is at least as good as the active one on the same
 * replay (and on reviewer labels, when there are enough).
 */

export type ModelTables = Record<MatchContext, WeightTable>;
export type ReviewLabel = { listingIds: string[]; verdict: "same" | "different"; context: MatchContext };

export type TrainingInput = {
  /** Per source: an older and the newest version of the feed (raw listings, ids = references). */
  versions: { old: Listing[]; new: Listing[] }[];
  /** Live listings per agency (ids as the app assigns them, so review labels resolve). */
  agencies: { group: string; listings: Listing[] }[];
  labels: ReviewLabel[];
  current: ModelTables;
  progress?: (msg: string) => void;
};

export type ContextMetrics = {
  precision: number;
  recall: number;
  positives: number;
  negatives: number;
  /** Same measurement with the currently active model, for the gate. */
  currentPrecision: number;
  currentRecall: number;
  /** Agreement with reviewer decisions (share of labels the model gets right), when labels exist. */
  reviewAgreement: number | null;
  currentReviewAgreement: number | null;
  reviewLabels: number;
};

export type TrainingResult = {
  weights: ModelTables;
  metrics: { versions: ContextMetrics; agencies: ContextMetrics; trainedAt: string; sources: number; listings: number; gate: { passed: boolean; reason: string } };
};

type Levels = { signal: MatchSignal; level: string }[];
type Weights = Record<string, Record<string, number>>;

const refKey = (l: Listing) => (l.reference || "").toLowerCase().replace(/[\s_-]+/g, "");
const levelsOf = (a: Prepared, b: Prepared): Levels => compareLevels({ ...a, permit: "" }, { ...b, permit: "" }).map(({ signal, level }) => ({ signal, level }));
const scoreOf = (ls: Levels, w: Weights) => ls.reduce((n, l) => n + (w[l.signal]?.[l.level] ?? 0), 0);

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** Labelled pairs from one pool: permit positives (via blocking) and random look-alike negatives. */
function sample(items: Prepared[], keepPos: (a: Prepared, b: Prepared) => boolean, pos: Levels[], neg: Levels[]) {
  for (const [i, j] of candidatePairs(items, (a, b) => a.group !== b.group && !!a.permit && a.permit === b.permit)) {
    if (keepPos(items[i], items[j])) pos.push(levelsOf(items[i], items[j]));
  }
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
  const rand = rng(items.length * 7919 + 17);
  for (const idx of buckets.values()) {
    if (idx.length < 2) continue;
    for (const i of idx) {
      for (let t = 0; t < 2; t++) {
        const j = idx[Math.floor(rand() * idx.length)];
        const a = items[i];
        const b = items[j];
        if (j === i || a.group === b.group) continue;
        if ((a.permit && a.permit === b.permit) || (refKey(a.listing) && refKey(a.listing) === refKey(b.listing))) continue;
        neg.push(levelsOf(a, b));
      }
    }
  }
}

const AGREE = /^(same|exact|within1\.5|many|some|folder|near|nested|similar|partial)/;
const DISAGREE = /^(different|off|far|veryfar|none|within15)/;

function estimate(pos: Levels[], neg: Levels[]): Weights {
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
    if (AGREE.test(level)) v = Math.max(0, v);
    else if (DISAGREE.test(level)) v = Math.min(0, v);
    (w[signal] ??= {})[level] = Math.round(v * 10) / 10;
  }
  // Permit is the label, so its weight is policy: decisive when equal, a mild objection otherwise
  // (permits are renewed and re-issued). Floor identifies the unit but is too rarely filled to learn.
  w.permit = { same: 12, different: -1.5 };
  w.floor = { same: 1.5, different: -6 };
  return w;
}

type Replay = { s: number; i: number; j: number; label: boolean | null }[];

/** Version re-post replay: removed vs added per feed, permits hidden, graded by the real permits. */
function replayVersions(pools: Prepared[][], ctxTable: (w: WeightTable) => (a: Prepared, b: Prepared) => number, table: WeightTable) {
  const score = ctxTable(table);
  let tp = 0;
  let fp = 0;
  let positives = 0;
  const all: { s: number; label: boolean | null; pool: number; i: number; j: number }[] = [];
  pools.forEach((items, k) => {
    const hidden = items.map((p) => ({ ...p, permit: "" }));
    for (const [i, j] of candidatePairs(hidden, (a, b) => a.group !== b.group)) {
      const a = items[i].permit;
      const b = items[j].permit;
      all.push({ s: score(hidden[i], hidden[j]), label: a && b ? a === b : null, pool: k, i, j });
    }
    const byPermit = new Map<string, number>();
    for (const p of items) if (p.permit) byPermit.set(`${p.group}|${p.permit}`, 1);
    for (const p of items) if (p.permit && p.group === "new" && byPermit.has(`old|${p.permit}`)) positives++;
  });
  const at = (t: number) => {
    tp = 0;
    fp = 0;
    const used = new Set<string>();
    for (const x of all.filter((y) => y.s >= t).sort((p, q) => q.s - p.s)) {
      const ka = `${x.pool}:${x.i}`;
      const kb = `${x.pool}:${x.j}`;
      if (used.has(ka) || used.has(kb)) continue;
      used.add(ka);
      used.add(kb);
      if (x.label === true) tp++;
      else if (x.label === false) fp++;
    }
    return { precision: tp / Math.max(1, tp + fp), recall: tp / Math.max(1, positives), tp };
  };
  return { at, positives };
}

/** Agency replay: cross-agency candidate pairs, permits hidden, graded by permits. */
function replayAgencies(items: Prepared[], table: WeightTable) {
  const hidden = items.map((p) => ({ ...p, permit: "" }));
  const all: { s: number; label: boolean | null }[] = [];
  for (const [i, j] of candidatePairs(hidden, (a, b) => a.group !== b.group)) {
    const a = items[i].permit;
    const b = items[j].permit;
    all.push({ s: scoreWith(hidden[i], hidden[j], table).score, label: a && b ? a === b : null });
  }
  let positives = 0;
  const by = new Map<string, Set<string>>();
  for (const p of items) if (p.permit) by.set(p.permit, (by.get(p.permit) ?? new Set()).add(p.group));
  for (const g of by.values()) positives += (g.size * (g.size - 1)) / 2;
  const at = (t: number) => {
    let tp = 0;
    let fp = 0;
    for (const x of all) {
      if (x.s < t) continue;
      if (x.label === true) tp++;
      else if (x.label === false) fp++;
    }
    return { precision: tp / Math.max(1, tp + fp), recall: tp / Math.max(1, positives), tp };
  };
  return { at, positives };
}

function lowest(at: (t: number) => { precision: number; tp: number }, target: number, fallback: number) {
  for (let t = 0; t <= 24; t += 0.5) {
    const r = at(t);
    if (r.tp >= 10 && r.precision >= target) return t;
  }
  return fallback;
}

/** Share of reviewer labels the model agrees with (match vs not), using each label's context. */
function reviewAgreement(labels: ReviewLabel[], byId: Map<string, Prepared>, tables: ModelTables) {
  let ok = 0;
  let n = 0;
  for (const l of labels) {
    const ps = l.listingIds.map((id) => byId.get(id)).filter((p): p is Prepared => !!p);
    if (ps.length < 2) continue;
    const table = tables[l.context];
    const r = scoreWith(ps[0], ps[1], table, l.context);
    n++;
    if ((r.verdict === "match") === (l.verdict === "same")) ok++;
  }
  return n ? { agreement: ok / n, n } : { agreement: null, n: 0 };
}

const f1 = (p: number, r: number) => (p + r ? (2 * p * r) / (p + r) : 0);

export function trainMatchModel(input: TrainingInput): TrainingResult {
  const say = input.progress ?? (() => {});

  say("Preparing feeds");
  const versionPools = input.versions.map((v) => prepareListings([
    { group: "old", listings: v.old },
    { group: "new", listings: v.new },
  ]));
  // Version replay uses only what the diff hands to the matcher: listings whose reference changed.
  const leftoverPools = input.versions.map((v) => {
    const refsNew = new Set(v.new.map(refKey));
    const refsOld = new Set(v.old.map(refKey));
    return prepareListings([
      { group: "old", listings: v.old.filter((l) => !refsNew.has(refKey(l))) },
      { group: "new", listings: v.new.filter((l) => !refsOld.has(refKey(l))) },
    ]);
  });
  const agencyItems = prepareListings(input.agencies);
  const byId = new Map(agencyItems.map((p) => [p.listing.id, p]));

  say("Sampling labelled pairs");
  const vPos: Levels[] = [];
  const vNeg: Levels[] = [];
  for (const items of versionPools) sample(items, (a, b) => refKey(a.listing) !== refKey(b.listing), vPos, vNeg);
  const aPos: Levels[] = [];
  const aNeg: Levels[] = [];
  sample(agencyItems, () => true, aPos, aNeg);
  // Reviewer decisions are the best labels there are; they count for their own context.
  for (const l of input.labels) {
    const ps = l.listingIds.map((id) => byId.get(id)).filter((p): p is Prepared => !!p);
    if (ps.length < 2) continue;
    const lv = levelsOf(ps[0], ps[1]);
    const [pos, neg] = l.context === "versions" ? [vPos, vNeg] : [aPos, aNeg];
    // Weight a human verdict like several sampled pairs: it was chosen from the hard cases.
    for (let k = 0; k < 5; k++) (l.verdict === "same" ? pos : neg).push(lv);
  }

  say("Learning weights");
  const vWeights = estimate(vPos, vNeg);
  const aWeights = estimate(aPos, aNeg);

  say("Measuring on real jobs");
  const scorer = (table: WeightTable) => (a: Prepared, b: Prepared) => scoreWith(a, b, table).score;
  const draftV: WeightTable = { match: 0, possible: 0, weights: vWeights };
  const vNew = replayVersions(leftoverPools, scorer, draftV);
  const vMatch = lowest(vNew.at, 0.95, input.current.versions.match);
  const vPossible = Math.min(vMatch - 0.5, lowest(vNew.at, 0.8, input.current.versions.possible));
  const draftA: WeightTable = { match: 0, possible: 0, weights: aWeights };
  const aNew = replayAgencies(agencyItems, draftA);
  const aPossible = lowest(aNew.at, 0.35, input.current.agencies.possible);
  const weights: ModelTables = {
    versions: { match: vMatch, possible: vPossible, weights: vWeights },
    // Across agencies a shared permit is required for "match" (enforced in the scorer); its score
    // threshold just has to sit at the permit weight.
    agencies: { match: Math.max(12, aPossible + 1), possible: aPossible, weights: aWeights },
  };

  const vCur = replayVersions(leftoverPools, scorer, input.current.versions).at(input.current.versions.match);
  const vRes = vNew.at(vMatch);
  const aRes = aNew.at(aPossible);
  const aCur = replayAgencies(agencyItems, input.current.agencies).at(input.current.agencies.possible);
  const vLabels = input.labels.filter((l) => l.context === "versions");
  const aLabels = input.labels.filter((l) => l.context === "agencies");
  const revNewA = reviewAgreement(aLabels, byId, weights);
  const revCurA = reviewAgreement(aLabels, byId, input.current);

  const metrics: TrainingResult["metrics"] = {
    versions: {
      precision: vRes.precision,
      recall: vRes.recall,
      positives: vPos.length,
      negatives: vNeg.length,
      currentPrecision: vCur.precision,
      currentRecall: vCur.recall,
      reviewAgreement: null,
      currentReviewAgreement: null,
      reviewLabels: vLabels.length,
    },
    agencies: {
      precision: aRes.precision,
      recall: aRes.recall,
      positives: aPos.length,
      negatives: aNeg.length,
      currentPrecision: aCur.precision,
      currentRecall: aCur.recall,
      reviewAgreement: revNewA.agreement,
      currentReviewAgreement: revCurA.agreement,
      reviewLabels: aLabels.length,
    },
    trainedAt: new Date().toISOString(),
    sources: input.agencies.length,
    listings: agencyItems.length,
    gate: { passed: false, reason: "" },
  };

  // Gate: never trade away precision; never get worse overall than the active model.
  const reasons: string[] = [];
  if (vPos.length < 50) reasons.push("too few re-posted listings with permits to learn from");
  if (vRes.precision < 0.93) reasons.push(`version precision ${(vRes.precision * 100).toFixed(1)}% is below 93%`);
  if (f1(vRes.precision, vRes.recall) < f1(vCur.precision, vCur.recall) - 0.01) reasons.push("versions: worse than the active model");
  if (revNewA.agreement != null && revCurA.agreement != null && revNewA.n >= 20 && revNewA.agreement < revCurA.agreement - 0.02) {
    reasons.push("agrees with reviewers less than the active model");
  }
  metrics.gate = reasons.length ? { passed: false, reason: reasons.join("; ") } : { passed: true, reason: "at least as accurate as the active model" };
  say("Done");
  return { weights, metrics };
}
