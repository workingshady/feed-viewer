import type { AgentSummary } from "@/components/AgentCard";

/** Agent profile fields a portal-ready feed should carry, in display order. */
export const AGENT_FIELDS = [
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "photo", label: "Photo" },
  { key: "licenseNo", label: "Licence (BRN)" },
  { key: "agentId", label: "Agent ID" },
  { key: "info", label: "Bio / info" },
] as const;

export type AgentField = (typeof AGENT_FIELDS)[number]["key"];

/** Share of agents (people, not agency accounts) that have each field, 0–1. */
export function agentFieldCoverage(agents: AgentSummary[]): Record<AgentField, number> {
  const people = agents.filter((a) => !a.isAgencyAccount);
  const out = {} as Record<AgentField, number>;
  for (const f of AGENT_FIELDS) out[f.key] = people.length ? people.filter((a) => a[f.key].trim()).length / people.length : 0;
  return out;
}

export type AgentIssue = {
  key: string;
  label: string;
  severity: "error" | "warning" | "info";
  /** Why it matters, in one line. */
  hint: string;
  agents: string[];
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
/** RERA BRNs are numeric; accept 3–8 digits after stripping a "BRN" prefix. */
export const normalizeLicence = (v: string) => v.replace(/^\s*(brn|rera)[\s:#-]*/i, "").trim();
const validLicence = (v: string) => /^\d{3,8}$/.test(normalizeLicence(v));
const phoneDigits = (v: string) => v.replace(/[^\d+]/g, "");
/** International (+country) or local UAE numbers; anything shorter than 9 digits is unusable. */
const validPhone = (v: string) => /^\+?\d{9,15}$/.test(phoneDigits(v));

function sharedBy(agents: AgentSummary[], pick: (a: AgentSummary) => string): string[] {
  const groups = new Map<string, Set<string>>();
  for (const a of agents) {
    const k = pick(a);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, new Set());
    groups.get(k)!.add(a.name);
  }
  return [...groups.values()].filter((g) => g.size > 1).flatMap((g) => [...g]);
}

/** Agent-level data problems, most severe first. Empty groups are dropped. */
export function agentIssues(agents: AgentSummary[]): AgentIssue[] {
  const people = agents.filter((a) => !a.isAgencyAccount);
  const names = (list: AgentSummary[]) => list.map((a) => a.name);
  const issues: AgentIssue[] = [
    {
      key: "invalid_email",
      label: "Invalid email",
      severity: "error",
      hint: "Leads sent to this address will bounce.",
      agents: names(people.filter((a) => a.email && !EMAIL.test(a.email.trim()))),
    },
    {
      key: "invalid_phone",
      label: "Unusable phone number",
      severity: "error",
      hint: "Fewer than 9 digits or letters in the number.",
      agents: names(people.filter((a) => a.phone && !validPhone(a.phone))),
    },
    {
      key: "invalid_licence",
      label: "Licence not numeric",
      severity: "warning",
      hint: "RERA BRNs are numbers; portals reject other formats.",
      agents: names(people.filter((a) => a.licenseNo && !validLicence(a.licenseNo))),
    },
    {
      key: "shared_licence",
      label: "Licence used by several agents",
      severity: "warning",
      hint: "Each broker has their own BRN; a shared one is usually a copy-paste error.",
      agents: sharedBy(people, (a) => normalizeLicence(a.licenseNo)),
    },
    {
      key: "missing_licence",
      label: "No licence number",
      severity: "warning",
      hint: "Portals in Dubai require the broker's BRN on every listing.",
      agents: names(people.filter((a) => !a.licenseNo)),
    },
    {
      key: "agency_account",
      label: "Agency account used as agent",
      severity: "warning",
      hint: "Listings are not attributed to a real broker.",
      agents: names(agents.filter((a) => a.isAgencyAccount)),
    },
    {
      key: "shared_phone",
      label: "Phone shared by several agents",
      severity: "info",
      hint: "Often a switchboard number; buyers can't reach the agent directly.",
      agents: sharedBy(people, (a) => phoneDigits(a.phone).replace(/^\+?971|^0/, "")),
    },
    {
      key: "shared_email",
      label: "Email shared by several agents",
      severity: "info",
      hint: "A shared inbox hides who handles the lead.",
      agents: sharedBy(people, (a) => a.email.trim().toLowerCase()),
    },
    {
      key: "missing_photo",
      label: "No photo",
      severity: "info",
      hint: "Listings with an agent photo get more enquiries.",
      agents: names(people.filter((a) => !a.photo)),
    },
  ];
  return issues.filter((i) => i.agents.length > 0);
}

/** Agents by what they list: sale only, rent only, or both. */
export function agentSpecialisation(agents: AgentSummary[]) {
  let sale = 0,
    rent = 0,
    both = 0;
  for (const a of agents) {
    if (a.sale && a.rent) both++;
    else if (a.sale) sale++;
    else if (a.rent) rent++;
  }
  return { sale, rent, both };
}
