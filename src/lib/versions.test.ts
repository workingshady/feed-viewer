import { describe, expect, it, vi } from "vitest";
import { diffCounts, diffListings } from "@/lib/versionDiff";
import { computeVersionStats, listingQuality } from "@/lib/versionStats";
import { commitVersion, matchSource, type PreparedVersion } from "@/lib/uploadVersion";
import type { SourceDTO } from "@/lib/sourcesApi";
import type { Listing } from "@/lib/types";

const listing = (reference: string, over: Partial<Listing> = {}) =>
  ({ id: reference, reference, title: "Flat", price: 100, images: [], description: "", purpose: "sale", agent: {} , ...over }) as Listing;

const source = (id: string, name: string, agencyName = name) => ({ id, name, agencyName, versions: [] }) as unknown as SourceDTO;

describe("diffListings", () => {
  it("classifies added, removed, changed and duplicates", () => {
    const d = diffListings([listing("a"), listing("b"), listing("c")], [listing("b"), listing("c", { price: 200 }), listing("d"), listing("d")]);
    expect(diffCounts(d)).toEqual({ added: 1, removed: 1, changed: 1 });
    expect(d.changed[0].keys).toEqual(["price"]);
    expect(d.unchangedCount).toBe(1);
    expect(d.duplicates).toEqual(["d"]);
  });
});

describe("quality", () => {
  it("scores a complete listing 100 and an empty one low", () => {
    const full = listing("x", {
      images: ["1", "2", "3", "4", "5"],
      description: "x".repeat(250),
      permitNumber: "P1",
      latitude: 25.2,
      longitude: 55.3,
      agent: { name: "A", phone: "1", email: "", photo: "" },
    });
    expect(listingQuality(full).score).toBe(100);
    expect(listingQuality(listing("y", { images: ["1", "1"] })).failed).toContain("uniquePhotos");
    expect(computeVersionStats([full, listing("z")]).checks.photos).toBe(0.5);
  });
});

describe("matchSource", () => {
  const sources = [source("1", "White & Co", "White & Co Real Estate LLC"), source("2", "Haus")];
  it("matches agency name case- and space-insensitively, then source name", () => {
    expect(matchSource("  white & co  real estate llc", sources)?.id).toBe("1");
    expect(matchSource("HAUS", sources)?.id).toBe("2");
    expect(matchSource(undefined, sources)).toBeNull();
    expect(matchSource("Unknown Agency", sources)).toBeNull();
  });
});

describe("commitVersion", () => {
  const prepared = {
    file: new File(["<x/>"], "feed.xml"),
    xml: "<x/>",
    sha256: "a".repeat(64),
    result: { success: true, listings: [listing("a")], totalCount: 1, warnings: [], errors: [], detectedNodes: [] },
    stats: computeVersionStats([listing("a")]),
    matched: null,
    diff: null,
    mapping: null,
    fingerprint: "",
  } satisfies PreparedVersion;

  it("deletes uploaded blobs when registration fails", async () => {
    const deps = {
      uploadBlob: vi.fn(async (path: string) => ({ url: `https://blob/${path}` })),
      registerVersion: vi.fn(async () => {
        throw new Error("boom");
      }),
      createSource: vi.fn(async () => source("new1", "New")),
      discardUploadedBlobs: vi.fn(async () => ({ ok: true as const })),
    };
    await expect(commitVersion(prepared, { create: { name: "New" } }, deps)).rejects.toThrow("boom");
    expect(deps.createSource).toHaveBeenCalledOnce();
    const paths = deps.uploadBlob.mock.calls.map((c) => c[0]);
    expect(paths[0]).toMatch(/^sources\/new1\/[A-Za-z0-9_-]{16}\/feed\.xml\.gz$/);
    expect(paths[1]).toMatch(/\/listings\.json\.gz$/);
    expect(deps.discardUploadedBlobs).toHaveBeenCalledWith(paths.map((p) => `https://blob/${p}`));
  });
});

describe("source insights", () => {
  it("bands prices by purpose and finds price moves", async () => {
    const { priceBands, priceMoves, bedroomMix } = await import("@/lib/sourceInsights");
    const sale = [listing("a", { price: 400_000 }), listing("b", { price: 2_500_000 }), listing("c", { price: 12_000_000 })];
    const bands = priceBands([...sale, listing("r", { purpose: "rent", price: 90_000 })], "sale");
    expect(bands.map((b) => b.count)).toEqual([1, 0, 0, 1, 0, 0, 1]);
    expect(bedroomMix([listing("s", { beds: 0 }), listing("t", { beds: 7 })]).map((b) => b.count)).toEqual([1, 0, 0, 0, 0, 1]);
    const moves = priceMoves(diffListings(sale, [listing("a", { price: 440_000 }), listing("b", { price: 2_000_000 }), sale[2]]));
    expect(moves.up.map((m) => m.listing.reference)).toEqual(["a"]);
    expect(moves.down[0].pct).toBeCloseTo(-0.2);
  });
});
