import { marketOf } from "@/lib/markets";
import type { Listing } from "@/lib/types";
import { jaccard, mediaKey, metresBetween, textKey, wordSet } from "@/lib/listingChanges";
import { MATCH_WEIGHTS, type WeightTable } from "@/lib/propertyMatchWeights";

/**
 * "Is this the same property?" without trusting any single field.
 *
 * Probabilistic record linkage (Fellegi–Sunter): each field comparison lands in a level
 * (exact / close / far / conflicting / unknown) and contributes a weight = log2 of how much more
 * often that level occurs for true matches than for random pairs. Weights add up to a score:
 * positive evidence (same permit, shared photos, same area to the decimal, near-identical description)
 * raises it, contradictions (different bedroom count, area 30% off, different permit) lower it, and a
 * missing field contributes nothing — so a listing without a reference or permit can still match on
 * everything else, and one wrong field cannot force or block a match on its own.
 *
 * Weights are estimated from real Dubai feeds, where listings sharing a permit number act as labelled
 * matches: weight = log2(P(level | same permit) / P(level | different permit)), per context
 * (`npm run bench:calibrate` regenerates `propertyMatchWeights.ts`). Thresholds sit where measured
 * precision is high. Candidate pairs come from blocking keys so large feeds stay fast; only listings
 * that share at least one key are scored.
 */

export type MatchSignal =
  | "permit"
  | "photos"
  | "description"
  | "title"
  | "area"
  | "beds"
  | "baths"
  | "type"
  | "purpose"
  | "community"
  | "building"
  | "location"
  | "price"
  | "agent"
  | "floor"
  /** A person's verdict, which overrides the score. */
  | "review";

export type Evidence = { signal: MatchSignal; weight: number; label: string };

export type Verdict = "match" | "possible" | "different";

export type PairScore = { score: number; verdict: Verdict; evidence: Evidence[] };

export const SIGNAL_LABEL: Record<MatchSignal, string> = {
  permit: "Permit",
  photos: "Photos",
  description: "Description",
  title: "Title",
  area: "Size",
  beds: "Bedrooms",
  baths: "Bathrooms",
  type: "Type",
  purpose: "Sale / rent",
  community: "Community",
  building: "Building",
  location: "Map pin",
  price: "Price",
  agent: "Agent",
  floor: "Floor",
  review: "Reviewer",
};

/* ── preparation ─────────────────────────────────────────────────────────── */

export type Prepared = {
  listing: Listing;
  /** Caller's group (agency, version side…); pairs inside one group can be skipped. */
  group: string;
  /** Market code (AE, SG, MY, PK): listings in different countries are never the same property. */
  market: string;
  permit: string;
  purpose: string;
  type: string;
  beds: number | null;
  baths: number | null;
  area: number | null;
  community: string;
  building: string;
  lat: number | null;
  lng: number | null;
  price: number;
  photos: Set<string>;
  /** Property ids embedded in photo paths (e.g. ".../images/EP-0304981/abc.jpg"). */
  photoIds: Set<string>;
  title: Set<string>;
  /** Hashed word 3-grams of the description, boilerplate removed. */
  shingles: Set<number>;
  agent: string;
  floor: string;
};

export const normalizePermit = (raw: string | undefined) => String(raw ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();

const validPermit = (p: string) => p.length >= 5 && !/^0+$/.test(p);

function fnv(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Latin letters, digits and Arabic; everything else separates words. */
const WORD_SPLIT = /[^a-z0-9؀-ۿ]+/;

/**
 * Hashed word 3-grams of a description (first ~300 words). Each word is hashed once and the three
 * hashes are combined, which keeps this fast on tens of thousands of long descriptions.
 */
function rawShingles(text: string): number[] {
  const words = (text || "").toLowerCase().split(WORD_SPLIT, 320);
  const hs: number[] = [];
  for (const w of words) if (w) hs.push(fnv(w));
  const out: number[] = [];
  for (let i = 0; i + 2 < hs.length; i++) out.push((Math.imul(Math.imul(hs[i], 31) ^ hs[i + 1], 31) ^ hs[i + 2]) >>> 0);
  return out;
}

/**
 * Directory segments that look like ids (≥4 digits): stable per property on many portal CDNs
 * (".../images/EP-0304981/abc.jpg"). Image sizes, CDN transform strings and host-like segments are
 * not ids; frequency filtering in `prepareListings` drops agency-wide folders.
 */
function photoIdsOf(urls: string[]): Set<string> {
  const ids = new Set<string>();
  for (const u of urls.slice(0, 6)) {
    const parts = mediaKey(u).split("/").slice(1, -1);
    for (const p of parts) {
      if (p.length < 5 || (p.match(/\d/g)?.length ?? 0) < 4) continue;
      if (/^\d{2,4}x\d{2,4}$/.test(p) || /[%,=:]/.test(p) || /\.(com|net|io|ae|app|appspot)/.test(p)) continue;
      ids.add(p);
    }
  }
  return ids;
}

const posNum = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Type names vary by feed ("Apartment" vs "AP", "Villa" vs "VH"); compare on a coarse family. */
function typeFamily(t: string): string {
  const s = textKey(t);
  if (!s) return "";
  if (/^(ap|apartment|flat|hotel apartment|ha|duplex|du|penthouse|ph|loft|serviced)/.test(s)) return "apartment";
  if (/^(vh|villa|th|townhouse|town house|bungalow|bu)/.test(s)) return /^(th|town)/.test(s) ? "townhouse" : "villa";
  if (/^(lp|land|plot)/.test(s)) return "land";
  if (/^(of|office|sh|shop|retail|wh|warehouse|commercial|bw|whole building|building)/.test(s)) return "commercial";
  return s;
}

/**
 * How many listings may share a description phrase, photo folder or permit before it stops
 * identifying one property. A property appears at most a few times in a pool (two versions, a sale
 * and a rent advert); agency footers, developer project copy, CRM folders and placeholder permits
 * repeat far more.
 */
const MAX_SHARED = 3;

function countAll<T>(lists: Iterable<Iterable<T>>): Map<T, number> {
  const m = new Map<T, number>();
  for (const xs of lists) for (const x of new Set(xs)) m.set(x, (m.get(x) ?? 0) + 1);
  return m;
}

/**
 * Normalizes listings once and drops anything too common to identify a property: description
 * phrases shared by many listings (agency footers, "Company name: … RERA ORN …", developer project
 * copy), photo folders shared across many listings, and permits reused within one feed.
 */
export function prepareListings(groups: { group: string; listings: Listing[] }[]): Prepared[] {
  const all = groups.flatMap((g) =>
    g.listings.map((l) => ({ g: g.group, l, sh: rawShingles(l.description), ids: photoIdsOf(l.images), permit: normalizePermit(l.permitNumber) })),
  );
  // Phrase frequencies in a fixed-size counter table (2^24 cells, saturating at 255): a Map with
  // millions of distinct phrase hashes is several times slower. A rare phrase occasionally shares a
  // cell with a common one and is dropped — harmless, the rest of its description still counts.
  const shDf = new Uint8Array(1 << 24);
  for (const x of all) for (const h of new Set(x.sh)) if (shDf[h & 0xffffff] < 255) shDf[h & 0xffffff]++;
  const idDf = countAll(all.map((x) => x.ids));
  const permitDf = countAll(all.map((x) => (x.permit ? [`${x.g}|${x.permit}`] : [])));
  return all.map(({ g, l, sh, ids, permit }) => {
    const lat = Number(l.latitude);
    const lng = Number(l.longitude);
    const okPoint = l.latitude != null && l.longitude != null && Number.isFinite(lat) && Number.isFinite(lng) && !(Math.abs(lat) < 1e-6 && Math.abs(lng) < 1e-6);
    const agentKey = (l.agent?.email || l.agent?.licenseNo || l.agent?.phone || "").toString().toLowerCase().replace(/\s+/g, "");
    return {
      listing: l,
      group: g,
      market: marketOf(l).code,
      // One feed using a permit on many listings means a company/project number, not a unit's permit.
      permit: validPermit(permit) && (permitDf.get(`${g}|${permit}`) ?? 0) <= MAX_SHARED ? permit : "",
      purpose: l.purpose === "sale" || l.purpose === "rent" ? l.purpose : "",
      type: typeFamily(l.propertyType),
      beds: Number.isFinite(l.beds) && (l.beds > 0 || /studio/i.test(`${l.title} ${l.propertyType}`)) ? l.beds : null,
      baths: posNum(l.baths),
      area: posNum(l.area),
      community: textKey(l.community),
      building: textKey(l.propertyName),
      lat: okPoint ? lat : null,
      lng: okPoint ? lng : null,
      price: posNum(l.price) ?? 0,
      // The first dozen photos carry the identity; galleries run to 60+.
      photos: new Set(l.images.slice(0, 12).map(mediaKey).filter(Boolean)),
      photoIds: new Set([...ids].filter((d) => (idDf.get(d) ?? 0) <= MAX_SHARED)),
      title: wordSet(l.title),
      shingles: new Set(sh.filter((h) => shDf[h & 0xffffff] <= MAX_SHARED)),
      agent: agentKey,
      floor: textKey(l.floor),
    };
  });
}

/* ── pair scoring ────────────────────────────────────────────────────────── */

const rel = (x: number, y: number) => Math.abs(x - y) / Math.max(x, y);

/**
 * Where a pair comes from changes what evidence means. Two versions of one feed keep the agency's
 * own copy, photos and agent; two agencies re-shoot photos, rewrite copy and file their own permit.
 */
export type MatchContext = "versions" | "agencies";

export type Comparison = { signal: MatchSignal; level: string; label: string };

/**
 * Field-by-field comparison levels for a pair. A field missing on either side yields no entry
 * (it is unknown, not a disagreement).
 */
export function compareLevels(a: Prepared, b: Prepared): Comparison[] {
  const out: Comparison[] = [];
  const add = (signal: MatchSignal, level: string, label: string) => out.push({ signal, level, label });

  if (a.permit && b.permit) add("permit", a.permit === b.permit ? "same" : "different", a.permit === b.permit ? `Same permit ${a.permit}` : "Different permit numbers");

  let sharedPhotos = 0;
  for (const p of a.photos) if (b.photos.has(p)) sharedPhotos++;
  let sharedIds = 0;
  for (const p of a.photoIds) if (b.photoIds.has(p)) sharedIds++;
  if (sharedPhotos >= 3 || (sharedPhotos && sharedPhotos >= Math.min(a.photos.size, b.photos.size) * 0.5)) add("photos", "many", `${sharedPhotos} identical photos`);
  else if (sharedPhotos) add("photos", "some", `${sharedPhotos} identical photo${sharedPhotos > 1 ? "s" : ""}`);
  else if (sharedIds) add("photos", "folder", "Same property id in photo links");
  else if (a.photos.size >= 3 && b.photos.size >= 3) add("photos", "none", "No photos in common");

  if (a.shingles.size >= 8 && b.shingles.size >= 8) {
    const s = jaccard(a.shingles, b.shingles);
    const pct = `${Math.round(s * 100)}%`;
    if (s >= 0.6) add("description", "same", `Description ${pct} the same`);
    else if (s >= 0.3) add("description", "similar", `Description ${pct} the same`);
    else if (s >= 0.1) add("description", "partial", "Description partly the same");
    else add("description", "different", "Different description");
  }

  if (a.title.size >= 3 && b.title.size >= 3) {
    const s = jaccard(a.title, b.title);
    add("title", s >= 0.85 ? "same" : s >= 0.5 ? "similar" : "different", s >= 0.85 ? "Same title" : s >= 0.5 ? "Similar title" : "Different title");
  }

  if (a.area && b.area) {
    const r = rel(a.area, b.area);
    // An exact villa or plot size is close to a fingerprint; a tower has many identical apartments.
    const kind = a.type === "apartment" || b.type === "apartment" ? "apt" : "house";
    // Decimals (764.32 sqft) come from a unit's own measurement; whole numbers are usually the
    // developer's unit-type size, shared by every unit of that layout.
    const precise = a.area % 1 !== 0 && b.area % 1 !== 0 ? "precise" : "round";
    const sz = (n: number) => `${Math.round(n).toLocaleString()} sqft`;
    if (r <= 0.002) add("area", `exact_${kind}_${precise}`, `Same size (${sz(a.area)})`);
    else if (r <= 0.015) add("area", "within1.5", "Size within 1.5%");
    else if (r <= 0.05) add("area", "within5", "Size within 5%");
    else if (r <= 0.15) add("area", "within15", `Size ${sz(a.area)} vs ${sz(b.area)}`);
    else add("area", "far", `Size ${sz(a.area)} vs ${sz(b.area)}`);
  }

  if (a.beds != null && b.beds != null) {
    const d = Math.abs(a.beds - b.beds);
    add("beds", d === 0 ? "same" : d === 1 ? "off1" : "off2", d === 0 ? `${a.beds === 0 ? "Studio" : `${a.beds} bed`} both` : `Bedrooms ${a.beds} vs ${b.beds}`);
  }
  if (a.baths && b.baths) {
    const d = Math.abs(a.baths - b.baths);
    add("baths", d === 0 ? "same" : d === 1 ? "off1" : "off2", d === 0 ? "Same bathrooms" : `Bathrooms ${a.baths} vs ${b.baths}`);
  }
  if (a.type && b.type) add("type", a.type === b.type ? "same" : "different", a.type === b.type ? "Same type" : "Different property type");
  if (a.purpose && b.purpose) add("purpose", a.purpose === b.purpose ? "same" : "different", a.purpose === b.purpose ? `Both for ${a.purpose}` : `For ${a.purpose} vs for ${b.purpose}`);

  if (a.community && b.community) {
    if (a.community === b.community) add("community", "same", "Same community");
    else if (a.community.includes(b.community) || b.community.includes(a.community)) add("community", "nested", "Community named at another level");
    else add("community", "different", "Different community");
  }
  if (a.building && b.building && a.building !== a.community && b.building !== b.community) {
    if (a.building === b.building) add("building", "same", "Same building");
    else if (a.building.includes(b.building) || b.building.includes(a.building)) add("building", "nested", "Building named differently");
    else add("building", "different", "Different building");
  }

  if (a.lat != null && b.lat != null) {
    const d = metresBetween(a.lat, a.lng!, b.lat, b.lng!);
    const km = (d / 1000).toFixed(1);
    // Every unit in a tower shares the building's pin, so for apartments the pin says "same building",
    // not "same unit"; it is learned as its own level instead of double-counting the building.
    const kind = a.type === "apartment" || b.type === "apartment" ? "apt" : "house";
    if (d <= 25) add("location", `same_${kind}`, "Same map pin");
    else if (d <= 200) add("location", `near_${kind}`, `Pins ${Math.round(d)} m apart`);
    else if (d <= 1500) add("location", "area", `Pins ${km} km apart`);
    else if (d <= 5000) add("location", "far", `Pins ${km} km apart`);
    else add("location", "veryfar", `Pins ${km} km apart`);
  }

  if (a.price && b.price && a.purpose === b.purpose) {
    const r = rel(a.price, b.price);
    add("price", r <= 0.002 ? "same" : r <= 0.1 ? "within10" : r <= 0.35 ? "within35" : "far", r <= 0.002 ? "Same price" : r <= 0.1 ? "Price within 10%" : "Price differs");
  }
  if (a.agent && b.agent) add("agent", a.agent === b.agent ? "same" : "different", a.agent === b.agent ? "Same agent" : "Different agent");
  if (a.floor && b.floor) add("floor", a.floor === b.floor ? "same" : "different", a.floor === b.floor ? `Floor ${a.floor} both` : `Floor ${a.floor} vs ${b.floor}`);
  return out;
}

/**
 * The model in use: the active one from the server when loaded (see useMatchModel), otherwise the
 * weights shipped with the app. Workers receive it explicitly.
 */
let activeWeights: Record<MatchContext, WeightTable> = MATCH_WEIGHTS;

export function setMatchWeights(w: Record<MatchContext, WeightTable> | null) {
  activeWeights = w ?? MATCH_WEIGHTS;
}

export const getMatchWeights = () => activeWeights;

/** Weighted evidence that `a` and `b` are the same property, under the active model. */
export function scorePair(a: Prepared, b: Prepared, context: MatchContext = "versions"): PairScore {
  return scoreWith(a, b, activeWeights[context], context);
}

/** Same as `scorePair` with an explicit weight table (training compares models with this). */
export function scoreWith(a: Prepared, b: Prepared, table: WeightTable, context: MatchContext = "versions"): PairScore {
  const evidence: Evidence[] = [];
  for (const c of compareLevels(a, b)) {
    const w = table.weights[c.signal]?.[c.level] ?? 0;
    if (w !== 0) evidence.push({ signal: c.signal, weight: w, label: c.label });
  }
  evidence.sort((x, y) => Math.abs(y.weight) - Math.abs(x.weight));
  const score = Math.round(evidence.reduce((n, e) => n + e.weight, 0) * 10) / 10;
  let verdict: Verdict = score >= table.match ? "match" : score >= table.possible ? "possible" : "different";
  // Across agencies, photos are re-shot and copy rewritten, so identical units in one tower look the
  // same on every other field: only a shared permit makes it certain. Without one, a person decides.
  if (context === "agencies" && verdict === "match" && !evidence.some((e) => e.signal === "permit" && e.weight > 0)) verdict = "possible";
  return { score, verdict, evidence };
}

/* ── candidate generation (blocking) ─────────────────────────────────────── */

function blockingKeys(p: Prepared): string[] {
  const keys: string[] = [];
  if (p.permit) keys.push(`p:${p.permit}`);
  for (const id of p.photoIds) keys.push(`d:${id}`);
  let n = 0;
  for (const ph of p.photos) {
    keys.push(`i:${ph}`);
    if (++n >= 4) break;
  }
  if (p.area) keys.push(`a:${p.type}|${Math.round(p.area)}`);
  if (p.community) keys.push(`c:${p.community}|${p.beds ?? "?"}|${p.type}`);
  if (p.lat != null) keys.push(`g:${p.lat.toFixed(3)},${p.lng!.toFixed(3)}|${p.beds ?? "?"}`);
  // MinHash: the three smallest phrase hashes. Listings with mostly the same copy share them,
  // so near-identical descriptions meet even when every other field disagrees.
  const sh = [...p.shingles].sort((x, y) => x - y).slice(0, 3);
  for (const s of sh) keys.push(`s:${s}`);
  return keys;
}

/** Above this size a block is too generic to be worth scoring every pair (e.g. "JVC 1-bed apartments"). */
const MAX_BLOCK = 400;

/** Keys that identify a property on their own; the rest only narrow the field. */
const STRONG_KEY = /^[pdis]:/;

/**
 * Candidate index pairs (i < j) worth scoring: they share a strong key (permit, photo, photo id,
 * rare description phrase) or at least two weak ones (same size, same community+layout, same map
 * cell). Scoring every pair that merely shares a community would be millions of comparisons.
 */
export function candidatePairs(items: Prepared[], include: (a: Prepared, b: Prepared) => boolean): [number, number][] {
  const blocks = new Map<string, number[]>();
  items.forEach((p, i) => {
    for (const k of blockingKeys(p)) {
      const arr = blocks.get(k);
      if (arr) arr.push(i);
      else blocks.set(k, [i]);
    }
  });
  const n = items.length;
  // Per pair: strong hit → Infinity, otherwise number of weak keys shared.
  const hits = new Map<number, number>();
  for (const [k, arr] of blocks) {
    if (arr.length < 2 || arr.length > MAX_BLOCK) continue;
    const strong = STRONG_KEY.test(k);
    for (let x = 0; x < arr.length; x++)
      for (let y = x + 1; y < arr.length; y++) {
        const key = arr[x] * n + arr[y];
        const prev = hits.get(key) ?? 0;
        if (prev !== Infinity) hits.set(key, strong ? Infinity : prev + 1);
      }
  }
  const out: [number, number][] = [];
  for (const [key, h] of hits) {
    if (h < 2) continue;
    const i = Math.floor(key / n);
    const j = key - i * n;
    if (items[i].market === items[j].market && include(items[i], items[j])) out.push([i, j]);
  }
  return out;
}

/* ── one-to-one matching between two sets (versions of a feed) ───────────── */

export type MatchedPair = { a: Listing; b: Listing; score: number; verdict: Verdict; evidence: Evidence[] };

/**
 * Reviewer verdicts, keyed by `pairKey(ids)`. "different" pairs are never linked; "same" pairs are
 * linked whatever their score.
 */
export type MatchOverrides = { same: Set<string>; different: Set<string> };

export const pairKey = (ids: string[]) => [...new Set(ids)].sort().join("|");

const REVIEWED_SAME: Evidence = { signal: "review", weight: 99, label: "Confirmed by a reviewer" };

function applyOverride(o: MatchOverrides | undefined, a: Listing, b: Listing, s: PairScore): PairScore | null {
  if (!o) return s;
  const k = pairKey([a.id, b.id]);
  if (o.different.has(k)) return null;
  if (o.same.has(k)) return { score: Math.max(s.score, 99), verdict: "match", evidence: [REVIEWED_SAME, ...s.evidence] };
  return s;
}

/**
 * Best one-to-one pairing of `before` and `after` listings by score (greedy on descending score,
 * which is near-optimal when good matches are far apart from the rest, as they are here).
 * Returns confident matches and, separately, plausible pairs left for review.
 */
export function matchListingSets(
  before: Listing[],
  after: Listing[],
  context: MatchContext = "versions",
  overrides?: MatchOverrides,
): { matches: MatchedPair[]; possible: MatchedPair[] } {
  if (!before.length || !after.length) return { matches: [], possible: [] };
  const items = prepareListings([
    { group: "A", listings: before },
    { group: "B", listings: after },
  ]);
  const scored: { i: number; j: number; s: PairScore }[] = [];
  for (const [i, j] of candidatePairs(items, (x, y) => x.group !== y.group)) {
    const s = applyOverride(overrides, items[i].listing, items[j].listing, scorePair(items[i], items[j], context));
    if (s && s.verdict !== "different") scored.push(items[i].group === "A" ? { i, j, s } : { i: j, j: i, s });
  }
  // A reviewer's "same" stands even when blocking never proposed the pair.
  if (overrides?.same.size) {
    const idx = new Map(items.map((p, k) => [p.listing.id, k]));
    for (const key of overrides.same) {
      const ids = key.split("|");
      if (ids.length !== 2) continue;
      const [x, y] = ids.map((id) => idx.get(id));
      if (x == null || y == null || items[x].group === items[y].group) continue;
      const [i, j] = items[x].group === "A" ? [x, y] : [y, x];
      if (!scored.some((e) => e.i === i && e.j === j)) scored.push({ i, j, s: { score: 99, verdict: "match", evidence: [REVIEWED_SAME] } });
    }
  }
  scored.sort((x, y) => y.s.score - x.s.score);
  const used = new Set<number>();
  const matches: MatchedPair[] = [];
  const possible: MatchedPair[] = [];
  for (const { i, j, s } of scored) {
    if (used.has(i) || used.has(j)) continue;
    const pair = { a: items[i].listing, b: items[j].listing, ...s };
    if (s.verdict === "match") {
      used.add(i);
      used.add(j);
      matches.push(pair);
    } else possible.push(pair);
  }
  // A "possible" pair whose listing was later claimed by a confident match is no longer open.
  return { matches, possible: possible.filter((p) => !matches.some((m) => m.a === p.a || m.b === p.b)) };
}

/* ── clustering within a pool (same property across agencies) ────────────── */

export type PropertyCluster = {
  items: Prepared[];
  /** Strongest pairwise links inside the cluster, best first. */
  links: { a: Listing; b: Listing; score: number; evidence: Evidence[] }[];
  /** Lowest link score that holds the cluster together (its weakest point). */
  confidence: number;
  verdict: Verdict;
  groups: string[];
};

/**
 * Groups listings that are the same property. Clusters are built from confident links only
 * (single-linkage over `match` edges), with a guard: two listings from the same group can join one
 * cluster only through a direct confident link, so a chain A1–B–A2 cannot silently merge two
 * different units of agency A. Plausible-only links form their own "possible" clusters for review.
 */
export function clusterSameProperty(
  groups: { group: string; listings: Listing[] }[],
  opts: { crossGroupOnly?: boolean; overrides?: MatchOverrides } = {},
): { clusters: PropertyCluster[]; possible: PropertyCluster[]; compared: number } {
  const context: MatchContext = opts.crossGroupOnly ? "agencies" : "versions";
  const items = prepareListings(groups);
  const pairs = candidatePairs(items, (x, y) => !opts.crossGroupOnly || x.group !== y.group);
  const edges: { i: number; j: number; s: PairScore }[] = [];
  for (const [i, j] of pairs) {
    const s = applyOverride(opts.overrides, items[i].listing, items[j].listing, scorePair(items[i], items[j], context));
    if (s && s.verdict !== "different") edges.push({ i, j, s });
  }
  if (opts.overrides?.same.size) {
    const idx = new Map(items.map((p, k) => [p.listing.id, k]));
    const have = new Set(edges.map((e) => `${e.i}:${e.j}`));
    for (const key of opts.overrides.same) {
      const ks = key.split("|").map((id) => idx.get(id)).filter((k): k is number => k != null);
      for (let x = 0; x < ks.length; x++)
        for (let y = x + 1; y < ks.length; y++) {
          const [i, j] = [Math.min(ks[x], ks[y]), Math.max(ks[x], ks[y])];
          if (!have.has(`${i}:${j}`)) edges.push({ i, j, s: { score: 99, verdict: "match", evidence: [REVIEWED_SAME] } });
        }
    }
  }
  edges.sort((x, y) => y.s.score - x.s.score);

  const parent = items.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const members = new Map<number, Set<number>>(items.map((_, i) => [i, new Set([i])]));
  const direct = new Set<string>();
  const strong = edges.filter((e) => e.s.verdict === "match");
  for (const e of strong) direct.add(`${e.i}:${e.j}`);
  const linked = (i: number, j: number) => direct.has(`${Math.min(i, j)}:${Math.max(i, j)}`);

  for (const e of strong) {
    const ri = find(e.i);
    const rj = find(e.j);
    if (ri === rj) continue;
    const A = members.get(ri)!;
    const B = members.get(rj)!;
    let ok = true;
    for (const x of A) {
      for (const y of B) if (items[x].group === items[y].group && !linked(x, y)) ok = false;
      if (!ok) break;
    }
    if (!ok) continue;
    parent[rj] = ri;
    for (const y of B) A.add(y);
    members.delete(rj);
  }

  const build = (idx: number[], es: typeof edges, verdict: Verdict): PropertyCluster => {
    const its = idx.map((i) => items[i]);
    const links = es.map((e) => ({ a: items[e.i].listing, b: items[e.j].listing, score: e.s.score, evidence: e.s.evidence }));
    return {
      items: its,
      links,
      confidence: links.length ? Math.min(...links.map((l) => l.score)) : 0,
      verdict,
      groups: [...new Set(its.map((x) => x.group))].sort((x, y) => x.localeCompare(y)),
    };
  };

  const clusters: PropertyCluster[] = [];
  const inCluster = new Set<number>();
  for (const [root, set] of members) {
    if (set.size < 2) continue;
    const idx = [...set];
    for (const i of idx) inCluster.add(i);
    const es = strong.filter((e) => find(e.i) === root && find(e.j) === root);
    const c = build(idx, es, "match");
    if (!opts.crossGroupOnly || c.groups.length > 1) clusters.push(c);
  }

  // Plausible pairs among listings not already resolved into a confident cluster.
  const possible: PropertyCluster[] = [];
  for (const e of edges) {
    if (e.s.verdict !== "possible" || inCluster.has(e.i) || inCluster.has(e.j)) continue;
    possible.push(build([e.i, e.j], [e], "possible"));
  }

  const order = (x: PropertyCluster, y: PropertyCluster) => y.groups.length - x.groups.length || y.confidence - x.confidence;
  return { clusters: clusters.sort(order), possible: possible.sort((x, y) => y.confidence - x.confidence), compared: pairs.length };
}
