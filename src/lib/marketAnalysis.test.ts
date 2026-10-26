import { describe, expect, it } from "vitest";
import type { Listing } from "@/lib/types";
import { areaSqft, concentration, freshness, grossYieldByCommunity } from "@/lib/marketAnalysis";

const L = (p: Partial<Listing>) => ({ purpose: "sale", price: 0, area: 0, areaUnit: "sqft", beds: 1, community: "A", propertyType: "Apartment", agent: { name: "" }, lastUpdate: "", ...p }) as unknown as Listing;

describe("marketAnalysis", () => {
  it("converts square metres to square feet", () => {
    expect(areaSqft(L({ area: 100, areaUnit: "sqm" }))).toBeCloseTo(1076.39, 1);
    expect(areaSqft(L({ area: 1000, areaUnit: "sqft" }))).toBe(1000);
    expect(areaSqft(L({ area: 5 }))).toBeNull();
  });

  it("computes HHI from listing shares", () => {
    const c = concentration([L({ community: "A" }), L({ community: "A" }), L({ community: "B" }), L({ community: "B" })], (l) => l.community);
    expect(c.hhi).toBeCloseTo(5000);
    expect(c.effective).toBeCloseTo(2);
    expect(c.level).toBe("high");
  });

  it("compares rent and sale like for like for gross yield", () => {
    const sales = [1_000_000, 1_000_000, 1_000_000].map((price) => L({ price }));
    const rents = [70_000, 70_000, 70_000].map((price) => L({ purpose: "rent", price, rentPeriod: "yearly" }));
    const other = L({ purpose: "rent", price: 500_000, beds: 4 });
    const [y] = grossYieldByCommunity([...sales, ...rents, other]);
    expect(y.yieldPct).toBeCloseTo(7);
    expect(y.segments).toBe(1);
  });

  it("buckets listing age", () => {
    const now = Date.parse("2026-10-26T00:00:00Z");
    const f = freshness([L({ lastUpdate: "2026-10-25 10:00:00" }), L({ lastUpdate: "2025-01-01" }), L({})], now);
    expect(f.buckets[0].count).toBe(1);
    expect(f.buckets[5].count).toBe(1);
    expect(f.unknown).toBe(1);
  });
});
