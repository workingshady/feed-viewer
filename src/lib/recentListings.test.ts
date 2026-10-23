import { describe, it, expect } from "vitest";
import { mergeRecentListings, type RecentListingEntry } from "./recentListings";

describe("recentListings", () => {
  it("prepends new entry and dedupes by id", () => {
    const prev: RecentListingEntry[] = [
      { id: "a", title: "A", reference: "1", viewedAt: 1 },
      { id: "b", title: "B", reference: "2", viewedAt: 2 },
    ];
    const next = mergeRecentListings(prev, { id: "a", title: "A2", reference: "1", viewedAt: 100 });
    expect(next.map((e) => e.id)).toEqual(["a", "b"]);
    expect(next[0].title).toBe("A2");
    expect(next[0].viewedAt).toBe(100);
  });

  it("respects max length", () => {
    const prev: RecentListingEntry[] = Array.from({ length: 12 }, (_, i) => ({
      id: `x${i}`,
      title: "",
      reference: "",
      viewedAt: i,
    }));
    const next = mergeRecentListings(prev, { id: "new", title: "", reference: "", viewedAt: 999 }, 12);
    expect(next).toHaveLength(12);
    expect(next[0].id).toBe("new");
  });
});
