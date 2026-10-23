/** Grouped footer navigation — mirrors product areas; route guards still apply when visiting links. */

export type SiteFooterLink = { label: string; to: string };

export type SiteFooterGroup = {
  id: string;
  title: string;
  links: SiteFooterLink[];
};

export const SITE_FOOTER_GROUPS: SiteFooterGroup[] = [
  {
    id: "workspace",
    title: "Workspace",
    links: [
      { label: "Listings", to: "/listings" },
      { label: "Listing table", to: "/database" },
      { label: "Import feed", to: "/import" },
      { label: "Import activity", to: "/import-dashboard" },
      { label: "Stream feeds", to: "/stream-feeds" },
      { label: "Account", to: "/account" },
    ],
  },
  {
    id: "quality",
    title: "Quality & mapping",
    links: [
      { label: "Validation", to: "/validation" },
      { label: "XML field mapping", to: "/field-mapping" },
      { label: "Field coverage", to: "/field-quality" },
      { label: "Mapping & XML QA", to: "/mapping-qa" },
      { label: "Locations map", to: "/listings/map" },
    ],
  },
  {
    id: "compare",
    title: "Compare & insights",
    links: [
      { label: "Compare listings", to: "/compare" },
      { label: "Compare two imports", to: "/feed-compare" },
      { label: "Cross-agency duplicates", to: "/cross-agency-dupes" },
      { label: "Workspace insights", to: "/workspace-insights" },
    ],
  },
  {
    id: "discover",
    title: "Discover",
    links: [
      { label: "Home", to: "/" },
      { label: "Sign in", to: "/login" },
      { label: "Site map", to: "/sitemap" },
      { label: "Export hub", to: "/export-hub" },
      { label: "Keyboard shortcuts", to: "/shortcuts" },
      { label: "Agencies", to: "/agencies" },
      { label: "Agents", to: "/agents" },
      { label: "Favorites", to: "/favorites" },
      { label: "Surprise listing", to: "/random-listing" },
      { label: "Sign up", to: "/signup" },
    ],
  },
];
