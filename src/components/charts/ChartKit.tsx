import { useState, type ReactNode } from "react";
import { BarChart3, ChevronDown, Download, Search, Table2 } from "lucide-react";
import {
  Bar,
  BarChart,
  Brush,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RECHARTS_BAR_CURSOR, RECHARTS_LINE_CURSOR, RECHARTS_TOOLTIP_PROPS } from "@/lib/chartTheme";
import { downloadText } from "@/components/sources/format";
import { toCsv } from "@/lib/reports";
import { cn } from "@/lib/utils";
import { CanvasScatter } from "@/components/charts/CanvasScatter";

/** Categorical slots in their validated order. Assign by entity, never by rank, and never cycle past 8. */
export const SERIES = Array.from({ length: 8 }, (_, i) => `var(--series-${i + 1})`);

const GRID = "hsl(var(--chart-grid))";
const AXIS = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };

export type SeriesDef = { key: string; label: string; color: string };
export type TableData = { columns: string[]; rows: (string | number)[][] };

const fmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString() : n.toFixed(1));

/** Axis ticks stay short (1.2K, 34K, 2.5M); tooltips and labels keep the full number. */
function compact(n: number): string {
  const a = Math.abs(n);
  const unit = a >= 1e9 ? [1e9, "B"] : a >= 1e6 ? [1e6, "M"] : a >= 1e3 ? [1e3, "K"] : null;
  if (!unit) return Number.isInteger(n) ? String(n) : n.toFixed(1);
  const v = n / (unit[0] as number);
  return `${Math.abs(v) >= 100 ? Math.round(v) : Number(v.toFixed(1))}${unit[1]}`;
}

/** Axis formatter: compact for plain counts, the caller's format for %, money, MB… */
const axisFmt = (valueFormat: (n: number) => string) => (valueFormat === fmt ? compact : valueFormat);

/** Width that fits the longest tick label, so long numbers never clip and short ones waste no space. */
const axisWidth = (values: number[], f: (n: number) => string) =>
  Math.min(72, Math.max(28, Math.max(...values.map((v) => f(v).length), 1) * 7 + 8));

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

type TickProps = { x?: number; y?: number; payload?: { value: string | number } };

/** Category tick that shortens long names to fit and shows the full name on hover. */
function CategoryTick({ x = 0, y = 0, payload, max, angled }: TickProps & { max: number; angled?: boolean }) {
  const full = String(payload?.value ?? "");
  return (
    <g transform={`translate(${x},${y})`}>
      <title>{full}</title>
      <text
        dy={angled ? 4 : 4}
        dx={angled ? -4 : -6}
        textAnchor="end"
        transform={angled ? "rotate(-35)" : undefined}
        fontSize={11}
        fill="hsl(var(--muted-foreground))"
      >
        {clip(full, max)}
      </text>
    </g>
  );
}

/** Top rows first with a "Show all" expander, plus a filter box once the list is long. */
function useLongList<T>(rows: T[], limit: number, label: (row: T) => string) {
  const [expanded, setExpanded] = useState(false);
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const filtered = query ? rows.filter((r) => label(r).toLowerCase().includes(query)) : rows;
  const visible = expanded || query ? filtered : filtered.slice(0, limit);
  const controls =
    rows.length > limit ? (
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        {rows.length > 20 ? (
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter…" className="h-8 pl-8 text-xs" aria-label="Filter rows" />
          </div>
        ) : (
          <span />
        )}
        {!query && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Show top " + limit : `Show all ${rows.length}`}
            <ChevronDown className={cn("ml-1 h-3.5 w-3.5 transition-transform", expanded && "rotate-180")} />
          </Button>
        )}
      </div>
    ) : null;
  return { visible, controls, hidden: filtered.length - visible.length };
}

export function Legend({ series }: { series: { label: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
      {series.map((s) => (
        <li key={s.label} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} aria-hidden />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

/** Chart/table toggle and CSV download buttons for a chart header. */
export function ChartTableActions({
  title,
  table,
  asTable,
  onToggle,
}: {
  title: string;
  table: TableData;
  asTable: boolean;
  onToggle: () => void;
}) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        aria-label={asTable ? "Show chart" : "Show table"}
        title={asTable ? "Show chart" : "Show table"}
        onClick={onToggle}
      >
        {asTable ? <BarChart3 className="h-4 w-4" /> : <Table2 className="h-4 w-4" />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        aria-label="Download CSV"
        title="Download CSV"
        onClick={() => downloadText(`${slug}.csv`, toCsv(table.columns, table.rows))}
      >
        <Download className="h-4 w-4" />
      </Button>
    </>
  );
}

/** The table view of a chart: first column is the label, the rest are right-aligned numbers. */
/** Rows rendered in the on-screen table; CSV export always includes every row. */
const TABLE_ROWS = 500;

export function DataTable({ table }: { table: TableData }) {
  return (
    <div className="max-h-80 overflow-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {table.columns.map((c, i) => (
              <TableHead key={c} className={cn("h-8 text-xs", i > 0 && "text-right")}>
                {c}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {table.rows.slice(0, TABLE_ROWS).map((r, i) => (
            <TableRow key={i}>
              {r.map((v, j) => (
                <TableCell key={j} className={cn("py-1.5 text-xs", j > 0 && "text-right font-mono tabular-nums")}>
                  {typeof v === "number" ? fmt(v) : v}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {table.rows.length > TABLE_ROWS && (
        <p className="border-t px-3 py-2 text-xs text-muted-foreground">
          Showing {TABLE_ROWS} of {table.rows.length.toLocaleString()} rows; the CSV download has all of them.
        </p>
      )}
    </div>
  );
}

/**
 * Card wrapper for every chart: title, optional legend (shown for 2+ series), and a chart/table
 * toggle so the numbers are always readable without colour. The table can be downloaded as CSV.
 */
export function ChartCard({
  title,
  description,
  legend,
  table,
  actions,
  className,
  children,
}: {
  title: string;
  description?: ReactNode;
  legend?: { label: string; color: string }[];
  table?: TableData;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <Card className={cn("flex min-w-0 flex-col overflow-hidden", className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
        <div className="min-w-0 space-y-1">
          <CardTitle className="text-sm">{title}</CardTitle>
          {description && <CardDescription className="text-xs">{description}</CardDescription>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {actions}
          {table && <ChartTableActions title={title} table={table} asTable={asTable} onToggle={() => setAsTable((v) => !v)} />}
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-3">
        {legend && legend.length > 1 && !asTable && <Legend series={legend} />}
        {asTable && table ? <DataTable table={table} /> : children}
      </CardContent>
    </Card>
  );
}

export function EmptyChart({ text = "No data yet" }: { text?: string }) {
  return <p className="flex h-40 items-center justify-center text-xs text-muted-foreground">{text}</p>;
}

/**
 * Horizontal bars, one or more series. Rows are categories (sources, agents, checks…).
 * Stacked by default (part-to-whole); `grouped` puts series side by side so each one is read
 * from the same zero baseline (comparing sale vs rent per source). `onSelect` makes rows clickable.
 */
export function HBars<T extends Record<string, string | number>>({
  data,
  labelKey,
  series,
  valueFormat = fmt,
  onSelect,
  max,
  limit = 15,
  grouped = false,
}: {
  data: T[];
  labelKey: keyof T & string;
  series: SeriesDef[];
  valueFormat?: (n: number) => string;
  onSelect?: (row: T) => void;
  /** Fixed domain max (e.g. 100 for percentages). */
  max?: number;
  /** Rows shown before "Show all". */
  limit?: number;
  /** Side-by-side bars per row instead of one stacked bar. */
  grouped?: boolean;
}) {
  const list = useLongList(data, limit, (r) => String(r[labelKey]));
  if (!data.length) return <EmptyChart />;
  const shown = list.visible;
  const perRow = grouped ? series.length * 13 + 14 : 28;
  const height = Math.max(120, shown.length * perRow + 28);
  const last = series.length - 1;
  const rows = shown.map((r) => ({ ...r, __total: series.reduce((n, s) => n + (Number(r[s.key]) || 0), 0) }));
  const longest = Math.max(...shown.map((r) => String(r[labelKey]).length), 4);
  const labelChars = Math.min(24, longest);
  return (
    <div>
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={rows}
        layout="vertical"
        margin={{ top: 0, right: grouped ? 48 : 40, bottom: 0, left: 0 }}
        barCategoryGap={grouped ? 7 : 6}
        barGap={2}
      >
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis
          type="number"
          tick={AXIS}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
          domain={[0, max ?? "auto"]}
          tickFormatter={axisFmt(valueFormat)}
          tickCount={5}
        />
        <YAxis
          type="category"
          dataKey={labelKey}
          width={labelChars * 6.4 + 14}
          tick={<CategoryTick max={labelChars} />}
          axisLine={false}
          tickLine={false}
          interval={0}
        />
        <Tooltip {...RECHARTS_TOOLTIP_PROPS} cursor={RECHARTS_BAR_CURSOR} formatter={(v: number) => valueFormat(v)} />
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            stackId={grouped ? undefined : "a"}
            fill={s.color}
            stroke="hsl(var(--card))"
            strokeWidth={1}
            radius={grouped || i === last ? [0, 4, 4, 0] : 0}
            onClick={onSelect ? (_d: unknown, idx: number) => onSelect(shown[idx]) : undefined}
            className={onSelect ? "cursor-pointer" : undefined}
            maxBarSize={grouped ? 12 : 22}
          >
            {grouped ? (
              <LabelList
                dataKey={s.key}
                position="right"
                fontSize={10}
                fill="hsl(var(--muted-foreground))"
                formatter={(v: number) => (v ? valueFormat(v) : "")}
              />
            ) : (
              i === last && (
                <LabelList dataKey="__total" position="right" fontSize={11} fill="hsl(var(--muted-foreground))" formatter={valueFormat} />
              )
            )}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
    {list.controls}
    </div>
  );
}

/**
 * Horizontal diverging bars: `positive` series stack right of zero, `negative` series stack left
 * (pass them as positive numbers). Rows read top to bottom with full-width labels, so long names
 * such as "Source name v12" stay legible where angled column ticks would clip them.
 */
export function DivergingBars<T extends Record<string, string | number>>({
  data,
  labelKey,
  positive,
  negative,
  valueFormat = fmt,
  onSelect,
}: {
  data: T[];
  labelKey: keyof T & string;
  positive: SeriesDef[];
  negative: SeriesDef[];
  valueFormat?: (n: number) => string;
  onSelect?: (row: T) => void;
}) {
  if (!data.length) return <EmptyChart />;
  const rows = data.map((r) => {
    const out: Record<string, string | number> = { ...r };
    for (const s of negative) out[s.key] = -(Number(r[s.key]) || 0);
    return out;
  });
  const extent = Math.max(
    1,
    ...data.map((r) => positive.reduce((n, s) => n + (Number(r[s.key]) || 0), 0)),
    ...data.map((r) => negative.reduce((n, s) => n + (Number(r[s.key]) || 0), 0)),
  );
  const longest = Math.max(...data.map((r) => String(r[labelKey]).length), 4);
  const labelChars = Math.min(28, longest);
  const all = [...negative, ...positive];
  const lastPos = positive.length - 1;
  const lastNeg = negative.length - 1;
  return (
    <ResponsiveContainer width="100%" height={Math.max(140, data.length * 26 + 32)}>
      <BarChart data={rows} layout="vertical" stackOffset="sign" margin={{ top: 0, right: 12, bottom: 0, left: 0 }} barCategoryGap={5}>
        <CartesianGrid horizontal={false} stroke={GRID} />
        {/* Symmetric domain: equal distances mean equal counts on both sides of zero. */}
        <XAxis
          type="number"
          domain={[-extent, extent]}
          tick={AXIS}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
          tickCount={5}
          tickFormatter={(v: number) => compact(Math.abs(v))}
        />
        <YAxis
          type="category"
          dataKey={labelKey}
          width={labelChars * 6.4 + 14}
          tick={<CategoryTick max={labelChars} />}
          axisLine={false}
          tickLine={false}
          interval={0}
        />
        <Tooltip {...RECHARTS_TOOLTIP_PROPS} cursor={RECHARTS_BAR_CURSOR} formatter={(v: number) => valueFormat(Math.abs(v))} />
        <ReferenceLine x={0} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.5} />
        {all.map((s) => {
          const neg = negative.includes(s);
          const outer = neg ? negative.indexOf(s) === lastNeg : positive.indexOf(s) === lastPos;
          return (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId="d"
              fill={s.color}
              stroke="hsl(var(--card))"
              strokeWidth={1}
              radius={outer ? (neg ? [4, 0, 0, 4] : [0, 4, 4, 0]) : 0}
              maxBarSize={18}
              onClick={onSelect ? (_d: unknown, idx: number) => onSelect(data[idx]) : undefined}
              className={onSelect ? "cursor-pointer" : undefined}
            />
          );
        })}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Vertical columns (histograms, time buckets), optionally stacked. `colorFor` recolours single bars. */
export function Columns<T extends Record<string, string | number>>({
  data,
  xKey,
  series,
  height = 220,
  valueFormat = fmt,
  colorFor,
  onSelect,
  grouped = false,
}: {
  data: T[];
  xKey: keyof T & string;
  series: SeriesDef[];
  height?: number;
  valueFormat?: (n: number) => string;
  /** Side-by-side bars instead of stacked (compare series within a category). */
  grouped?: boolean;
  /** Per-bar colour for single-series charts (e.g. score bands). */
  colorFor?: (row: T) => string;
  onSelect?: (row: T) => void;
}) {
  if (!data.length) return <EmptyChart />;
  const last = series.length - 1;
  // Crowded or long category names: angle them and shorten, every label stays visible.
  const longest = Math.max(...data.map((r) => String(r[xKey]).length));
  const angled = data.length > 8 || data.length * longest > 60;
  const totals = data.flatMap((r) => series.map((s) => Number(r[s.key]) || 0));
  const yFmt = axisFmt(valueFormat);
  return (
    <ResponsiveContainer width="100%" height={height + (angled ? 36 : 0)}>
      <BarChart data={data} margin={{ top: 8, right: 4, bottom: angled ? 8 : 0, left: angled ? 24 : 0 }} barCategoryGap="18%" stackOffset="sign">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis
          dataKey={xKey}
          axisLine={{ stroke: GRID }}
          tickLine={false}
          interval={0}
          height={angled ? 64 : 24}
          tick={angled ? <CategoryTick max={14} angled /> : { ...AXIS }}
        />
        <YAxis
          tick={AXIS}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
          tickFormatter={yFmt}
          tickCount={5}
          width={axisWidth(totals, yFmt)}
        />
        <Tooltip {...RECHARTS_TOOLTIP_PROPS} cursor={RECHARTS_BAR_CURSOR} formatter={(v: number) => valueFormat(Math.abs(v))} />
        <ReferenceLine y={0} stroke="hsl(var(--border))" />
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            stackId={grouped ? undefined : "a"}
            fill={s.color}
            stroke="hsl(var(--card))"
            strokeWidth={1}
            radius={grouped || i === last ? [4, 4, 0, 0] : 0}
            maxBarSize={36}
            onClick={onSelect ? (_d: unknown, idx: number) => onSelect(data[idx]) : undefined}
            className={onSelect ? "cursor-pointer" : undefined}
          >
            {colorFor && series.length === 1 ? data.map((row, j) => <Cell key={j} fill={colorFor(row)} />) : null}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** One y-axis line chart over time or version number. Never pair two scales on it. */
export function Lines<T extends Record<string, string | number | null>>({
  data,
  xKey,
  series,
  height = 220,
  valueFormat = fmt,
  domain,
}: {
  data: T[];
  xKey: keyof T & string;
  series: SeriesDef[];
  height?: number;
  valueFormat?: (n: number) => string;
  domain?: [number, number];
}) {
  if (!data.length) return <EmptyChart />;
  const yFmt = axisFmt(valueFormat);
  const values = data.flatMap((r) => series.map((s) => Number(r[s.key]) || 0));
  // Long timelines get a brush to zoom into a range; the strip keeps the whole series in view.
  const zoomable = data.length > 24;
  return (
    <ResponsiveContainer width="100%" height={height + (zoomable ? 32 : 0)}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey={xKey} tick={AXIS} axisLine={{ stroke: GRID }} tickLine={false} minTickGap={24} />
        <YAxis
          tick={AXIS}
          axisLine={false}
          tickLine={false}
          tickFormatter={yFmt}
          tickCount={5}
          width={axisWidth(values, yFmt)}
          domain={domain ?? ["auto", "auto"]}
        />
        {zoomable && (
          <Brush dataKey={xKey} height={22} travellerWidth={8} stroke="hsl(var(--border))" fill="hsl(var(--card))" startIndex={Math.max(0, data.length - 24)} />
        )}
        <Tooltip {...RECHARTS_TOOLTIP_PROPS} cursor={RECHARTS_LINE_CURSOR} formatter={(v: number) => valueFormat(v)} />
        {series.map((s) => (
          <Line
            key={s.key}
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={2}
            dot={{ r: 3, strokeWidth: 2, fill: "hsl(var(--card))" }}
            activeDot={{ r: 5, stroke: "hsl(var(--card))", strokeWidth: 2 }}
            connectNulls
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** A single proportion as a thin meter with its value in text ink. */
export function Meter({ label, value, hint }: { label: string; value: number; hint?: string }) {
  const pct = Math.round(value * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between gap-2 text-xs">
        <span className="truncate text-muted-foreground">{label}</span>
        <span className="font-mono tabular-nums">{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" title={hint}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: SERIES[0] }} />
      </div>
    </div>
  );
}

/** Part-to-whole for a few categories (≤ 5): ring with the total in the middle. */
export function Donut({
  data,
  valueFormat = fmt,
  centerLabel = "total",
}: {
  data: { label: string; value: number; color: string }[];
  valueFormat?: (n: number) => string;
  centerLabel?: string;
}) {
  const total = data.reduce((n, d) => n + d.value, 0);
  if (!total) return <EmptyChart />;
  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative h-44 w-44 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius="68%"
              outerRadius="100%"
              stroke="hsl(var(--card))"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {data.map((d) => (
                <Cell key={d.label} fill={d.color} />
              ))}
            </Pie>
            <Tooltip {...RECHARTS_TOOLTIP_PROPS} formatter={(v: number) => valueFormat(v)} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-lg font-semibold tabular-nums">{valueFormat(total)}</span>
          <span className="text-[11px] text-muted-foreground">{centerLabel}</span>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-2 text-sm">
        {data.map((d) => (
          <li key={d.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: d.color }} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{d.label}</span>
            <span className="font-mono tabular-nums">{valueFormat(d.value)}</span>
            <span className="w-10 text-right text-xs text-muted-foreground">{Math.round((d.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Relationship between two measures (e.g. size vs price). Log axes suit property prices. */
/** Relationship between two measures (e.g. size vs price). Every point is drawn (canvas), none sampled. */
export function ScatterPlot<T extends Record<string, string | number>>({
  data,
  x,
  y,
  color = SERIES[0],
  height = 260,
  log = true,
  onSelect,
  tooltipLabel,
}: {
  data: T[];
  x: { key: keyof T & string; label: string; format?: (n: number) => string };
  y: { key: keyof T & string; label: string; format?: (n: number) => string };
  color?: string;
  height?: number;
  log?: boolean;
  onSelect?: (row: T) => void;
  tooltipLabel?: (row: T) => string;
}) {
  if (!data.length) return <EmptyChart />;
  return <CanvasScatter data={data} x={x} y={y} color={color} height={height} log={log} onSelect={onSelect} tooltipLabel={tooltipLabel} format={compact} />;
}

/**
 * Matrix of 0–1 values (rows × columns), one hue light→dark. Every cell prints its value,
 * so colour is a reading aid, never the only carrier.
 */
export function Heatmap({
  rows,
  columns,
  value,
  format = (v) => `${Math.round(v * 100)}%`,
  onRow,
}: {
  rows: string[];
  columns: { key: string; label: string }[];
  value: (row: string, col: string) => number | null;
  format?: (v: number) => string;
  onRow?: (row: string) => void;
}) {
  const [q, setQ] = useState("");
  if (!rows.length) return <EmptyChart />;
  const shown = q.trim() ? rows.filter((r) => r.toLowerCase().includes(q.trim().toLowerCase())) : rows;
  return (
    <div className="space-y-2">
      {rows.length > 12 && (
        <div className="relative w-full sm:w-56">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter rows…" className="h-8 pl-8 text-xs" aria-label="Filter rows" />
        </div>
      )}
    <div className="max-h-[28rem] overflow-auto">
      <table className="w-full border-separate border-spacing-0.5 text-xs">
        <thead className="sticky top-0 z-10 bg-card">
          <tr>
            <th />
            {columns.map((c) => (
              <th key={c.key} className="px-1 pb-1 text-center font-normal leading-tight text-muted-foreground">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r}>
              <th scope="row" className="max-w-40 truncate pr-2 text-left font-normal text-muted-foreground" title={r}>
                {onRow ? (
                  <button type="button" className="truncate hover:text-foreground hover:underline" onClick={() => onRow(r)}>
                    {r}
                  </button>
                ) : (
                  r
                )}
              </th>
              {columns.map((c) => {
                const v = value(r, c.key);
                const strong = v != null && v >= 0.55;
                return (
                  <td
                    key={c.key}
                    className={cn("h-8 min-w-12 rounded text-center font-mono tabular-nums", strong ? "text-white" : "text-foreground")}
                    style={{
                      background:
                        v == null ? "hsl(var(--muted))" : `color-mix(in oklab, var(--series-1) ${Math.round(8 + v * 82)}%, hsl(var(--card)))`,
                    }}
                  >
                    {v == null ? "—" : format(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </div>
  );
}
