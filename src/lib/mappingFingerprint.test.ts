import { describe, expect, it } from "vitest";
import { fingerprintMappingConfig, fingerprintXmlParseOptions } from "./mappingFingerprint";
import type { MappingConfig } from "./types";

describe("fingerprintMappingConfig", () => {
  it("is stable for mapping order", () => {
    const a = fingerprintMappingConfig({
      listingNodePath: "/root/listing",
      mappings: [
        { uiField: "title", xmlPath: "/t" },
        { uiField: "price", xmlPath: "/p" },
      ],
    });
    const b = fingerprintMappingConfig({
      listingNodePath: "/root/listing",
      mappings: [
        { uiField: "price", xmlPath: "/p" },
        { uiField: "title", xmlPath: "/t" },
      ],
    });
    expect(a).toBe(b);
  });

  it("changes when listing node path changes", () => {
    const x = fingerprintMappingConfig({
      listingNodePath: "/a",
      mappings: [{ uiField: "title", xmlPath: "/t" }],
    });
    const y = fingerprintMappingConfig({
      listingNodePath: "/b",
      mappings: [{ uiField: "title", xmlPath: "/t" }],
    });
    expect(x).not.toBe(y);
  });
});

describe("fingerprintXmlParseOptions", () => {
  it("includes strict flag", () => {
    const cfg: MappingConfig = { listingNodePath: "/l", mappings: [] };
    expect(fingerprintXmlParseOptions({ mappingConfig: cfg, strictMode: false })).not.toBe(
      fingerprintXmlParseOptions({ mappingConfig: cfg, strictMode: true }),
    );
  });
});
