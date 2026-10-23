import { describe, it, expect } from "vitest";
import {
  crossAgencyContentMatchKey,
  crossAgencyContentMatchKeyNoDesc,
  crossAgencyContentNearMatchKey,
} from "./crossAgencyDuplicates";
import type { Listing } from "@/lib/types";

function baseListing(over: Partial<Listing>): Listing {
  return {
    id: "1",
    reference: "r",
    title: "",
    description: "",
    price: 0,
    priceOnApplication: "",
    currency: "AED",
    paymentMethod: "",
    downPaymentPrice: 0,
    serviceCharge: 0,
    cheques: "",
    purpose: "sale",
    propertyType: "Apartment",
    beds: 2,
    baths: 2,
    area: 1200,
    areaUnit: "sqft",
    plotSize: 0,
    community: "Palm",
    city: "Dubai",
    address: "Tower A",
    subCommunity: "",
    propertyName: "",
    developer: "",
    buildYear: "",
    floor: "",
    stories: "",
    latitude: 25.12,
    longitude: 55.13,
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
    ...over,
  };
}

describe("crossAgencyContentMatchKey", () => {
  it("returns null when title and description are too sparse", () => {
    expect(crossAgencyContentMatchKey(baseListing({ title: "Hi", description: "x" }))).toBeNull();
  });

  it("returns the same key for two listings with aligned normalized content", () => {
    const a = baseListing({
      id: "a",
      title: "Stunning Marina View Apartment",
      description: "Bright corner unit with full sea views and upgraded kitchen.",
      price: 2_500_000,
      beds: 2,
      baths: 2,
      city: "Dubai",
      community: "Marina",
    });
    const b = baseListing({
      id: "b",
      title: "Stunning Marina View Apartment",
      description: "Bright corner unit with full sea views and upgraded kitchen.",
      price: 2_500_000,
      beds: 2,
      baths: 2,
      city: "Dubai",
      community: "Marina",
    });
    const ka = crossAgencyContentMatchKey(a);
    const kb = crossAgencyContentMatchKey(b);
    expect(ka).toBeTruthy();
    expect(ka).toBe(kb);
  });

  it("differs when price band changes materially", () => {
    const common = {
      title: "Stunning Marina View Apartment Two Beds",
      description: "Bright corner unit with full sea views and upgraded kitchen finishes.",
      beds: 2,
      baths: 2,
      city: "Dubai",
      community: "Marina",
    };
    const low = crossAgencyContentMatchKey(baseListing({ ...common, price: 1_000_000 }));
    const high = crossAgencyContentMatchKey(baseListing({ ...common, price: 10_000_000 }));
    expect(low).toBeTruthy();
    expect(high).toBeTruthy();
    expect(low).not.toBe(high);
  });

  it("no-desc key matches when description differs but title and facts align", () => {
    const common = {
      title: "Marina View Apartment Two Bedroom",
      beds: 2,
      baths: 2,
      city: "Dubai",
      community: "Marina",
      price: 2_500_000,
    };
    const a = baseListing({
      ...common,
      description: "Fully upgraded kitchen and marble floors throughout.",
    });
    const b = baseListing({
      ...common,
      description: "Different marketing copy entirely but same headline.",
    });
    const strictA = crossAgencyContentMatchKey(a);
    const strictB = crossAgencyContentMatchKey(b);
    expect(strictA).toBeTruthy();
    expect(strictA).not.toBe(strictB);
    const ndA = crossAgencyContentMatchKeyNoDesc(a);
    const ndB = crossAgencyContentMatchKeyNoDesc(b);
    expect(ndA).toBe(ndB);
  });

  it("near key matches when title prefix and loose facts align (description ignored)", () => {
    const common = {
      title: "Stunning Palm Jumeirah Villa Garden View",
      beds: 4,
      baths: 5,
      city: "Dubai",
      community: "Palm Jumeirah",
      price: 15_000_000,
      latitude: 25.1122,
      longitude: 55.1333,
    };
    const a = baseListing({ ...common, description: "Long body copy version one." });
    const b = baseListing({ ...common, description: "Completely different rewrite of the description." });
    const na = crossAgencyContentNearMatchKey(a);
    const nb = crossAgencyContentNearMatchKey(b);
    expect(na).toBeTruthy();
    expect(na).toBe(nb);
  });
});
