import { describe, expect, it, vi } from "vitest";
import { diffCounts, diffListings } from "@/lib/versionDiff";
import { computeVersionStats, listingQuality } from "@/lib/versionStats";
import { commitVersion, detectSource, matchSource, type PreparedVersion } from "@/lib/uploadVersion";
import { checkFeed } from "@/lib/feedValidation";
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

  it("detects by website, legal-suffix-free name and file name", () => {
    const withSite = [{ ...source("3", "Aston Premium Real Estate"), agencyInfo: { name: "", logo: "", email: "", phone: "", website: "https://www.astonpremium.ae/" } }, ...sources];
    expect(detectSource("Different Name", withSite, { website: "astonpremium.ae" })?.by).toBe("website");
    expect(detectSource("White & Co Real Estate L.L.C", sources)?.source.id).toBe("1");
    expect(detectSource(undefined, sources, { fileName: "white_and_co.xml" })?.by).toBe("file name");
  });

  it("does not fuzzy-match when two sources share the same core name", () => {
    const twins = [source("a", "Elite Properties"), source("b", "Elite Estates")];
    expect(detectSource("Elite Real Estate LLC", twins)).toBeNull();
  });
});

describe("commitVersion", () => {
  const prepared = {
    file: new File(["<x/>"], "feed.xml"),
    xml: "<x/>",
    sha256: "a".repeat(64),
    result: { success: true, listings: [listing("a")], totalCount: 1, warnings: [], errors: [], detectedNodes: [] },
    stats: computeVersionStats([listing("a")]),
    checks: checkFeed([listing("a")]),
    matched: null,
    matchedBy: null,
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

describe("diff engine", () => {
  it("ignores noise: photo order/query strings, whitespace, case of references, new agent fields, lastUpdate", () => {
    const a = listing("REF-1", { images: ["https://x/1.jpg?v=1", "https://x/2.jpg"], title: "Nice  flat", lastUpdate: "2026-01-01", agent: { name: "Sara", phone: "+971 50 1", email: "S@x.ae", photo: "" } });
    const b = listing("ref-1 ", { images: ["https://x/2.jpg", "https://x/1.jpg?v=2"], title: "Nice flat", lastUpdate: "2026-02-01", agent: { name: "sara", phone: "+971501", email: "s@x.ae", photo: "", licenseNo: "123" } });
    const d = diffListings([a], [b]);
    expect(diffCounts(d)).toEqual({ added: 0, removed: 0, changed: 0 });
    expect(d.unchangedCount).toBe(1);
  });

  it("detects a re-posted listing under a new reference", () => {
    const photos = ["a", "b", "c", "d"].map((x) => `https://cdn.x/p/${x}.jpg`);
    const description = "Bright two bedroom apartment on a high floor with full sea view, upgraded kitchen, two parking spaces and direct beach access in JBR";
    const base = { purpose: "sale" as const, propertyType: "Apartment", community: "JBR", beds: 2, baths: 3, area: 1234.5, images: photos, title: "Sea view 2BR in JBR", description };
    const d = diffListings([listing("OLD-1", { ...base, price: 2_000_000 })], [listing("NEW-9", { ...base, price: 1_950_000 })]);
    expect(d.added).toHaveLength(0);
    expect(d.removed).toHaveLength(0);
    expect(d.relisted[0]).toMatchObject({ before: { reference: "OLD-1" }, after: { reference: "NEW-9" }, keys: ["reference", "price"] });
    expect(d.relisted[0].signals.join(" ")).toMatch(/identical photos/);
  });
});
