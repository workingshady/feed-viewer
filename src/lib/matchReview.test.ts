import { describe, expect, it } from "vitest";
import { pairKey } from "@/lib/propertyMatch";
import { diffListings } from "@/lib/versionDiff";
import { wordDiff } from "@/lib/wordDiff";
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
    propertyName: "Marina Gate",
    images: [],
    amenities: [],
    agent: {},
    permitNumber: "",
    ...over,
  }) as Listing;

describe("wordDiff", () => {
  it("marks only the words that changed", () => {
    const d = wordDiff("Vacant 1st Oct | Spacious layout", "Vacant 1st Dec | Spacious layout");
    expect(d.tokens.filter((t) => t.op === "del").map((t) => t.text.trim())).toEqual(["Oct"]);
    expect(d.tokens.filter((t) => t.op === "ins").map((t) => t.text.trim())).toEqual(["Dec"]);
    expect(d.changed).toBe(2);
  });
});

describe("reviewer verdicts", () => {
  const old = listing("OLD-1", { title: "Sea view 2BR" });
  const neu = listing("NEW-2", { title: "Sea view 2 bed" });

  it("a 'same' verdict turns a removed + new pair into a relist", () => {
    const d = diffListings([old], [neu], { same: new Set([pairKey([old.id, neu.id])]), different: new Set() });
    expect(d.relisted).toHaveLength(1);
    expect(d.relisted[0].evidence[0]).toMatchObject({ signal: "review" });
    expect(d.added).toHaveLength(0);
  });

  it("a 'different' verdict keeps them apart even when they look alike", () => {
    const twin = listing("NEW-3", { title: "Sea view 2BR", permitNumber: "" });
    const d = diffListings([old], [twin], { same: new Set(), different: new Set([pairKey([old.id, twin.id])]) });
    expect(d.relisted).toHaveLength(0);
    expect(d.possibleRelists).toHaveLength(0);
  });
});
