import { describe, it, expect } from "vitest";
import { computeFilteredPriceStats } from "./listingsFilteredStats";
import type { Listing } from "./types";

function minimal(overrides: Partial<Listing>): Listing {
  return {
    id: "x",
    title: "",
    description: "",
    reference: "",
    price: 0,
    currency: "AED",
    priceOnApplication: "",
    paymentMethod: "",
    downPaymentPrice: 0,
    serviceCharge: 0,
    cheques: "",
    purpose: "sale",
    propertyType: "",
    beds: 0,
    baths: 0,
    area: 0,
    areaUnit: "sqft",
    plotSize: 0,
    community: "",
    city: "",
    address: "",
    subCommunity: "",
    propertyName: "",
    developer: "",
    buildYear: "",
    floor: "",
    stories: "",
    latitude: null,
    longitude: null,
    images: [],
    amenities: [],
    view360: "",
    videoTourUrl: "",
    floorPlanUrl: "",
    agent: { name: "", phone: "", email: "", photo: "" },
    rawXml: "",
    furnished: "",
    parking: 0,
    completionStatus: "",
    permitNumber: "",
    lastUpdate: "",
    ...overrides,
  };
}

describe("computeFilteredPriceStats", () => {
  it("returns null stats when no prices", () => {
    const s = computeFilteredPriceStats([minimal({ price: 0 }), minimal({ id: "b", price: 0 })]);
    expect(s.count).toBe(2);
    expect(s.pricedCount).toBe(0);
    expect(s.avg).toBeNull();
  });

  it("computes avg min max", () => {
    const s = computeFilteredPriceStats([
      minimal({ id: "a", price: 100_000 }),
      minimal({ id: "b", price: 300_000 }),
    ]);
    expect(s.pricedCount).toBe(2);
    expect(s.avg).toBe(200_000);
    expect(s.min).toBe(100_000);
    expect(s.max).toBe(300_000);
    expect(s.currency).toBe("AED");
  });
});
