import type { CSSProperties } from "react";

/**
 * Shared Recharts <Tooltip /> styles — popover surface, borders, and readable text on dark UI.
 * Use with contentStyle, labelStyle, itemStyle (and optional wrapperStyle).
 */
export const RECHARTS_TOOLTIP_CONTENT: CSSProperties = {
  backgroundColor: "hsl(var(--chart-tooltip-surface))",
  border: "1px solid hsl(var(--chart-tooltip-border))",
  borderRadius: "0.625rem",
  fontSize: 12,
  color: "hsl(var(--popover-foreground))",
  boxShadow: "var(--chart-tooltip-shadow)",
  padding: "10px 14px",
};

export const RECHARTS_TOOLTIP_LABEL: CSSProperties = {
  color: "hsl(var(--chart-tooltip-title))",
  fontWeight: 600,
  fontSize: 12,
  lineHeight: 1.45,
  marginBottom: 6,
  letterSpacing: "-0.01em",
};

/** Metric rows (name + value) — high contrast on dark popover */
export const RECHARTS_TOOLTIP_ITEM: CSSProperties = {
  color: "hsl(var(--chart-tooltip-value))",
  fontSize: 12,
  fontWeight: 500,
  paddingTop: 2,
};

/** Spread onto Recharts Tooltip for full theme alignment */
export const RECHARTS_TOOLTIP_PROPS = {
  contentStyle: RECHARTS_TOOLTIP_CONTENT,
  labelStyle: RECHARTS_TOOLTIP_LABEL,
  itemStyle: RECHARTS_TOOLTIP_ITEM,
} as const;

/**
 * Resolve theme CSS variables for Recharts (SVG does not inherit all Tailwind tokens).
 * Variable values are space-separated HSL components, e.g. `153 42% 52%`.
 */
export function cssHslVar(name: string, fallbackComponents: string): string {
  if (typeof window === "undefined") return `hsl(${fallbackComponents})`;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!raw) return `hsl(${fallbackComponents})`;
  if (raw.startsWith("#") || raw.startsWith("hsl") || raw.startsWith("rgb")) return raw;
  return `hsl(${raw})`;
}

export const CHART_FALLBACK = {
  line: "153 42% 52%",
  bar: "153 38% 46%",
  grid: "0 0% 22%",
  axis: "0 0% 52%",
  severityError: "0 72% 58%",
  severityWarning: "38 88% 54%",
  severityInfo: "153 40% 50%",
  neutral: "195 17% 52%",
} as const;

export function getAuditChartPalette() {
  return {
    line: cssHslVar("--chart-line", CHART_FALLBACK.line),
    bar: cssHslVar("--chart-bar", CHART_FALLBACK.bar),
    grid: cssHslVar("--chart-grid", CHART_FALLBACK.grid),
    axis: cssHslVar("--chart-axis", CHART_FALLBACK.axis),
    severity: {
      error: cssHslVar("--chart-severity-error", CHART_FALLBACK.severityError),
      warning: cssHslVar("--chart-severity-warning", CHART_FALLBACK.severityWarning),
      info: cssHslVar("--chart-severity-info", CHART_FALLBACK.severityInfo),
      neutral: cssHslVar("--chart-neutral", CHART_FALLBACK.neutral),
    },
  };
}

/** Shared legend wrapper for import dashboard + account charts (Recharts SVG context). */
export const RECHARTS_LEGEND_WRAPPER: CSSProperties = {
  fontSize: 11,
  width: "100%",
  paddingTop: 4,
};

/**
 * Stream activity chart (/import-dashboard local): one palette for all series so colors match across UI and legend.
 */
export function getImportDashboardStreamSeriesColors() {
  const c = getAuditChartPalette();
  return {
    totalPerBucket: cssHslVar("--foreground", "222 47% 11%"),
    listingAdded: cssHslVar("--chart-stream-listing-added", "142 76% 36%"),
    listingUpdated: c.line,
    listingRemoved: c.severity.error,
    fileSkipped: cssHslVar("--chart-stream-file-skip", "215 16% 47%"),
    scanCompleted: cssHslVar("--chart-stream-scan", "271 81% 56%"),
    otherEvents: cssHslVar("--chart-stream-other", "215 20% 38%"),
  };
}

/** Classic import line charts: single-file runs, batch runs, and shared “listings parsed” orange. */
export function getClassicImportChartColors() {
  return {
    singleFileRuns: cssHslVar("--chart-classic-single-runs", "217 91% 60%"),
    batchRuns: cssHslVar("--chart-classic-batch-runs", "262 83% 58%"),
    listingsParsed: cssHslVar("--chart-classic-listings", "25 95% 53%"),
  };
}

/**
 * Listing volume chart (server): index 0 = total line; further indices = split segments.
 * Tuned to stay distinct on light/dark when CSS vars resolve.
 */
export function getListingVolumeLinePalette(): string[] {
  const cl = getClassicImportChartColors();
  const c = getAuditChartPalette();
  return [
    cl.listingsParsed,
    c.line,
    c.bar,
    c.severity.warning,
    getImportDashboardStreamSeriesColors().scanCompleted,
    c.severity.error,
    c.severity.info,
    cssHslVar("--chart-listing-seg-7", "199 89% 48%"),
    c.severity.neutral,
  ];
}

/** Vertical line when hovering line / area / composed charts (brand primary) */
export const RECHARTS_LINE_CURSOR = {
  stroke: "hsl(var(--primary) / 0.55)",
  strokeWidth: 1,
  strokeOpacity: 0.9,
};

/** Vertical line when hovering a specific series color */
export function rechartsLineCursorStroke(lineColor: string) {
  return { stroke: lineColor, strokeWidth: 1, strokeOpacity: 0.75 };
}

/** Highlight band when hovering bars */
export const RECHARTS_BAR_CURSOR: CSSProperties = {
  fill: "hsl(var(--primary) / 0.14)",
  stroke: "hsl(var(--primary) / 0.35)",
  strokeWidth: 1,
};
