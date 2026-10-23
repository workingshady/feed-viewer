import { describe, it, expect } from "vitest";
import { aggregateImportFieldChanges } from "./importDiffInsights";
import type { ImportListingDiff } from "./types";

describe("aggregateImportFieldChanges", () => {
  it("counts fields only for updated listings", () => {
    const listingDiffById: Record<string, ImportListingDiff> = {
      a: {
        id: "a",
        reference: "A",
        status: "updated",
        changedKeys: ["title", "price"],
      },
      b: {
        id: "b",
        reference: "B",
        status: "updated",
        changedKeys: ["title", "description"],
      },
      c: {
        id: "c",
        reference: "C",
        status: "new",
        changedKeys: ["title"],
      },
    };
    const rows = aggregateImportFieldChanges(listingDiffById);
    const title = rows.find((r) => r.key === "title");
    const price = rows.find((r) => r.key === "price");
    expect(title?.count).toBe(2);
    expect(price?.count).toBe(1);
    expect(rows.find((r) => r.key === "description")?.count).toBe(1);
  });
});
