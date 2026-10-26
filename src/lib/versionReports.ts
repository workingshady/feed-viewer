import { dominantMarket } from "@/lib/markets";
import type { Listing } from "@/lib/types";
import type { SourceDTO, VersionDTO } from "@/lib/sourcesApi";
import { fetchVersionListings } from "@/lib/versionBlobs";
import { checkFeed, completenessDelta } from "@/lib/feedValidation";
import { changesCsv, feedCheckCsv, listingsCsv } from "@/lib/reports";
import { qualityIssuesCsv } from "@/lib/versionStats";
import { diffListings } from "@/lib/versionDiff";
import { bedroomMix, priceBands, topValues } from "@/lib/sourceInsights";
import { downloadText } from "@/components/sources/format";

/** Every downloadable report for a version, in one place for menus and buttons. */
export type ReportKind =
  | "checks"
  | "quality"
  | "changes"
  | "completeness"
  | "market"
  | "listings"
  | "agents"
  | "agents_report";

export const REPORTS: { kind: ReportKind; label: string; needsPrevious?: boolean }[] = [
  { kind: "checks", label: "Feed checks (CSV)" },
  { kind: "quality", label: "Quality issues per listing (CSV)" },
  { kind: "changes", label: "Added, removed & changed listings (CSV)", needsPrevious: true },
  { kind: "completeness", label: "Field completeness vs previous (CSV)", needsPrevious: true },
  { kind: "market", label: "Market insights (CSV)" },
  { kind: "listings", label: "All listings (CSV)" },
  { kind: "agents", label: "Agents (JSON)" },
  { kind: "agents_report", label: "Agents report with listings (JSON)" },
];

const offeringCode = (l: Listing) => l.offeringType || (l.purpose === "sale" ? "RS" : l.purpose === "rent" ? "RR" : "");
const typeCode = (l: Listing) => l.propertyTypeCode || l.propertyType || "";
const agentKey = (l: Listing) =>
  (l.agent?.email?.trim().toLowerCase() || l.agent?.phone?.replace(/\s+/g, "") || l.agent?.name?.trim().toLowerCase() || "").trim();
const tally = (map: Record<string, number>, key: string) => {
  if (key) map[key] = (map[key] ?? 0) + 1;
};

function runInfo(source: SourceDTO, version: VersionDTO) {
  return {
    source: source.name,
    version: version.number,
    file: version.fileName,
    uploaded_at: version.createdAt,
    generated_at: new Date().toISOString(),
  };
}

function agencyOf(source: SourceDTO) {
  const a = source.agencyInfo;
  return {
    company_name: a?.name || source.agencyName || source.name,
    company_logo: a?.logo ?? "",
    website_url: a?.website ?? "",
    company_phone: a?.phone ?? "",
    company_email: a?.email ?? "",
  };
}

type AgentRow = {
  name: string;
  email: string;
  phone: string;
  photo: string;
  license_no: string;
  id: string;
  info: string;
  listings: Listing[];
};

function groupAgents(listings: Listing[]): { agents: AgentRow[]; unattributed: number } {
  const map = new Map<string, AgentRow>();
  let unattributed = 0;
  for (const l of listings) {
    const key = agentKey(l);
    if (!key) {
      unattributed++;
      continue;
    }
    let row = map.get(key);
    if (!row) {
      row = { name: "", email: "", phone: "", photo: "", license_no: "", id: "", info: "", listings: [] };
      map.set(key, row);
    }
    // Keep the first non-empty value seen for each field.
    row.name ||= l.agent.name ?? "";
    row.email ||= l.agent.email ?? "";
    row.phone ||= l.agent.phone ?? "";
    row.photo ||= l.agent.photo ?? "";
    row.license_no ||= l.agent.licenseNo ?? "";
    row.id ||= l.agent.id ?? "";
    row.info ||= l.agent.info ?? "";
    row.listings.push(l);
  }
  const agents = [...map.values()].sort((a, b) => b.listings.length - a.listings.length);
  return { agents, unattributed };
}

const breakdown = (listings: Listing[]) => {
  const by_transaction = { sale: 0, rent: 0, other: 0 };
  const by_offering_type: Record<string, number> = {};
  const by_property_type: Record<string, number> = {};
  for (const l of listings) {
    by_transaction[l.purpose === "sale" ? "sale" : l.purpose === "rent" ? "rent" : "other"]++;
    tally(by_offering_type, offeringCode(l));
    tally(by_property_type, typeCode(l));
  }
  return { by_transaction, by_offering_type, by_property_type };
};

const identity = ({ listings: _l, ...a }: AgentRow) => a;

/** Same shape as the ZibaAi `agents.json` report. */
export function agentsJson(source: SourceDTO, version: VersionDTO, listings: Listing[]) {
  const { agents } = groupAgents(listings);
  return { schema_version: 1, run: runInfo(source, version), total_agents: agents.length, agency: agencyOf(source), agents: agents.map(identity) };
}

/** Same shape as the ZibaAi `agents_report.json`: totals plus per-agent breakdowns and references. */
export function agentsReportJson(source: SourceDTO, version: VersionDTO, listings: Listing[]) {
  const { agents, unattributed } = groupAgents(listings);
  return {
    schema_version: 1,
    run: runInfo(source, version),
    totals: {
      total_agents: agents.length,
      total_listings: listings.length,
      listings_attributed: listings.length - unattributed,
      listings_unattributed: unattributed,
      ...breakdown(listings),
    },
    agency: agencyOf(source),
    agents: agents.map((a) => ({
      ...identity(a),
      listing_count: a.listings.length,
      ...breakdown(a.listings),
      reference_numbers: a.listings.map((l) => l.reference),
    })),
  };
}

const csv = (rows: unknown[][]) =>
  rows.map((r) => r.map((v) => (/[",\n]/.test(String(v ?? "")) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ""))).join(",")).join("\n");

export function marketCsv(listings: Listing[]): string {
  const rows: unknown[][] = [["section", "label", "count", "share"]];
  const push = (section: string, buckets: { label: string; count: number }[]) => {
    const total = buckets.reduce((n, b) => n + b.count, 0) || 1;
    for (const b of buckets) rows.push([section, b.label, b.count, `${Math.round((b.count / total) * 100)}%`]);
  };
  const cur = dominantMarket(listings).currency;
  push(`Sale price (${cur})`, priceBands(listings, "sale"));
  push(`Rent per year (${cur})`, priceBands(listings, "rent"));
  push("Bedrooms (all)", bedroomMix(listings));
  push("Property type", topValues(listings, (l) => l.propertyType, 50));
  push("Community", topValues(listings, (l) => l.community, 100));
  push("Offering type", topValues(listings, offeringCode, 10));
  return csv(rows);
}

export function completenessCsv(before: Listing[], after: Listing[]): string {
  return csv([
    ["field", "previous", "current", "change_points", "flagged"],
    ...completenessDelta(before, after).map((c) => [
      c.field,
      `${Math.round(c.before * 100)}%`,
      `${Math.round(c.after * 100)}%`,
      Math.round(c.delta * 100),
      c.flagged ? "yes" : "",
    ]),
  ]);
}

/** Builds and downloads one report for a version (fetches listings as needed). */
export async function downloadVersionReport(kind: ReportKind, source: SourceDTO, version: VersionDTO, previous: VersionDTO | null) {
  const listings = await fetchVersionListings(version.listingsBlobUrl);
  const before = previous && (kind === "changes" || kind === "completeness") ? await fetchVersionListings(previous.listingsBlobUrl) : [];
  const base = `${source.name}-v${version.number}`.replace(/[\\/:*?"<>|]+/g, "-");
  const json = (name: string, data: unknown) => downloadText(`${base}-${name}.json`, JSON.stringify(data, null, 2), "application/json");
  switch (kind) {
    case "checks":
      return downloadText(`${base}-feed-checks.csv`, feedCheckCsv(checkFeed(listings)));
    case "quality":
      return downloadText(`${base}-quality-issues.csv`, qualityIssuesCsv(listings));
    case "changes":
      return downloadText(`${base}-changes-since-v${previous!.number}.csv`, changesCsv(diffListings(before, listings)));
    case "completeness":
      return downloadText(`${base}-completeness-vs-v${previous!.number}.csv`, completenessCsv(before, listings));
    case "market":
      return downloadText(`${base}-market.csv`, marketCsv(listings));
    case "listings":
      return downloadText(`${base}-listings.csv`, listingsCsv(listings));
    case "agents":
      return json("agents", agentsJson(source, version, listings));
    case "agents_report":
      return json("agents_report", agentsReportJson(source, version, listings));
  }
}
