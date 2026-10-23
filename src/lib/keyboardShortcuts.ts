/** Reference data for `/shortcuts` — keep in sync with real handlers (e.g. command palette in `AppCommandPalette`). */

export type ShortcutRow = {
  action: string;
  /** Windows / Linux primary label */
  keys: string;
  /** Optional macOS display (use when different from Ctrl→⌘ swap) */
  keysMac?: string;
  note?: string;
};

export type ShortcutGroup = {
  id: string;
  title: string;
  rows: ShortcutRow[];
};

export const KEYBOARD_SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    id: "global",
    title: "Global",
    rows: [
      {
        action: "Open / close command palette",
        keys: "Ctrl+K",
        keysMac: "⌘K",
        note: "Search pages, guided workflows, home sections, listings, and MRU — primary fast path for the whole app.",
      },
      {
        action: "Close dialog (when palette or modal is focused)",
        keys: "Escape",
        note: "Dismisses the command palette and most modal shells.",
      },
    ],
  },
  {
    id: "navigation",
    title: "Navigation & shell",
    rows: [
      {
        action: "Primary nav & More menu",
        keys: "—",
        note: "Header links plus “More” groups: feeds, quality, insights, compare, export, site map.",
      },
      {
        action: "Compare tray",
        keys: "—",
        note: "Pin listings from grids or detail, then open Compare — pairs with Feed compare for revision workflows.",
      },
    ],
  },
];

/** Heuristic for showing ⌘ vs Ctrl in inline tips. */
export function preferMacModifier(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform) || navigator.userAgent.includes("Mac");
}

export function formatShortcutKeys(row: ShortcutRow): string {
  if (preferMacModifier() && row.keysMac) return row.keysMac;
  return row.keys;
}

/** Narrative tips for `/shortcuts` workflow tab — mirrors product flow upload → validate → compare → publish. */
export type WorkflowTipSection = {
  id: string;
  title: string;
  bullets: string[];
};

export const WORKFLOW_TIP_SECTIONS: WorkflowTipSection[] = [
  {
    id: "ingest",
    title: "Ingest & freshness",
    bullets: [
      "Upload an agency XML feed on Sources; each upload becomes a version you can review before it goes live.",
      "Compare a new version against the live one to see what was added, removed or changed.",
    ],
  },
  {
    id: "quality",
    title: "Trust the data",
    bullets: [
      "Validation catches mapping conflicts before buyers see bad rows.",
      "Listing table plus Field coverage expose gaps (price, geo, images) across the merged scope.",
    ],
  },
  {
    id: "analysis",
    title: "Compare & dedupe",
    bullets: [
      "Feed compare diffs supplier revisions; listing compare aligns shortlists side by side.",
      "Cross-agency dupes clusters overlapping inventory across brands.",
    ],
  },
  {
    id: "discover",
    title: "Navigate faster",
    bullets: [
      "Ctrl/⌘+K opens search — Guided workflows encode the same routes as docs and tests.",
      "Export hub groups CSV, compares, and sync; Workspace insights ties KPIs to your current scope.",
    ],
  },
];
