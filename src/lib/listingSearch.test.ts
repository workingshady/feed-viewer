import { describe, expect, it } from "vitest";
import type { Listing } from "@/lib/types";
import {
  buildListingHaystack,
  buildListingHaystacks,
  listingMatchesQuery,
} from "@/lib/listingSearch";

/** Mirrors the shape the /listings E2E seed uses, so the two stay comparable. */
function listing(over: Partial<Listing> & { id: string }): Listing {
  return {
    reference: "",
    title: "",
    description: "",
    city: "Dubai",
    community: "Palm",
    propertyName: "",
    agent: { name: "", phone: "", email: "", photo: "" },
    ...over,
  } as Listing;
}

const SEED: Listing[] = [
  listing({ id: "lp-1", title: "Palm Studio Compact", reference: "REF-500", community: "Palm" }),
  listing({
    id: "lp-2",
    title: "Marina Villa With Long Title For Layout Stress Test",
    reference: "REF-1M",
    community: "Marina",
    agent: { name: "Christopher Montgomery", phone: "", email: "", photo: "" },
  }),
  listing({ id: "lp-3", title: "Affordable Rent Unit", reference: "REF-RENT", community: "Palm" }),
  listing({ id: "lp-4", title: "Penthouse Sky", reference: "REF-PH", community: "Marina" }),
];

function search(query: string): string[] {
  const haystacks = buildListingHaystacks(SEED);
  const q = query.toLowerCase();
  return SEED.filter((l) => listingMatchesQuery(haystacks, l, q)).map((l) => l.id);
}

describe("listing search haystack", () => {
  it("matches on title", () => {
    expect(search("Marina")).toEqual(["lp-2", "lp-4"]);
  });

  it("is case-insensitive in both directions", () => {
    expect(search("marina")).toEqual(["lp-2", "lp-4"]);
    expect(search("MARINA")).toEqual(["lp-2", "lp-4"]);
  });

  it("matches on community even when the title does not contain the term", () => {
    // lp-4 "Penthouse Sky" only matches "Marina" via its community.
    expect(search("Marina")).toContain("lp-4");
  });

  it("matches on reference, id and agent name", () => {
    expect(search("REF-RENT")).toEqual(["lp-3"]);
    expect(search("lp-1")).toEqual(["lp-1"]);
    expect(search("Montgomery")).toEqual(["lp-2"]);
  });

  it("an empty query matches everything", () => {
    expect(search("")).toHaveLength(SEED.length);
  });

  it("a non-matching query returns nothing", () => {
    expect(search("zzzz-no-such-term")).toEqual([]);
  });

  it("tolerates missing/undefined text fields without throwing or matching everything", () => {
    const sparse = [listing({ id: "s1", title: undefined as unknown as string })];
    const haystacks = buildListingHaystacks(sparse);
    expect(() => listingMatchesQuery(haystacks, sparse[0]!, "x")).not.toThrow();
    expect(listingMatchesQuery(haystacks, sparse[0]!, "zzz")).toBe(false);
    // The id is part of the haystack, so it remains findable.
    expect(listingMatchesQuery(haystacks, sparse[0]!, "s1")).toBe(true);
  });

  it("a listing absent from the map matches nothing rather than everything", () => {
    const haystacks = buildListingHaystacks([]);
    expect(listingMatchesQuery(haystacks, SEED[1]!, "marina")).toBe(false);
    // …but an empty query still short-circuits, so an unfiltered view is never emptied.
    expect(listingMatchesQuery(haystacks, SEED[1]!, "")).toBe(true);
  });

  it("folds all eight fields into the haystack", () => {
    const hay = buildListingHaystack(SEED[1]!);
    for (const part of ["marina villa", "ref-1m", "lp-2", "christopher montgomery", "dubai"]) {
      expect(hay).toContain(part);
    }
  });
});
