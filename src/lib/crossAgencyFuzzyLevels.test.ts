import { describe, it, expect } from "vitest";
import type { CrossAgencyCluster } from "@/lib/crossAgencyDuplicates";
import {
  countFuzzyClustersPerNoiseLevel,
  explainedListingIdsForFuzzyLevel,
  filterFuzzyClustersByNoiseLevel,
  FUZZY_NOISE_FILTER_LEVELS,
  fuzzyNoiseLevelFromLegacy,
} from "./crossAgencyFuzzyLevels";

function cluster(listingIds: string[]): CrossAgencyCluster {
  return {
    tier: "fuzzy",
    matchKey: "k",
    matchLabel: "x",
    confidence: "review",
    agencies: listingIds.map(() => "Agency"),
    items: listingIds.map((id) => ({
      agencyName: "A",
      sessionId: "s",
      listing: { id } as any,
    })),
  };
}

// Minimal cross-agency cluster for permit (needs 2 agencies — use two items)
function permitCluster(ids: [string, string]): CrossAgencyCluster {
  return {
    tier: "permit",
    matchKey: "P1",
    matchLabel: "x",
    confidence: "high",
    agencies: ["A", "B"],
    items: [
      { agencyName: "A", sessionId: "s", listing: { id: ids[0] } as any },
      { agencyName: "B", sessionId: "s", listing: { id: ids[1] } as any },
    ],
  };
}

describe("crossAgencyFuzzyLevels", () => {
  it("fuzzyNoiseLevelFromLegacy maps old boolean", () => {
    expect(fuzzyNoiseLevelFromLegacy(undefined, undefined)).toBe("off");
    expect(fuzzyNoiseLevelFromLegacy(true, undefined)).toBe("minus_permit_geo_image");
    expect(fuzzyNoiseLevelFromLegacy(false, "minus_layout")).toBe("minus_layout");
    expect(fuzzyNoiseLevelFromLegacy(false, "minus_content")).toBe("minus_content");
  });

  it("filterFuzzyClustersByNoiseLevel removes only fully-explained clusters at strong level", () => {
    const report = {
      permitClusters: [permitCluster(["a", "b"])],
      geoClusters: [] as CrossAgencyCluster[],
      geoWideClusters: [] as CrossAgencyCluster[],
      imageUrlClusters: [] as CrossAgencyCluster[],
      buildingClusters: [] as CrossAgencyCluster[],
      layoutClusters: [] as CrossAgencyCluster[],
      contentClusters: [] as CrossAgencyCluster[],
      contentNoDescClusters: [] as CrossAgencyCluster[],
      contentNearClusters: [] as CrossAgencyCluster[],
    };
    const fuzzy = [
      cluster(["a", "c"]),
      cluster(["x", "y"]),
    ];
    const out = filterFuzzyClustersByNoiseLevel(fuzzy, "minus_permit_geo_image", report);
    expect(out.map((c) => c.items.map((t) => t.listing.id))).toEqual([
      ["a", "c"],
      ["x", "y"],
    ]);
  });

  it("countFuzzyClustersPerNoiseLevel matches filter length for each level", () => {
    const report = {
      permitClusters: [permitCluster(["a", "b"])],
      geoClusters: [] as CrossAgencyCluster[],
      geoWideClusters: [] as CrossAgencyCluster[],
      imageUrlClusters: [] as CrossAgencyCluster[],
      buildingClusters: [] as CrossAgencyCluster[],
      layoutClusters: [] as CrossAgencyCluster[],
      contentClusters: [] as CrossAgencyCluster[],
      contentNoDescClusters: [] as CrossAgencyCluster[],
      contentNearClusters: [] as CrossAgencyCluster[],
    };
    const fuzzy = [
      cluster(["a", "c"]),
      cluster(["x", "y"]),
    ];
    const counts = countFuzzyClustersPerNoiseLevel(fuzzy, report);
    for (const level of FUZZY_NOISE_FILTER_LEVELS) {
      expect(counts[level]).toBe(filterFuzzyClustersByNoiseLevel(fuzzy, level, report).length);
    }
  });

  it("explainedListingIdsForFuzzyLevel grows with level", () => {
    const report = {
      permitClusters: [permitCluster(["a", "b"])],
      geoClusters: [] as CrossAgencyCluster[],
      geoWideClusters: [] as CrossAgencyCluster[],
      imageUrlClusters: [] as CrossAgencyCluster[],
      buildingClusters: [
        {
          tier: "building" as const,
          matchKey: "b",
          matchLabel: "b",
          confidence: "medium_low" as const,
          agencies: ["A", "B"],
          items: [
            { agencyName: "A", sessionId: "s", listing: { id: "u1" } as any },
            { agencyName: "B", sessionId: "s", listing: { id: "u2" } as any },
          ],
        },
      ],
      layoutClusters: [] as CrossAgencyCluster[],
      contentClusters: [] as CrossAgencyCluster[],
      contentNoDescClusters: [] as CrossAgencyCluster[],
      contentNearClusters: [] as CrossAgencyCluster[],
    };
    const s1 = explainedListingIdsForFuzzyLevel("minus_permit_geo_image", report);
    const s3 = explainedListingIdsForFuzzyLevel("minus_building", report);
    expect(s3.has("u1")).toBe(true);
    expect(s1.has("u1")).toBe(false);
  });

  it("explainedListingIdsForFuzzyLevel adds content only at minus_content", () => {
    const report = {
      permitClusters: [] as CrossAgencyCluster[],
      geoClusters: [] as CrossAgencyCluster[],
      geoWideClusters: [] as CrossAgencyCluster[],
      imageUrlClusters: [] as CrossAgencyCluster[],
      buildingClusters: [] as CrossAgencyCluster[],
      layoutClusters: [cluster(["lay1", "lay2"])],
      contentClusters: [cluster(["cnt1", "cnt2"])],
      contentNoDescClusters: [cluster(["nd1", "nd2"])],
      contentNearClusters: [cluster(["nr1", "nr2"])],
    };
    const minusLayout = explainedListingIdsForFuzzyLevel("minus_layout", report);
    expect(minusLayout.has("cnt1")).toBe(false);
    const minusContent = explainedListingIdsForFuzzyLevel("minus_content", report);
    expect(minusContent.has("cnt1")).toBe(true);
    expect(minusContent.has("lay1")).toBe(true);
    expect(minusContent.has("nd1")).toBe(true);
    expect(minusContent.has("nr1")).toBe(true);
  });
});
