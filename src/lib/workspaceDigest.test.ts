import { describe, expect, it } from "vitest";
import { buildWorkspaceDigestMarkdown } from "./workspaceDigest";

describe("buildWorkspaceDigestMarkdown", () => {
  it("includes scope, counts, mapping line, and footer hint", () => {
    const md = buildWorkspaceDigestMarkdown({
      scopeLabel: "Acme Realty",
      listingsCount: 120,
      agenciesInWorkspace: 4,
      versionsCount: 3,
      mappingConfig: {
        listingNodePath: "/root/property",
        mappings: [{ xmlPath: "a.b", uiField: "reference" }],
      },
      importTime: "2026-01-15T12:00:00.000Z",
      liveVersionSummary: "v3 · feed.xml · 120 rows",
    });
    expect(md).toContain("Feed Viewer Pro — workspace snapshot");
    expect(md).toContain("Acme Realty");
    expect(md).toContain("120");
    expect(md).toContain("escalating feed");
    expect(md).toMatch(/Mapping fingerprint:/);
  });

  it("handles missing mapping gracefully", () => {
    const md = buildWorkspaceDigestMarkdown({
      scopeLabel: "All agencies (merged)",
      listingsCount: 0,
      agenciesInWorkspace: 0,
      versionsCount: 0,
      mappingConfig: null,
      importTime: null,
      liveVersionSummary: null,
    });
    expect(md).toContain("_No mapping config saved_");
    expect(md).toContain("_none selected_");
  });
});
