/** Map ?section= URL param to element id (e.g. workflow → section-workflow). */

export function hrefToSectionSlug(href: string): string {
  return href.replace(/^#section-/, "");
}

export function slugToSectionId(slug: string): string {
  const s = slug.trim().toLowerCase();
  if (!s) return "";
  return s.startsWith("section-") ? s : `section-${s}`;
}

export function normalizeSectionQueryParam(raw: string | null): string | null {
  if (!raw) return null;
  const t = raw.trim().toLowerCase();
  return t || null;
}

export type HomeSectionCommand = { slug: string; label: string; hint?: string };

/** Static home sections (always present). Workspace is added when user has listings. */
export const HOME_SECTION_COMMANDS_BASE: readonly HomeSectionCommand[] = [
  { slug: "capabilities", label: "Capabilities", hint: "Import, field mapping, validation, browse" },
  { slug: "audiences", label: "Audience", hint: "Who Feed Viewer Pro is for" },
  { slug: "workflow", label: "Workflow", hint: "XML to portal-ready" },
  { slug: "quality", label: "Quality", hint: "Field precision" },
  { slug: "preview", label: "Preview", hint: "Listing table" },
  { slug: "network", label: "Network", hint: "Agents and agencies" },
  { slug: "cta", label: "Get started", hint: "Closing CTA" },
];

export const HOME_SECTION_COMMAND_WORKSPACE: HomeSectionCommand = {
  slug: "workspace",
  label: "Workspace",
  hint: "Live counts and shortcuts",
};

export function getHomeSectionCommands(hasListings: boolean): HomeSectionCommand[] {
  if (!hasListings) return [...HOME_SECTION_COMMANDS_BASE];
  const out: HomeSectionCommand[] = [];
  for (const c of HOME_SECTION_COMMANDS_BASE) {
    out.push(c);
    if (c.slug === "preview") out.push(HOME_SECTION_COMMAND_WORKSPACE);
  }
  return out;
}
