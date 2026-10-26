import { dominantMarket } from "@/lib/markets";
import { nanoid } from "nanoid";
import { PARSER_VERSION, parseXmlStringAsync } from "@/lib/xmlParser";
import { fingerprintMappingConfig } from "@/lib/mappingFingerprint";
import { diffCounts, diffListings, type VersionDiff } from "@/lib/versionDiff";
import { computeVersionStats, type VersionStats } from "@/lib/versionStats";
import { checkFeed, type FeedCheckResult } from "@/lib/feedValidation";
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
  /** Grouped feed checks (errors, warnings, notes) with a pass/warn/fail gate. */
  checks: FeedCheckResult;
  /** Existing source this file belongs to, if one was detected. */
  matched: SourceDTO | null;
  /** How `matched` was found, for the upload preview. */
  matchedBy: MatchReason | null;
  /** Diff against the matched source's live version (null when there is none). */
  diff: VersionDiff | null;
  mapping: MappingConfig | null;
  fingerprint: string;
};

const normalize = (s: string | undefined | null) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

export type MatchReason = "agency name" | "website" | "email domain" | "file name";
export type MatchHints = { website?: string; email?: string; fileName?: string };

/** Legal and trade words that vary between a feed and a source name ("LLC", "Real Estate", "Sdn Bhd"…). */
const NOISE = new Set([
  "llc", "l", "c", "fze", "fzco", "dmcc", "real", "estate", "estates", "property", "properties", "realty", "brokers", "broker",
  "brokerage", "sdn", "bhd", "pte", "ltd", "limited", "inc", "international", "group", "the", "agency", "homes", "re",
]);

/** Comparable company key: "White & Co Real Estate L.L.C" and "white_and_co.xml" both give "white and co". */
export function companyKey(value: string | undefined | null): string {
  const words = (value ?? "")
    .toLowerCase()
    .replace(/\.xml$/, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  const core = words.filter((w) => !NOISE.has(w));
  return (core.length ? core : words).join(" ");
}

const FREE_MAIL = new Set(["gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "icloud.com", "live.com"]);
const domainOf = (value: string | undefined | null) => {
  const v = (value ?? "").trim().toLowerCase();
  if (!v) return "";
  const host = v.includes("@") ? v.split("@").pop()! : v.replace(/^[a-z]+:\/\//, "").split(/[/?#]/)[0];
  const d = host.replace(/^www\./, "");
  return FREE_MAIL.has(d) ? "" : d;
};

/**
 * Finds the source a feed belongs to: exact agency name, then the agency's website or email
 * domain, then a normalised company name (ignoring LLC, Real Estate…), then the file name.
 */
export function detectSource(
  agencyName: string | undefined,
  sources: SourceDTO[],
  hints: MatchHints = {},
): { source: SourceDTO; by: MatchReason } | null {
  const exact = normalize(agencyName);
  if (exact) {
    const s = sources.find((x) => normalize(x.agencyName) === exact || normalize(x.name) === exact);
    if (s) return { source: s, by: "agency name" };
  }
  const site = domainOf(hints.website);
  if (site) {
    const s = sources.find((x) => domainOf(x.agencyInfo?.website) === site);
    if (s) return { source: s, by: "website" };
  }
  const mail = domainOf(hints.email);
  if (mail) {
    const s = sources.find((x) => domainOf(x.agencyInfo?.email) === mail || domainOf(x.agencyInfo?.website) === mail);
    if (s) return { source: s, by: "email domain" };
  }
  // Fuzzy keys only count when they point at exactly one source ("Elite Properties" vs "Elite Estates").
  const only = (key: string) => {
    if (key.length < 3) return null;
    const hits = sources.filter((x) => companyKey(x.agencyName) === key || companyKey(x.name) === key);
    return hits.length === 1 ? hits[0] : null;
  };
  const byName = only(companyKey(agencyName));
  if (byName) return { source: byName, by: "agency name" };
  const byFile = only(companyKey(hints.fileName));
  if (byFile) return { source: byFile, by: "file name" };
  return null;
}

/** Matches a parsed feed to a source (see detectSource). */
export function matchSource(agencyName: string | undefined, sources: SourceDTO[], hints: MatchHints = {}): SourceDTO | null {
  return detectSource(agencyName, sources, hints)?.source ?? null;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Identifies how a file was parsed: parser version + mapping. The same file with the same
 * fingerprint is a duplicate; a newer parser or a changed mapping makes a new version.
 */
async function mappingFingerprint(mapping: MappingConfig | null): Promise<string> {
  const map = mapping ? (await sha256Hex(fingerprintMappingConfig(mapping))).slice(0, 32) : "auto";
  return `p${PARSER_VERSION}:${map}`;
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
  let matchedBy: MatchReason | null = null;
  let result = await parseXmlStringAsync(xml, {
    mappingConfig: matched?.mapping ?? null,
    yieldMs: 18,
    onProgress: (p) => opts.onStage?.({ stage: "parsing", progress: p.total ? p.done / p.total : 0 }),
  });
  if (!matched) {
    const info = result.agencyInfo;
    const hit = detectSource(info?.name, sources, { website: info?.website, email: info?.email, fileName: file.name });
    matched = hit?.source ?? null;
    matchedBy = hit?.by ?? null;
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
    checks: checkFeed(result.listings),
    matched,
    matchedBy,
    diff,
    mapping,
    fingerprint: await mappingFingerprint(mapping),
  };
}

/** The file's market: its <metadata> country, else the market most of its listings belong to. */
export function fileMarket(p: Pick<PreparedVersion, "result">): string {
  if (p.result.market) return p.result.market;
  return p.result.listings.length ? dominantMarket(p.result.listings).code : "";
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
  /** "never" saves without making it live (e.g. re-parsing an older version). */
  apply: "auto" | "never" = "auto",
): Promise<RegisterResult & { source: SourceDTO | { id: string; name: string } }> {
  const source =
    "create" in target
      ? await deps.createSource({
          name: target.create.name,
          agencyName: p.result.agencyInfo?.name ?? "",
          agencyInfo: p.result.agencyInfo ?? null,
          market: fileMarket(p),
        })
      : target;

  const uploadId = nanoid(16);
  const dir = `sources/${source.id}/${uploadId}`;
  const listings: Listing[] = p.result.listings;
  onStage?.({ stage: "compressing" });
  const xmlGz = gzipText(p.xml);
  // Raw XML per listing roughly doubles the file; detail pages read it from the original XML instead.
  const listingsGz = gzipText(JSON.stringify(listings.map(({ rawXml: _raw, ...rest }) => rest)));
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
      warnings: {
        warnings: p.result.warnings.slice(0, 50),
        errors: p.result.errors.slice(0, 50),
        checks: { gate: p.checks.gate, issues: p.checks.issues, rentPeriods: p.checks.rentPeriods },
      },
      stats: p.stats,
      market: fileMarket(p),
      apply,
    });
    return { ...res, source };
  } catch (e) {
    await deps.discardUploadedBlobs([xmlBlob.url, listingsBlob.url]).catch(() => undefined);
    throw e;
  }
}
