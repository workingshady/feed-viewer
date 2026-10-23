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
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
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
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
        <div className="min-w-0 space-y-1">
          <CardTitle className="text-sm">{title}</CardTitle>
          {description && <CardDescription className="text-xs">{description}</CardDescription>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {actions}
          {table && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label={asTable ? "Show chart" : "Show table"}
                title={asTable ? "Show chart" : "Show table"}
                onClick={() => setAsTable((v) => !v)}
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
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-3">
        {legend && legend.length > 1 && !asTable && <Legend series={legend} />}
        {asTable && table ? (
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
        ) : (
          children
        )}
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
}: {
  data: T[];
  xKey: keyof T & string;
  series: SeriesDef[];
  height?: number;
  valueFormat?: (n: number) => string;
  /** Per-bar colour for single-series charts (e.g. score bands). */
  colorFor?: (row: T) => string;
  onSelect?: (row: T) => void;
}) {
  if (!data.length) return <EmptyChart />;
  const last = series.length - 1;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -12 }} barCategoryGap="18%">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey={xKey} tick={AXIS} axisLine={{ stroke: GRID }} tickLine={false} interval="preserveStartEnd" minTickGap={8} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} tickFormatter={valueFormat} />
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
            radius={i === last ? [4, 4, 0, 0] : 0}
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
