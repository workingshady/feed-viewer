import { useState, type ReactNode } from "react";
import { BarChart3, Download, Table2 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  Scatter,
  ScatterChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RECHARTS_BAR_CURSOR, RECHARTS_LINE_CURSOR, RECHARTS_TOOLTIP_PROPS } from "@/lib/chartTheme";
import { downloadText } from "@/components/sources/format";
import { toCsv } from "@/lib/reports";
import { cn } from "@/lib/utils";

/** Categorical slots in their validated order. Assign by entity, never by rank, and never cycle past 8. */
export const SERIES = Array.from({ length: 8 }, (_, i) => `var(--series-${i + 1})`);

const GRID = "hsl(var(--chart-grid))";
const AXIS = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };

export type SeriesDef = { key: string; label: string; color: string };
export type TableData = { columns: string[]; rows: (string | number)[][] };

const fmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString() : n.toFixed(1));

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
          {table.rows.map((r, i) => (
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
    <Card className={cn("flex flex-col", className)}>
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
 * Horizontal bars, one or more stacked series. Rows are categories (sources, agents, checks…).
 * `onSelect` makes each row clickable.
 */
export function HBars<T extends Record<string, string | number>>({
  data,
  labelKey,
  series,
  valueFormat = fmt,
  onSelect,
  max,
}: {
  data: T[];
  labelKey: keyof T & string;
  series: SeriesDef[];
  valueFormat?: (n: number) => string;
  onSelect?: (row: T) => void;
  /** Fixed domain max (e.g. 100 for percentages). */
  max?: number;
}) {
  if (!data.length) return <EmptyChart />;
  const height = Math.max(120, data.length * 30 + 24);
  const last = series.length - 1;
  const rows = data.map((r) => ({ ...r, __total: series.reduce((n, s) => n + (Number(r[s.key]) || 0), 0) }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 0 }} barCategoryGap={6}>
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} domain={[0, max ?? "auto"]} tickFormatter={valueFormat} />
        <YAxis type="category" dataKey={labelKey} width={128} tick={AXIS} axisLine={false} tickLine={false} interval={0} />
        <Tooltip {...RECHARTS_TOOLTIP_PROPS} cursor={RECHARTS_BAR_CURSOR} formatter={(v: number) => valueFormat(v)} />
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            stackId="a"
            fill={s.color}
            stroke="hsl(var(--card))"
            strokeWidth={1}
            radius={i === last ? [0, 4, 4, 0] : 0}
            onClick={onSelect ? (_d: unknown, idx: number) => onSelect(data[idx]) : undefined}
            className={onSelect ? "cursor-pointer" : undefined}
            maxBarSize={22}
          >
            {i === last && (
              <LabelList dataKey="__total" position="right" fontSize={11} fill="hsl(var(--muted-foreground))" formatter={valueFormat} />
            )}
          </Bar>
        ))}
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
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -12 }} barCategoryGap="18%" stackOffset="sign">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey={xKey} tick={AXIS} axisLine={{ stroke: GRID }} tickLine={false} interval="preserveStartEnd" minTickGap={8} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} tickFormatter={valueFormat} />
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
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey={xKey} tick={AXIS} axisLine={{ stroke: GRID }} tickLine={false} minTickGap={16} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={valueFormat} domain={domain ?? ["auto", "auto"]} />
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
  const xf = x.format ?? fmt;
  const yf = y.format ?? fmt;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 8, right: 12, bottom: 16, left: -4 }}>
        <CartesianGrid stroke={GRID} />
        <XAxis
          type="number"
          dataKey={x.key}
          name={x.label}
          scale={log ? "log" : "auto"}
          domain={["auto", "auto"]}
          tick={AXIS}
          tickFormatter={xf}
          axisLine={{ stroke: GRID }}
          tickLine={false}
          label={{ value: x.label, position: "insideBottom", offset: -10, fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
        />
        <YAxis
          type="number"
          dataKey={y.key}
          name={y.label}
          scale={log ? "log" : "auto"}
          domain={["auto", "auto"]}
          tick={AXIS}
          tickFormatter={yf}
          axisLine={false}
          tickLine={false}
          width={56}
        />
        <ZAxis range={[28, 28]} />
        <Tooltip
          cursor={{ strokeDasharray: "3 3" }}
          content={({ payload }) => {
            const row = payload?.[0]?.payload as T | undefined;
            if (!row) return null;
            return (
              <div style={RECHARTS_TOOLTIP_PROPS.contentStyle}>
                {tooltipLabel && <div style={RECHARTS_TOOLTIP_PROPS.labelStyle}>{tooltipLabel(row)}</div>}
                <div style={RECHARTS_TOOLTIP_PROPS.itemStyle}>
                  {x.label}: {xf(Number(row[x.key]))}
                </div>
                <div style={RECHARTS_TOOLTIP_PROPS.itemStyle}>
                  {y.label}: {yf(Number(row[y.key]))}
                </div>
              </div>
            );
          }}
        />
        <Scatter
          data={data}
          fill={color}
          fillOpacity={0.55}
          isAnimationActive={false}
          onClick={onSelect ? (d: { payload: T }) => onSelect(d.payload) : undefined}
          className={onSelect ? "cursor-pointer" : undefined}
        />
      </ScatterChart>
    </ResponsiveContainer>
  );
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
  if (!rows.length) return <EmptyChart />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0.5 text-xs">
        <thead>
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
          {rows.map((r) => (
            <tr key={r}>
              <th scope="row" className="max-w-40 truncate pr-2 text-left font-normal text-muted-foreground">
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
  );
}
