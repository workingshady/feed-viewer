import type { Listing } from "@/lib/types";
import { valuePattern } from "@/lib/dataProfile";

/**
 * Profile of every element and attribute path in the raw feed XML (nested paths included):
 * how often it appears and is filled, its inferred type, distinct values, formats, examples, how
 * many times it repeats inside one listing, and whether the app actually uses its data.
 *
 * "Used" is measured, not configured: a path counts as used when its values show up in the fields
 * the app parsed for the same listings. Paths with data that never reach a field are data the feed
 * sends but the app ignores, which is usually a mapping opportunity.
 */

export type XmlValueType = "number" | "date" | "url" | "email" | "boolean" | "text";

export type XmlPathStat = {
  path: string;
  /** Path without the listing root, e.g. "agent.phone" or "price@period". */
  short: string;
  depth: number;
  isAttribute: boolean;
  listingsWithPath: number;
  listingsWithValue: number;
  /** % of sampled listings where the path has a value. */
  fillPct: number;
  /** % of appearances that carry a value (empty tags drag this down). */
  filledWhenPresentPct: number;
  /** Most frequent value type and the share of values that have it. */
  type: XmlValueType;
  typeShare: number;
  mixedTypes: boolean;
  distinct: number;
  distinctCapped: boolean;
  examples: string[];
  topPatterns: { pattern: string; count: number }[];
  /** Highest number of times the path occurs inside one listing (>1 = repeated element). */
  maxRepeat: number;
  /** Share of valued listings whose value appears in the parsed listing fields. */
  usedPct: number;
  warnings: string[];
};

export type XmlProfile = {
  sampleSize: number;
  totalListings: number;
  skippedNoXml: number;
  paths: XmlPathStat[];
  /** Paths that carry data in the sample but whose values never reach a parsed field. */
  unusedWithData: number;
};

const MAX_DISTINCT = 500;

/** `container` entries have child elements: only their attributes are profiled, not an empty value. */
type FlatEntry = { path: string; value: string; attributes: Record<string, string>; container?: boolean };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => (e[0] === "#" ? String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e.toLowerCase()] ?? m));

/**
 * Fast, dependency-free flattening of one listing's XML into leaf paths ("property.agent.phone")
 * with text and attributes. Works in Web Workers (no DOMParser) and is many times faster, so every
 * listing of a large feed can be profiled instead of a sample.
 */
export function flattenXmlFast(xml: string, rootName = "property"): FlatEntry[] {
  const out: FlatEntry[] = [];
  const stack: { name: string; text: string; attrs: Record<string, string>; hasChild: boolean }[] = [];
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<(\/?)([A-Za-z_][\w:.-]*)([^>]*?)(\/?)>|([^<]+)/g;
  const pathOf = () => [rootName, ...stack.slice(1).map((e) => e.name)].join(".");
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    if (m[1] !== undefined) {
      if (stack.length) stack[stack.length - 1].text += m[1];
    } else if (m[3]) {
      const [, , close, name, attrSrc, selfClose] = m;
      if (close) {
        const top = stack.pop();
        if (!top) continue;
        const path = [rootName, ...stack.slice(1).map((e) => e.name), ...(stack.length ? [top.name] : [])].join(".");
        if (!top.hasChild || Object.keys(top.attrs).length) out.push({ path: stack.length ? path : rootName, value: top.hasChild ? "" : decode(top.text.trim()), attributes: top.attrs, container: top.hasChild });
        if (stack.length) stack[stack.length - 1].hasChild = true;
      } else {
        const attrs: Record<string, string> = {};
        for (const a of attrSrc.matchAll(/([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) attrs[a[1]] = decode(a[3] ?? a[4] ?? "");
        if (stack.length) stack[stack.length - 1].hasChild = true;
        if (selfClose) {
          out.push({ path: stack.length ? `${pathOf()}.${name}` : rootName, value: "", attributes: attrs });
        } else stack.push({ name, text: "", attrs, hasChild: false });
      }
    } else if (m[6] !== undefined && stack.length) {
      stack[stack.length - 1].text += m[6];
    }
  }
  return out;
}

function typeOf(v: string): XmlValueType {
  const s = v.trim();
  if (/^-?\d+(\.\d+)?$/.test(s.replace(/,/g, ""))) return "number";
  if (/^(true|false|yes|no)$/i.test(s)) return "boolean";
  if (/^https?:\/\//i.test(s)) return "url";
  if (/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(s)) return "email";
  if (/^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?/.test(s)) return "date";
  return "text";
}

const norm = (v: string) => {
  const s = v.trim().toLowerCase();
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) && s !== "" ? String(Math.round(n * 100) / 100) : s.replace(/\s+/g, " ");
};

/** Every value the parser put into a listing, normalised, to trace which XML values were used. */
function parsedValues(l: Listing): Set<string> {
  const out = new Set<string>();
  const add = (v: unknown) => {
    if (v == null) return;
    if (Array.isArray(v)) for (const x of v) add(x);
    else if (typeof v === "object") for (const x of Object.values(v as Record<string, unknown>)) add(x);
    else {
      const s = String(v).trim();
      if (s) out.add(norm(s));
    }
  };
  for (const [k, v] of Object.entries(l)) if (k !== "rawXml" && k !== "id") add(v);
  return out;
}

/** Evenly spaced sample across the whole feed (feeds are often sorted, so the first N are not representative). */
function evenSample<T>(xs: T[], max: number): T[] {
  if (xs.length <= max) return xs;
  const step = xs.length / max;
  return Array.from({ length: max }, (_, i) => xs[Math.floor(i * step)]);
}

export function profileXmlPaths(listings: Listing[], maxListings = Infinity, onProgress?: (done: number, total: number) => void): XmlProfile {
  const sample = Number.isFinite(maxListings) ? evenSample(listings, maxListings) : listings;
  type Acc = {
    withPath: number;
    withValue: number;
    appearances: number;
    filledAppearances: number;
    types: Map<XmlValueType, number>;
    distinct: Set<string>;
    examples: string[];
    patterns: Map<string, number>;
    maxRepeat: number;
    used: number;
  };
  const acc = new Map<string, Acc>();
  let skipped = 0;
  let root = "";

  let done = 0;
  for (const l of sample) {
    if (onProgress && ++done % 500 === 0) onProgress(done, sample.length);
    if (!l.rawXml?.trim()) {
      skipped++;
      continue;
    }
    const flat = flattenXmlFast(l.rawXml, "property");
    if (!flat.length) {
      skipped++;
      continue;
    }
    root ||= "property";
    const parsed = parsedValues(l);
    // path → values found in this listing
    const here = new Map<string, string[]>();
    const push = (p: string, v: string) => {
      const arr = here.get(p);
      if (arr) arr.push(v);
      else here.set(p, [v]);
    };
    for (const e of flat) {
      if (!e.container) push(e.path, e.value);
      for (const [name, val] of Object.entries(e.attributes)) push(`${e.path}@${name}`, val);
    }
    for (const [p, values] of here) {
      let a = acc.get(p);
      if (!a) {
        a = { withPath: 0, withValue: 0, appearances: 0, filledAppearances: 0, types: new Map(), distinct: new Set(), examples: [], patterns: new Map(), maxRepeat: 0, used: 0 };
        acc.set(p, a);
      }
      a.withPath++;
      a.appearances += values.length;
      a.maxRepeat = Math.max(a.maxRepeat, values.length);
      const filled = values.map((v) => v.trim()).filter(Boolean);
      a.filledAppearances += filled.length;
      if (!filled.length) continue;
      a.withValue++;
      let usedHere = false;
      for (const v of filled) {
        const t = typeOf(v);
        a.types.set(t, (a.types.get(t) ?? 0) + 1);
        if (a.distinct.size < MAX_DISTINCT) a.distinct.add(v);
        if (a.examples.length < 3 && !a.examples.includes(v)) a.examples.push(v.slice(0, 80));
        if (t !== "url" && v.length <= 60) {
          const pat = valuePattern(v);
          a.patterns.set(pat, (a.patterns.get(pat) ?? 0) + 1);
        }
        if (!usedHere && parsed.has(norm(v))) usedHere = true;
        if (!usedHere && /[,|;]/.test(v)) {
          const parts = v.split(/[,|;]/).map((x) => norm(x)).filter(Boolean);
          if (parts.length > 1 && parts.every((x) => parsed.has(x))) usedHere = true;
        }
      }
      // Long text and URLs are matched loosely: the parser may trim or rebuild them.
      if (!usedHere) {
        const first = norm(filled[0]);
        if (first.length > 40) for (const pv of parsed) if (pv.length > 40 && (pv.includes(first.slice(0, 40)) || first.includes(pv.slice(0, 40)))) { usedHere = true; break; }
      }
      if (usedHere) a.used++;
    }
  }

  const n = sample.length - skipped || 1;
  const paths: XmlPathStat[] = [];
  for (const [path, a] of acc) {
    const types = [...a.types.entries()].sort((x, y) => y[1] - x[1]);
    const totalTyped = types.reduce((s, [, c]) => s + c, 0) || 1;
    const short = path.startsWith(`${root}.`) ? path.slice(root.length + 1) : path;
    const isAttribute = path.includes("@");
    const fillPct = (a.withValue / n) * 100;
    const usedPct = a.withValue ? (a.used / a.withValue) * 100 : 0;
    const typeShare = (types[0]?.[1] ?? 0) / totalTyped;
    const warnings: string[] = [];
    if (!a.withValue) warnings.push("Always empty");
    else if (usedPct < 20) warnings.push("Has data the app does not use");
    if (a.withValue && typeShare < 0.9 && types.length > 1) warnings.push(`Mixed types (${types.map(([t]) => t).join(" / ")})`);
    if (a.withPath / n < 0.5 && a.withPath / n > 0) warnings.push(`Only in ${Math.round((a.withPath / n) * 100)}% of listings`);
    if (a.withPath && a.filledAppearances / Math.max(1, a.appearances) < 0.5 && a.withValue) warnings.push("Often present but empty");
    paths.push({
      path,
      short,
      depth: short.split(/[.@]/).length,
      isAttribute,
      listingsWithPath: a.withPath,
      listingsWithValue: a.withValue,
      fillPct,
      filledWhenPresentPct: a.appearances ? (a.filledAppearances / a.appearances) * 100 : 0,
      type: types[0]?.[0] ?? "text",
      typeShare,
      mixedTypes: types.length > 1 && typeShare < 0.9,
      distinct: a.distinct.size,
      distinctCapped: a.distinct.size >= MAX_DISTINCT,
      examples: a.examples,
      topPatterns: [...a.patterns.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4).map(([pattern, count]) => ({ pattern, count })),
      maxRepeat: a.maxRepeat,
      usedPct,
      warnings,
    });
  }
  paths.sort((x, y) => x.short.localeCompare(y.short));
  return {
    sampleSize: sample.length,
    totalListings: listings.length,
    skippedNoXml: skipped,
    paths,
    unusedWithData: paths.filter((p) => p.listingsWithValue > 0 && p.usedPct < 20).length,
  };
}

export type XmlTreeNode = { name: string; full: string; stat: XmlPathStat | null; children: XmlTreeNode[]; descendants: number };

/** Nests "a.b.c" / "a.b@attr" paths into a tree for display. */
export function buildXmlTree(paths: XmlPathStat[]): XmlTreeNode[] {
  const root: XmlTreeNode = { name: "", full: "", stat: null, children: [], descendants: 0 };
  for (const p of paths) {
    const parts = p.short.split(".");
    const last = parts.pop()!;
    const [elem, attr] = last.split("@");
    const segs = [...parts, elem, ...(attr ? [`@${attr}`] : [])];
    let node = root;
    let full = "";
    for (const s of segs) {
      full = full ? (s.startsWith("@") ? `${full}${s}` : `${full}.${s}`) : s;
      let child = node.children.find((c) => c.name === s);
      if (!child) {
        child = { name: s, full, stat: null, children: [], descendants: 0 };
        node.children.push(child);
      }
      node.descendants++;
      node = child;
    }
    node.stat = p;
  }
  return root.children;
}
