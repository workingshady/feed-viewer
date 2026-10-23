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

/** Vertical line when hovering line / area / composed charts (brand primary) */
export const RECHARTS_LINE_CURSOR = {
  stroke: "hsl(var(--primary) / 0.55)",
  strokeWidth: 1,
  strokeOpacity: 0.9,
};

/** Highlight band when hovering bars */
export const RECHARTS_BAR_CURSOR = {
  fill: "hsl(var(--primary) / 0.14)",
  stroke: "hsl(var(--primary) / 0.35)",
  strokeWidth: 1,
};
