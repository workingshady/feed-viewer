import {
  ADMIN_NAV_ITEM,
  TOP_NAV_ITEMS,
  userMenuItems,
  visibleNavGroups,
  type NavItem,
} from "@/lib/appNav";

/** Single link row on the HTML sitemap */
export type SiteMapLink = {
  to: string;
  label: string;
  /** Signed-in workspace route */
  auth?: boolean;
  /** Restricted to admin role */
  admin?: boolean;
};

/** Grouped blocks matching app navigation structure */
export type SiteMapSection = {
  id: string;
  heading: string;
  description?: string;
  items: SiteMapLink[];
};

/** URL shortcuts implemented as redirects */
export const SITEMAP_REDIRECTS: { from: string; to: string; note?: string }[] = [
  { from: "/mapping", to: "/field-mapping" },
  { from: "/geo", to: "/listings/map" },
  { from: "/insights", to: "/workspace-insights" },
  { from: "/account/profile", to: "/account", note: "Same page, profile tab" },
];

/** Parameterized routes (detail screens) */
export const SITEMAP_DYNAMIC_ROUTES: { pattern: string; label: string; hint: string }[] = [
  {
    pattern: "/listing/:id",
    label: "Listing detail",
    hint: ":id is the listing identifier from an uploaded feed.",
  },
  {
    pattern: "/agencies/:name",
    label: "Agency overview",
    hint: ":name is the agency (source) name.",
  },
  {
    pattern: "/agents/:name",
    label: "Agent profile",
    hint: ":name matches the normalized agent route segment.",
  },
  {
    pattern: "/agencies/:agency/agents/:agent",
    label: "Agent via agency path",
    hint: "Nested route when drilling from an agency into an agent.",
  },
];

function navItemsToLinks(items: NavItem[]): SiteMapLink[] {
  return items.map((i) => ({
    to: i.to,
    label: i.label,
    auth: i.to !== "/",
    admin: i.minRole === "admin",
  }));
}

/**
 * Sections for `/sitemap`, rendered from the same navigation model as the header.
 * Items the role cannot use are omitted.
 */
export function buildSiteMapSections(role: string | undefined): SiteMapSection[] {
  const signedIn = Boolean(role);
  const core: SiteMapSection[] = [
    {
      id: "public",
      heading: "Entry points",
      description: "Public pages.",
      items: [
        { to: "/", label: "Home" },
        { to: "/login", label: "Sign in" },
        { to: "/signup", label: "Create account" },
      ],
    },
  ];
  if (signedIn) {
    core.push({
      id: "main",
      heading: "Main",
      description: "Top-level destinations in the header.",
      items: navItemsToLinks(TOP_NAV_ITEMS.filter((i) => i.to !== "/")),
    });
    for (const g of visibleNavGroups(role)) {
      core.push({ id: g.id, heading: g.heading, items: navItemsToLinks(g.items) });
    }
    core.push({
      id: "account",
      heading: "Account & help",
      items: navItemsToLinks(userMenuItems(role).filter((i) => i.to !== ADMIN_NAV_ITEM.to)),
    });
    if (role === "admin") {
      core.push({
        id: "admin",
        heading: "Administration",
        description: "Operator console (admin role only).",
        items: navItemsToLinks([ADMIN_NAV_ITEM]),
      });
    }
  }
  core.push({
    id: "site",
    heading: "Site map",
    items: [{ to: "/sitemap", label: "All pages (HTML sitemap)" }],
  });
  return core;
}
