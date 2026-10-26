/// <reference lib="webworker" />
import { clusterSameProperty, setMatchWeights, type MatchContext, type MatchOverrides } from "@/lib/propertyMatch";
import type { WeightTable } from "@/lib/propertyMatchWeights";
import type { Listing } from "@/lib/types";

/**
 * Finds the same property across agencies off the main thread (tens of thousands of listings take a
 * few seconds to compare). Results go back as indexes into the posted groups, so listings are not
 * cloned twice.
 */
export type SamePropertyRequest = {
  groups: { group: string; listings: Listing[] }[];
  /** The active model (workers do not share the page's module state). */
  weights: Record<MatchContext, WeightTable>;
  overrides: MatchOverrides;
};

export type WireLink = { a: [number, number]; b: [number, number]; score: number; evidence: { signal: string; weight: number; label: string }[] };
export type WireCluster = { items: [number, number][]; links: WireLink[]; confidence: number; verdict: "match" | "possible" };
export type SamePropertyResponse = { clusters: WireCluster[]; possible: WireCluster[]; compared: number; ms: number } | { error: string };

self.onmessage = (e: MessageEvent<SamePropertyRequest>) => {
  const t = performance.now();
  try {
    const { groups, weights, overrides } = e.data;
    setMatchWeights(weights);
    const index = new Map<Listing, [number, number]>();
    groups.forEach((g, gi) => g.listings.forEach((l, li) => index.set(l, [gi, li])));
    const res = clusterSameProperty(groups, { crossGroupOnly: true, overrides });
    const wire = (c: (typeof res.clusters)[number]): WireCluster => ({
      items: c.items.map((x) => index.get(x.listing)!),
      links: c.links.map((l) => ({ a: index.get(l.a)!, b: index.get(l.b)!, score: l.score, evidence: l.evidence })),
      confidence: c.confidence,
      verdict: c.verdict === "match" ? "match" : "possible",
    });
    const out: SamePropertyResponse = {
      clusters: res.clusters.map(wire),
      possible: res.possible.map(wire),
      compared: res.compared,
      ms: Math.round(performance.now() - t),
    };
    (self as unknown as Worker).postMessage(out);
  } catch (err) {
    (self as unknown as Worker).postMessage({ error: err instanceof Error ? err.message : String(err) } satisfies SamePropertyResponse);
  }
};
