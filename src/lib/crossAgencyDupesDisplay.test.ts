import { describe, it, expect } from "vitest";
import type { CrossAgencyCluster } from "@/lib/crossAgencyDuplicates";
import {
  applyClusterDisplayPipeline,
  buildVisibleClustersSummary,
  clusterMatchesQuery,
  filterClustersByConfidence,
  filterClustersByMinAgencies,
  filterClustersByMinListings,
  sortClusters,
} from "./crossAgencyDupesDisplay";

function cluster(partial: Partial<CrossAgencyCluster> & Pick<CrossAgencyCluster, "matchKey" | "matchLabel">): CrossAgencyCluster {
  return {
    tier: "fuzzy",
    confidence: "review",
    agencies: ["A", "B"],
    items: [],
    ...partial,
  };
}

describe("crossAgencyDupesDisplay", () => {
  it("filterClustersByMinAgencies keeps 2+ by default and filters 3+", () => {
    const a = cluster({ matchKey: "a", matchLabel: "a", agencies: ["X", "Y"] });
    const b = cluster({ matchKey: "b", matchLabel: "b", agencies: ["X", "Y", "Z"] });
    expect(filterClustersByMinAgencies([a, b], 2)).toHaveLength(2);
    expect(filterClustersByMinAgencies([a, b], 3)).toEqual([b]);
  });

  it("filterClustersByMinListings respects minimum listing count", () => {
    const small = cluster({
      matchKey: "s",
      matchLabel: "s",
      items: [{ agencyName: "A", sessionId: "1", listing: { id: "1" } as any }, { agencyName: "B", sessionId: "1", listing: { id: "2" } as any }],
    });
    const big = cluster({
      matchKey: "b",
      matchLabel: "b",
      items: [
        { agencyName: "A", sessionId: "1", listing: { id: "1" } as any },
        { agencyName: "B", sessionId: "1", listing: { id: "2" } as any },
        { agencyName: "C", sessionId: "1", listing: { id: "3" } as any },
      ],
    });
    expect(filterClustersByMinListings([small, big], 3)).toEqual([big]);
  });

  it("filterClustersByConfidence excludes review when asked", () => {
    const hi = cluster({ matchKey: "h", matchLabel: "h", confidence: "high" });
    const rev = cluster({ matchKey: "r", matchLabel: "r", confidence: "review" });
    expect(filterClustersByConfidence([hi, rev], "exclude_review")).toEqual([hi]);
    expect(filterClustersByConfidence([hi, rev], "high_only")).toEqual([hi]);
  });

  it("sortClusters default preserves order", () => {
    const c1 = cluster({ matchKey: "z", matchLabel: "z" });
    const c2 = cluster({ matchKey: "a", matchLabel: "a" });
    expect(sortClusters([c1, c2], "default")).toEqual([c1, c2]);
  });

  it("sortClusters agencies sorts by agency count", () => {
    const mkItem = (id: string) => ({
      agencyName: "A",
      sessionId: "s",
      listing: { id, title: "t" } as any,
    });
    const a = cluster({ matchKey: "a", matchLabel: "a", agencies: ["A", "B"], items: [mkItem("1"), mkItem("2"), mkItem("3")] });
    const b = cluster({
      matchKey: "b",
      matchLabel: "b",
      agencies: ["A", "B", "C", "D"],
      items: [mkItem("4"), mkItem("5")],
    });
    const out = sortClusters([a, b], "agencies");
    expect(out[0]).toBe(b);
    expect(out[1]).toBe(a);
  });

  it("clusterMatchesQuery uses AND across words", () => {
    const c = cluster({
      matchKey: "k",
      matchLabel: "Marina View Tower",
      agencies: ["Foo Realty"],
      items: [{ agencyName: "Foo Realty", sessionId: "s", listing: { id: "1", title: "Studio special" } as any }],
    });
    expect(clusterMatchesQuery(c, "marina tower")).toBe(true);
    expect(clusterMatchesQuery(c, "marina missing")).toBe(false);
    expect(clusterMatchesQuery(c, "  ")).toBe(true);
  });

  it("applyClusterDisplayPipeline composes filters then search", () => {
    const item = (id: string) => ({ agencyName: "A", sessionId: "s", listing: { id, title: "x" } as any });
    const x = cluster({
      matchKey: "mk",
      matchLabel: "Alpha project",
      agencies: ["A", "B", "C"],
      confidence: "high",
      items: [item("1"), item("2"), item("3")],
    });
    const y = cluster({
      matchKey: "other",
      matchLabel: "Beta",
      agencies: ["A", "B"],
      confidence: "review",
      items: [item("4"), item("5")],
    });
    const out = applyClusterDisplayPipeline([x, y], {
      minAgencies: 3,
      minListings: 3,
      confidence: "all",
      sort: "default",
      query: "alpha",
    });
    expect(out).toEqual([x]);
  });

  it("buildVisibleClustersSummary includes cluster lines", () => {
    const text = buildVisibleClustersSummary({
      signalLabel: "Permit",
      clusters: [
        cluster({
          matchKey: "P1",
          matchLabel: "Test",
          tier: "permit",
          confidence: "high",
          agencies: ["A", "B"],
          items: [] as any,
        }),
      ],
    });
    expect(text).toContain("Permit");
    expect(text).toContain("Test");
    expect(text).toContain("P1");
  });
});
