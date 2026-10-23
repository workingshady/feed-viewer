import { apiFetch, jsonBody } from "@/lib/api";
import type { ImportResult, MappingConfig } from "@/lib/types";
import type { VersionStats } from "@/lib/versionStats";
import type { FeedCheckResult } from "@/lib/feedValidation";

export type VersionDTO = {
  id: string;
  sourceId: string;
  number: number;
  status: "ready" | "failed";
  fileName: string;
  fileBytes: number;
  sha256: string;
  mappingFingerprint: string;
  uploadId: string;
  xmlBlobUrl: string;
  listingsBlobUrl: string;
  listingCount: number;
  added: number;
  removed: number;
  changed: number;
  warnings: {
    warnings: string[];
    errors: string[];
    /** Present on versions uploaded after feed checks were added. */
    checks?: Pick<FeedCheckResult, "gate" | "issues" | "rentPeriods">;
  } | null;
  stats: VersionStats | null;
  note: string | null;
  pinned: boolean;
  createdAt: string;
  createdBy: { id: string; username: string } | null;
};

export type SourceDTO = {
  id: string;
  name: string;
  agencyName: string;
  agencyInfo: ImportResult["agencyInfo"] | null;
  mapping: MappingConfig | null;
  activeVersionId: string | null;
  retainVersions: number;
  createdAt: string;
  updatedAt: string;
  /** Newest first. */
  versions: VersionDTO[];
};

export type RegisterVersionBody = Pick<
  VersionDTO,
  | "uploadId"
  | "fileName"
  | "fileBytes"
  | "sha256"
  | "mappingFingerprint"
  | "xmlBlobUrl"
  | "listingsBlobUrl"
  | "listingCount"
  | "added"
  | "removed"
  | "changed"
  | "warnings"
  | "stats"
> & { apply?: "auto" | "never" };

export type RegisterResult = {
  version: VersionDTO;
  duplicate: boolean;
  applied: boolean;
  blockedReason?: "count_drop";
  pruned: string[];
};

export const liveVersionOf = (s: SourceDTO): VersionDTO | null =>
  s.versions.find((v) => v.id === s.activeVersionId) ?? null;

export const listSources = () => apiFetch<{ sources: SourceDTO[] }>("/api/sources").then((r) => r.sources);

export const createSource = (body: { name: string; agencyName: string; agencyInfo?: SourceDTO["agencyInfo"] }) =>
  apiFetch<{ source: SourceDTO }>("/api/sources", { method: "POST", ...jsonBody(body) }).then((r) => r.source);

export const updateSource = (
  id: string,
  body: { name?: string; mapping?: MappingConfig | null; retainVersions?: number },
) =>
  apiFetch<{ source: SourceDTO }>(`/api/sources/${id}`, { method: "PATCH", ...jsonBody(body) }).then((r) => r.source);

export const deleteSource = (id: string) =>
  apiFetch<{ ok: true; deletedVersions: number }>(`/api/sources/${id}`, { method: "DELETE" });

export const registerVersion = (sourceId: string, body: RegisterVersionBody) =>
  apiFetch<RegisterResult>(`/api/sources/${sourceId}/versions`, { method: "POST", ...jsonBody(body) });

export const applyVersion = (sourceId: string, versionId: string) =>
  apiFetch<{ source: SourceDTO }>(`/api/sources/${sourceId}/versions/${versionId}/apply`, { method: "POST" }).then(
    (r) => r.source,
  );

export const updateVersion = (sourceId: string, versionId: string, body: { note?: string | null; pinned?: boolean }) =>
  apiFetch<{ version: VersionDTO }>(`/api/sources/${sourceId}/versions/${versionId}`, {
    method: "PATCH",
    ...jsonBody(body),
  }).then((r) => r.version);

export const deleteVersion = (sourceId: string, versionId: string) =>
  apiFetch<{ ok: true }>(`/api/sources/${sourceId}/versions/${versionId}`, { method: "DELETE" });

export const discardUploadedBlobs = (urls: string[]) =>
  apiFetch<{ ok: true }>("/api/blob/discard", { method: "POST", ...jsonBody({ urls }) });

/** Deletes every source, version and stored file. Admin only; `confirm` must be "DELETE ALL". */
export const clearAllSources = () =>
  apiFetch<{ ok: true; deletedSources: number; deletedVersions: number }>("/api/sources/clear-all", {
    method: "POST",
    ...jsonBody({ confirm: "DELETE ALL" }),
  });
