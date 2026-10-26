import { describe, expect, it } from "vitest";
import { detectGeoOutliers, geoOutliersCsv } from "@/lib/geoOutliers";
import type { Listing } from "@/lib/types";

let n = 0;
const L = (lat: number, lng: number, p: Partial<Listing> = {}) =>
  ({
    id: `x${n++}`,
    reference: `R${n}`,
    title: "t",
    purpose: "sale",
    propertyType: "Apartment",
    price: 1_000_000,
    area: 1000,
    areaUnit: "sqft",
    currency: "AED",
    country: "AE",
    community: "Marina",
    city: "Dubai",
    images: [],
    latitude: lat,
    longitude: lng,
    ...p,
  }) as unknown as Listing;

/** A tight cluster of normal listings around a point. */
const cluster = (lat: number, lng: number, count: number, p: Partial<Listing> = {}) =>
  Array.from({ length: count }, (_, i) => L(lat + ((i % 5) - 2) * 0.002, lng + (Math.floor(i / 5) - 2) * 0.002, p));

const kinds = (r: ReturnType<typeof detectGeoOutliers>, l: Listing) => r.byId.get(l.id)?.flags.map((f) => f.kind) ?? [];

describe("detectGeoOutliers", () => {
  it("finds placeholder, swapped and out-of-country pins", () => {
    const base = cluster(25.08, 55.14, 25);
    const zero = L(0, 0);
    const swapped = L(55.14, 25.08);
    const abroad = L(48.85, 2.35);
    const r = detectGeoOutliers([...base, zero, swapped, abroad]);
    expect(kinds(r, zero)).toContain("zero");
    expect(kinds(r, swapped)).toContain("swapped");
    expect(kinds(r, abroad)).toContain("outside_market");
    expect(base.every((l) => !r.byId.has(l.id))).toBe(true);
  });

  it("flags a pin far from its own community", () => {
    const marina = cluster(25.08, 55.14, 20);
    const stray = L(25.2, 55.4); // ~28 km away, still in the UAE
    const r = detectGeoOutliers([...marina, stray]);
    expect(kinds(r, stray)).toContain("wrong_community");
  });

  it("flags a price far from nearby similar listings", () => {
    const area = cluster(25.08, 55.14, 20);
    const cheap = L(25.081, 55.141, { price: 100_000 });
    const r = detectGeoOutliers([...area, cheap]);
    const o = r.byId.get(cheap.id)!;
    expect(o.flags.map((f) => f.kind)).toContain("price_vs_neighbours");
    expect(o.ppsfRatio).toBeCloseTo(0.1, 2);
  });

  it("judges each market on its own: mixed UAE and Singapore listings are not outliers", () => {
    const ae = cluster(25.08, 55.14, 25);
    const sg = cluster(1.3, 103.85, 25, { country: "SG", currency: "SGD", community: "Orchard", city: "Singapore" });
    const r = detectGeoOutliers([...ae, ...sg]);
    expect(r.byId.size).toBe(0);
    expect(r.clusters.map((c) => c.code).sort()).toEqual(["AE", "SG"]);
  });

  it("writes every outlier to CSV with its reasons", () => {
    const r = detectGeoOutliers([...cluster(25.08, 55.14, 25), L(0, 0)]);
    const csv = geoOutliersCsv([...r.byId.values()]);
    expect(csv.split("\n")).toHaveLength(2);
    expect(csv).toContain("Placeholder (0, 0)");
  });
});
