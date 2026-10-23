import { TOP_NAV_ITEMS, visibleNavGroups, type RoleLike } from "@/lib/appNav";

/** Footer navigation — built from the same model as the header, so the two never drift. */

export type SiteFooterLink = { label: string; to: string };

export type SiteFooterGroup = {
  id: string;
  title: string;
  links: SiteFooterLink[];
};

export function siteFooterGroups(role: RoleLike, signupOpen: boolean): SiteFooterGroup[] {
  const help: SiteFooterLink[] = [
    { label: "Site map", to: "/sitemap" },
    { label: "Keyboard shortcuts", to: "/shortcuts" },
  ];
  if (!role) {
    return [
      {
        id: "start",
        title: "Get started",
        links: [
          { label: "Home", to: "/" },
          { label: "Sign in", to: "/login" },
          ...(signupOpen ? [{ label: "Create account", to: "/signup" }] : []),
        ],
      },
      { id: "help", title: "Help", links: help },
    ];
  }
  return [
    { id: "main", title: "Workspace", links: TOP_NAV_ITEMS.map((i) => ({ label: i.label, to: i.to })) },
    ...visibleNavGroups(role).map((g) => ({
      id: g.id,
      title: g.heading,
      links: g.items.map((i) => ({ label: i.label, to: i.to })),
    })),
    { id: "help", title: "Help", links: [{ label: "Account", to: "/account" }, ...help] },
  ];
}
