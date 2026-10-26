import { describe, expect, it } from "vitest";
import { listingChangeSet } from "@/lib/listingChanges";
import { clusterSameProperty, matchListingSets } from "@/lib/propertyMatch";
import { diffListings } from "@/lib/versionDiff";
import type { Listing } from "@/lib/types";

const listing = (reference: string, over: Partial<Listing> = {}) =>
  ({
    id: reference,
    reference,
    title: "Flat",
    description: "",
    price: 1_000_000,
    purpose: "sale",
    propertyType: "Apartment",
    beds: 2,
    baths: 2,
    area: 1100,
    community: "Dubai Marina",
    city: "Dubai",
    propertyName: "",
    images: [],
    amenities: [],
    agent: {},
    permitNumber: "",
    ...over,
  }) as Listing;

describe("listingChangeSet", () => {
  it("separates filled/cleared values from real changes and ignores formatting", () => {
    const a = listing("R", { completionStatus: "", parking: 0, title: "Sea View | Furnished", description: "Great  home", price: 2_000_000.0 });
    const b = listing("R", { completionStatus: "completed", parking: 2, title: "sea view | furnished", description: "Great home", price: 2_000_000 });
    const c = listingChangeSet(a, b);
    expect(c.material).toHaveLength(0);
    expect(c.completeness.map((x) => x.key).sort()).toEqual(["completionStatus", "parking"]);
  });

  it("reports price moves with percentage and treats pin jitter and area rounding as noise", () => {
    const a = listing("R", { price: 280_000, latitude: 25.1, longitude: 55.1, area: 12003.91 });
    const b = listing("R", { price: 265_000, latitude: 25.10001, longitude: 55.10002, area: 12004 });
    const c = listingChangeSet(a, b);
    expect(c.material.map((x) => x.key)).toEqual(["price"]);
    expect(c.price?.pct).toBeCloseTo(-5.36, 1);
  });

  it("an agent phone change for the same agent is minor; a new agent is a real change", () => {
    const sara = { name: "Sara", email: "sara@x.ae", phone: "+971500000001", photo: "" };
    expect(listingChangeSet(listing("R", { agent: sara }), listing("R", { agent: { ...sara, phone: "+971500000002" } })).material[0]).toMatchObject({ key: "agent", minor: true });
    expect(listingChangeSet(listing("R", { agent: sara }), listing("R", { agent: { name: "Omar", email: "omar@x.ae", phone: "", photo: "" } })).material[0].minor).toBeFalsy();
  });
});

describe("property matching", () => {
  const desc = "Stunning upgraded villa backing the park with private pool, maids room, landscaped garden and five ensuite bedrooms close to the community centre";

  it("pairs listings without any reference by the property itself", () => {
    const before = [listing("", { title: "Park backing villa", description: desc, propertyType: "Villa", beds: 5, area: 5310.4, permitNumber: "71234567" })];
    const after = [listing("", { title: "Park backing villa | price drop", description: desc, propertyType: "Villa", beds: 5, area: 5310.4, permitNumber: "71234567", price: 950_000 })];
    const d = diffListings(before, after);
    expect(d.added).toHaveLength(0);
    expect(d.changed[0].keys).toContain("price");
  });

  it("does not merge two different units of the same building", () => {
    const a = listing("A-1", { propertyName: "Marina Gate 1", beds: 1, area: 750, floor: "12", price: 1_200_000, description: "One bed on the 12th floor with marina view" });
    const b = listing("B-1", { propertyName: "Marina Gate 1", beds: 1, area: 750, floor: "31", price: 1_450_000, description: "Penthouse level one bed with sea view and upgraded finishes" });
    expect(matchListingSets([a], [b]).matches).toHaveLength(0);
  });

  it("groups the same permit across agencies and keeps the evidence", () => {
    const x = listing("X1", { permitNumber: "7123-4567", propertyName: "Index Tower", area: 1650 });
    const y = listing("Y9", { permitNumber: "71234567", propertyName: "Index Tower", area: 1650 });
    const { clusters } = clusterSameProperty([{ group: "Agency X", listings: [x] }, { group: "Agency Y", listings: [y] }], { crossGroupOnly: true });
    expect(clusters).toHaveLength(1);
    expect(clusters[0].links[0].evidence[0]).toMatchObject({ signal: "permit" });
  });
});
