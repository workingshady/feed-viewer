import { describe, it, expect } from "vitest";
import { ALL_LISTING_DISPLAY_KEYS } from "@/lib/importAnalysis";
import { LISTING_COMPARE_FIELD_GROUPS } from "@/lib/listingCompareFieldGroups";
import type { Listing } from "@/lib/types";

describe("listingCompareFieldGroups", () => {
  it("includes every listing compare field exactly once (id + sourceAgency + all display keys)", () => {
    const flat = LISTING_COMPARE_FIELD_GROUPS.flatMap((g) => g.keys);
    const expected = new Set<keyof Listing>(["id", "sourceAgency", ...ALL_LISTING_DISPLAY_KEYS]);
    expect(flat.length).toBe(expected.size);
    const seen = new Set<keyof Listing>();
    for (const k of flat) {
      expect(expected.has(k), `unexpected key ${String(k)}`).toBe(true);
      expect(seen.has(k), `duplicate key ${String(k)}`).toBe(false);
      seen.add(k);
    }
    for (const k of expected) {
      expect(seen.has(k), `missing key ${String(k)}`).toBe(true);
    }
  });
});
