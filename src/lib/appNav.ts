import type { LucideIcon } from "lucide-react";
import {
  Building2,
  ClipboardCheck,
  ClipboardList,
  Database,
  FolderInput,
  GitCompare,
  GitCompareArrows,
  Globe2,
  Home,
  Keyboard,
  LayoutDashboard,
  LayoutGrid,
  Link2,
  Map,
  PieChart,
  ScanSearch,
  Shield,
  Shuffle,
  Star,
  Users,
} from "lucide-react";
import { hasRole, type AppRole } from "@/lib/roles";

export type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  description?: string;
  /** Minimum role required to see the item (hidden, never disabled). Defaults to any signed-in user. */
  minRole?: AppRole;
};

export type NavGroup = {
  id: string;
  heading: string;
  items: NavItem[];
  /** Minimum role required to see the whole group. */
  minRole?: AppRole;
};

/** Always-visible top-level destinations (single source of truth for header, palette, sitemap). */
export const TOP_NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Home", icon: Home, description: "Overview of live listings and agencies" },
  { to: "/sources", label: "Sources", icon: FolderInput, description: "Agency feeds, versions and quality" },
  { to: "/listings", label: "Listings", icon: LayoutGrid, description: "Browse and filter live listings" },
];

/** One level of dropdowns, grouped by task. */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: "explore",
    heading: "Explore",
    items: [
      { to: "/listings/map", label: "Map", icon: Globe2, description: "Listings on a map, with location checks" },
      { to: "/database", label: "Database", icon: Database, description: "Sortable table of every live listing" },
      { to: "/favorites", label: "Favorites", icon: Star, description: "Listings you starred" },
      { to: "/agencies", label: "Agencies", icon: Building2, description: "One card per source with inventory and history" },
      { to: "/agents", label: "Agents", icon: Users, description: "Agents across all agencies" },
      { to: "/random-listing", label: "Random listing", icon: Shuffle, description: "Jump to a random live listing" },
    ],
  },
  {
    id: "analyze",
    heading: "Analyze",
    items: [
      { to: "/workspace-insights", label: "Insights", icon: PieChart, description: "Totals, mix and recent versions" },
      { to: "/field-quality", label: "Field quality", icon: ScanSearch, description: "How complete each field is, per version" },
      { to: "/validation", label: "Validation", icon: ClipboardList, description: "Parser issues and changes vs the previous version" },
      { to: "/cross-agency-dupes", label: "Duplicates across agencies", icon: Link2, description: "The same property listed by several agencies" },
      { to: "/compare", label: "Compare listings", icon: GitCompare, description: "Two or more listings side by side" },
      { to: "/feed-compare", label: "Compare versions", icon: GitCompareArrows, description: "Added, removed and changed listings between versions" },
    ],
  },
  {
    id: "setup",
    heading: "Setup",
    minRole: "editor",
    items: [
      { to: "/field-mapping", label: "Field mapping", icon: Map, description: "Map XML paths to listing fields per source" },
      { to: "/mapping-qa", label: "Mapping QA", icon: ClipboardCheck, description: "Check a mapping against the raw XML" },
    ],
  },
];

/** User-menu destinations. */
export const ACCOUNT_NAV_ITEM: NavItem = { to: "/account", label: "Account", icon: LayoutDashboard, description: "Profile, password and sign out" };
export const ADMIN_NAV_ITEM: NavItem = { to: "/admin", label: "Admin", icon: Shield, minRole: "admin", description: "Users, roles and the audit log" };
export const SHORTCUTS_NAV_ITEM: NavItem = { to: "/shortcuts", label: "Shortcuts", icon: Keyboard, description: "Keyboard shortcuts" };

export type RoleLike = string | null | undefined;

const allowed = (role: RoleLike, min?: AppRole) => !min || hasRole(role, min);

/** Groups (and their items) visible to `role`. Hidden, never disabled. */
export function visibleNavGroups(role: RoleLike): NavGroup[] {
  return NAV_GROUPS.filter((g) => allowed(role, g.minRole))
    .map((g) => ({ ...g, items: g.items.filter((i) => allowed(role, i.minRole)) }))
    .filter((g) => g.items.length > 0);
}

/** Top-level items for a signed-out visitor are limited to Home. */
export function visibleTopNav(signedIn: boolean): NavItem[] {
  return signedIn ? TOP_NAV_ITEMS : TOP_NAV_ITEMS.slice(0, 1);
}

export function userMenuItems(role: RoleLike): NavItem[] {
  return [ACCOUNT_NAV_ITEM, ADMIN_NAV_ITEM, SHORTCUTS_NAV_ITEM].filter((i) => allowed(role, i.minRole));
}

export function isNavActive(pathname: string, to: string): boolean {
  if (to === "/") return pathname === "/";
  return pathname === to;
}

export function isGroupActive(pathname: string, group: NavGroup): boolean {
  return group.items.some((i) => isNavActive(pathname, i.to));
}
