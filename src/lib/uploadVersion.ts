import { nanoid } from "nanoid";
import { parseXmlStringAsync } from "@/lib/xmlParser";
import { fingerprintMappingConfig } from "@/lib/mappingFingerprint";
import { diffCounts, diffListings, type VersionDiff } from "@/lib/versionDiff";
import { computeVersionStats, type VersionStats } from "@/lib/versionStats";
import { fetchVersionListings, gzipText } from "@/lib/versionBlobs";
import { uploadBlob } from "@/lib/blobUpload";
import {
  createSource,
  discardUploadedBlobs,
  liveVersionOf,
  registerVersion,
  type RegisterResult,
  type SourceDTO,
} from "@/lib/sourcesApi";
import type { ImportResult, Listing, MappingConfig } from "@/lib/types";

/** Where an upload is, for progress display. `progress` is 0–1 within the stage when known. */
export type UploadStage = {
  stage: "reading" | "parsing" | "comparing" | "compressing" | "uploading" | "saving";
  progress?: number;
};

export const STAGE_LABELS: Record<UploadStage["stage"], string> = {
  reading: "Reading file",
  parsing: "Reading listings",
  comparing: "Comparing with the live version",
  compressing: "Compressing",
  uploading: "Uploading",
  saving: "Saving version",
};

export type PreparedVersion = {
  file: File;
  xml: string;
  sha256: string;
  result: ImportResult;
  stats: VersionStats;
  /** Existing source this file belongs to (by agency name), if any. */
  matched: SourceDTO | null;
  /** Diff against the matched source's live version (null when there is none). */
  diff: VersionDiff | null;
  mapping: MappingConfig | null;
  fingerprint: string;
};

const normalize = (s: string | undefined | null) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/** Matches a parsed feed to a source by agency name first, then by source name. */
export function matchSource(agencyName: string | undefined, sources: SourceDTO[]): SourceDTO | null {
  const key = normalize(agencyName);
  if (!key) return null;
  return (
    sources.find((s) => normalize(s.agencyName) === key) ?? sources.find((s) => normalize(s.name) === key) ?? null
  );
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** "" for auto-detect, otherwise a short hash of the mapping (stored per version). */
async function mappingFingerprint(mapping: MappingConfig | null): Promise<string> {
  return mapping ? (await sha256Hex(fingerprintMappingConfig(mapping))).slice(0, 32) : "";
}

/** Parses a file in the browser and prepares its preview against the matching source. */
export async function prepareVersion(
  file: File,
  sources: SourceDTO[],
  opts: { target?: SourceDTO | null; onStage?: (s: UploadStage) => void } = {},
): Promise<PreparedVersion> {
  opts.onStage?.({ stage: "reading" });
  const xml = await file.text();
  const sha256 = await sha256Hex(xml);
  // A known target decides the mapping; otherwise peek at the agency with auto-detection first.
  let matched = opts.target ?? null;
  let result = await parseXmlStringAsync(xml, {
    mappingConfig: matched?.mapping ?? null,
    yieldMs: 18,
    onProgress: (p) => opts.onStage?.({ stage: "parsing", progress: p.total ? p.done / p.total : 0 }),
  });
  if (!matched) {
    matched = matchSource(result.agencyInfo?.name, sources);
    if (matched?.mapping) result = await parseXmlStringAsync(xml, { mappingConfig: matched.mapping, yieldMs: 18 });
  }
  const mapping = matched?.mapping ?? null;
  const live = matched ? liveVersionOf(matched) : null;
  if (live) opts.onStage?.({ stage: "comparing" });
  const diff = live ? diffListings(await fetchVersionListings(live.listingsBlobUrl), result.listings) : null;
  return {
    file,
    xml,
    sha256,
    result,
    stats: computeVersionStats(result.listings),
    matched,
    diff,
    mapping,
    fingerprint: await mappingFingerprint(mapping),
  };
}

export type CommitTarget = SourceDTO | { create: { name: string } };

export type CommitDeps = {
  uploadBlob: typeof uploadBlob;
  registerVersion: typeof registerVersion;
  createSource: typeof createSource;
  discardUploadedBlobs: typeof discardUploadedBlobs;
};

const defaultDeps: CommitDeps = { uploadBlob, registerVersion, createSource, discardUploadedBlobs };

/** Uploads both files to Blob and registers the version; cleans up the blobs if registration fails. */
export async function commitVersion(
  p: PreparedVersion,
  target: CommitTarget,
  deps: CommitDeps = defaultDeps,
  onStage?: (s: UploadStage) => void,
): Promise<RegisterResult & { source: SourceDTO | { id: string; name: string } }> {
  const source =
    "create" in target
      ? await deps.createSource({
          name: target.create.name,
          agencyName: p.result.agencyInfo?.name ?? "",
          agencyInfo: p.result.agencyInfo ?? null,
        })
      : target;

  const uploadId = nanoid(16);
  const dir = `sources/${source.id}/${uploadId}`;
  const listings: Listing[] = p.result.listings;
  onStage?.({ stage: "compressing" });
  const xmlGz = gzipText(p.xml);
  const listingsGz = gzipText(JSON.stringify(listings));
  // Report combined progress of both files, weighted by size.
  const total = xmlGz.length + listingsGz.length;
  const done = [0, 0];
  const progress = (i: number, size: number) => (share: number) => {
    done[i] = share * size;
    onStage?.({ stage: "uploading", progress: (done[0] + done[1]) / total });
  };
  onStage?.({ stage: "uploading", progress: 0 });
  const [xmlBlob, listingsBlob] = await Promise.all([
    deps.uploadBlob(`${dir}/feed.xml.gz`, xmlGz, progress(0, xmlGz.length)),
    deps.uploadBlob(`${dir}/listings.json.gz`, listingsGz, progress(1, listingsGz.length)),
  ]);
  onStage?.({ stage: "saving" });

  // A diff computed against another source's live version would be meaningless.
  const sameSource = p.matched?.id === source.id;
  const counts = sameSource && p.diff ? diffCounts(p.diff) : { added: listings.length, removed: 0, changed: 0 };
  try {
    const res = await deps.registerVersion(source.id, {
      uploadId,
      fileName: p.file.name,
      fileBytes: p.file.size,
      sha256: p.sha256,
      mappingFingerprint: p.fingerprint,
      xmlBlobUrl: xmlBlob.url,
      listingsBlobUrl: listingsBlob.url,
      listingCount: listings.length,
      ...counts,
      warnings: { warnings: p.result.warnings.slice(0, 50), errors: p.result.errors.slice(0, 50) },
      stats: p.stats,
      apply: "auto",
    });
    return { ...res, source };
  } catch (e) {
    await deps.discardUploadedBlobs([xmlBlob.url, listingsBlob.url]).catch(() => undefined);
    throw e;
  }
}
