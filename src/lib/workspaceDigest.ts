import { fingerprintMappingConfig } from "@/lib/mappingFingerprint";
import type { MappingConfig } from "@/lib/types";

export type WorkspaceDigestInput = {
  scopeLabel: string;
  listingsCount: number;
  agenciesInWorkspace: number;
  versionsCount: number;
  mappingConfig: MappingConfig | null;
  importTime: string | null;
  /** One-line summary of the scoped source's live version, if any */
  liveVersionSummary: string | null;
};

/** Short human-readable snippet for paste into Slack, Linear, email, or runbooks. */
export function buildWorkspaceDigestMarkdown(input: WorkspaceDigestInput): string {
  const ts = new Date().toISOString();
  const fpFull = fingerprintMappingConfig(input.mappingConfig);
  const fpShort = fpFull.length > 72 ? `${fpFull.slice(0, 72)}…` : fpFull;
  const mappingLine =
    fpFull === "null" ? "_No mapping config saved_" : `\`${fpShort}\``;

  const lastImport =
    input.importTime && input.importTime.trim().length > 0
      ? new Date(input.importTime).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
      : "_unknown_";

  const sessionLine = input.liveVersionSummary?.trim()
    ? input.liveVersionSummary.trim()
    : "_none selected_";

  return [
    `### Feed Viewer Pro — workspace snapshot`,
    ``,
    `- **Generated:** ${ts}`,
    `- **Listings scope:** ${input.scopeLabel}`,
    `- **Rows in scope:** ${input.listingsCount.toLocaleString()}`,
    `- **Agencies (workspace):** ${input.agenciesInWorkspace.toLocaleString()}`,
    `- **Stored feed versions:** ${input.versionsCount.toLocaleString()}`,
    `- **Live version uploaded:** ${lastImport}`,
    `- **Live version:** ${sessionLine}`,
    `- **Mapping fingerprint:** ${mappingLine}`,
    ``,
    `_Paste this block when escalating feed or mapping issues._`,
  ].join("\n");
}
