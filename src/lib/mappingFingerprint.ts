import type { MappingConfig } from "@/lib/types";

/**
 * Stable fingerprint of mapping + listing node path so we can skip re-parsing when XML bytes
 * and parse options are unchanged (classic import fast path).
 */
export function fingerprintMappingConfig(config: MappingConfig | null | undefined): string {
  if (!config) return "null";
  const paths = [...(config.mappings ?? [])].sort((a, b) => {
    const byField = String(a.uiField).localeCompare(String(b.uiField));
    return byField !== 0 ? byField : String(a.xmlPath).localeCompare(String(b.xmlPath));
  });
  return JSON.stringify({
    listingNodePath: config.listingNodePath ?? "",
    mappings: paths,
  });
}

/** Includes strict mode because it affects parse outcome. */
export function fingerprintXmlParseOptions(params: {
  mappingConfig: MappingConfig | null | undefined;
  strictMode: boolean;
}): string {
  return `${fingerprintMappingConfig(params.mappingConfig)}|strict:${params.strictMode ? "1" : "0"}`;
}
