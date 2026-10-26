import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Scatter plot drawn on a canvas so every point is plotted — tens of thousands of listings — with
 * no sampling. Overlap is handled by transparency that scales with the number of points; hover
 * finds the nearest point through a pixel grid, and a click opens it.
 */
export type ScatterAxis<T> = { key: keyof T & string; label: string; format?: (n: number) => string };

const M = { top: 8, right: 12, bottom: 34, left: 60 };
const HIT_PX = 8;

/** Resolves CSS colours such as `var(--series-1)` or `hsl(var(--border))` to something a canvas understands. */
function resolve(probe: HTMLElement, css: string): string {
  probe.style.color = "";
  probe.style.color = css;
  return getComputedStyle(probe).color || css;
}

function logTicks(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let k = Math.floor(Math.log10(lo)); k <= Math.ceil(Math.log10(hi)); k++) for (const m of [1, 2, 5]) out.push(m * 10 ** k);
  const inRange = out.filter((v) => v >= lo && v <= hi);
  return inRange.length > 8 ? inRange.filter((v) => /^1/.test(String(v))) : inRange;
}

function linearTicks(lo: number, hi: number): number[] {
  const raw = (hi - lo) / 5 || 1;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(v);
  return out;
}

export function CanvasScatter<T extends Record<string, string | number>>({
  data,
  x,
  y,
  color,
  height,
  log,
  onSelect,
  tooltipLabel,
  format,
}: {
  data: T[];
  x: ScatterAxis<T>;
  y: ScatterAxis<T>;
  color: string;
  height: number;
  log: boolean;
  onSelect?: (row: T) => void;
  tooltipLabel?: (row: T) => string;
  format: (n: number) => string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const probe = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState(0);
  const [theme, setTheme] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [mode, setMode] = useState<"all" | "sampled">("all");

  // Redraw on resize and on light/dark switches (colours are read from CSS variables).
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    const mo = new MutationObserver(() => setTheme((t) => t + 1));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, []);

  const xf = x.format ?? format;
  const yf = y.format ?? format;

  /** Valid points (positive values on log scales), keeping the row index for hover and click. */
  const pts = useMemo(() => {
    const out: { i: number; x: number; y: number }[] = [];
    data.forEach((r, i) => {
      const vx = Number(r[x.key]);
      const vy = Number(r[y.key]);
      if (Number.isFinite(vx) && Number.isFinite(vy) && (!log || (vx > 0 && vy > 0))) out.push({ i, x: vx, y: vy });
    });
    return out;
  }, [data, x.key, y.key, log]);

  const scale = useMemo(() => {
    if (!pts.length || !width) return null;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of pts) {
      if (p.x < x0) x0 = p.x;
      if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y;
      if (p.y > y1) y1 = p.y;
    }
    const t = log ? Math.log10 : (v: number) => v;
    const pad = (a: number, b: number) => {
      const d = (t(b) - t(a)) * 0.04 || (log ? 0.1 : Math.abs(t(a)) * 0.1 || 1);
      return [t(a) - d, t(b) + d];
    };
    const [tx0, tx1] = pad(x0, x1);
    const [ty0, ty1] = pad(y0, y1);
    const w = width - M.left - M.right;
    const h = height - M.top - M.bottom;
    const inv = (v: number) => (log ? 10 ** v : v);
    return {
      px: (v: number) => M.left + ((t(v) - tx0) / (tx1 - tx0)) * w,
      py: (v: number) => M.top + h - ((t(v) - ty0) / (ty1 - ty0)) * h,
      xTicks: (log ? logTicks : linearTicks)(inv(tx0), inv(tx1)),
      yTicks: (log ? logTicks : linearTicks)(inv(ty0), inv(ty1)),
      w,
      h,
    };
  }, [pts, width, height, log]);

  /**
   * Sampled view: one point per 3×3-pixel cell. Points hidden under another point are dropped, but
   * every visible position — outliers included — stays, so the shape is the same as the full plot.
   */
  const shown = useMemo(() => {
    if (mode === "all" || !scale) return pts;
    const seen = new Set<string>();
    return pts.filter((p) => {
      const k = `${Math.round(scale.px(p.x) / 3)}|${Math.round(scale.py(p.y) / 3)}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [pts, scale, mode]);

  /** Pixel grid of point indexes for nearest-point hover. */
  const grid = useMemo(() => {
    const g = new Map<string, number[]>();
    if (!scale) return g;
    shown.forEach((p, k) => {
      const key = `${Math.floor(scale.px(p.x) / HIT_PX)}|${Math.floor(scale.py(p.y) / HIT_PX)}`;
      const cell = g.get(key);
      if (cell) cell.push(k);
      else g.set(key, [k]);
    });
    return g;
  }, [shown, scale]);

  useEffect(() => {
    const c = canvas.current;
    const pr = probe.current;
    if (!c || !pr || !scale) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = width * dpr;
    c.height = height * dpr;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const ink = resolve(pr, "hsl(var(--muted-foreground))");
    const gridColor = resolve(pr, "hsl(var(--border))");
    const fill = resolve(pr, color);
    ctx.font = "11px ui-sans-serif, system-ui, sans-serif";
    ctx.lineWidth = 1;
    ctx.strokeStyle = gridColor;
    ctx.fillStyle = ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (const v of scale.xTicks) {
      const X = Math.round(scale.px(v)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(X, M.top);
      ctx.lineTo(X, M.top + scale.h);
      ctx.stroke();
      ctx.fillText(xf(v), X, M.top + scale.h + 4);
    }
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (const v of scale.yTicks) {
      const Y = Math.round(scale.py(v)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(M.left, Y);
      ctx.lineTo(M.left + scale.w, Y);
      ctx.stroke();
      ctx.fillText(yf(v), M.left - 6, Y);
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(x.label, M.left + scale.w / 2, height - 2);
    // Transparency grows with the point count so dense areas read as darker, not as a solid blob.
    const n = shown.length;
    ctx.globalAlpha = Math.max(0.12, Math.min(0.6, 0.6 * Math.sqrt(800 / Math.max(n, 1))));
    ctx.fillStyle = fill;
    const r = n > 8000 ? 1.8 : n > 2000 ? 2.4 : 3.2;
    ctx.beginPath();
    for (const p of shown) {
      const X = scale.px(p.x);
      const Y = scale.py(p.y);
      ctx.moveTo(X + r, Y);
      ctx.arc(X, Y, r, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.globalAlpha = 1;
    if (hover != null && shown[hover]) {
      const p = shown[hover];
      ctx.beginPath();
      ctx.arc(scale.px(p.x), scale.py(p.y), 5, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = resolve(pr, "hsl(var(--card))");
      ctx.stroke();
    }
  }, [scale, shown, width, height, color, hover, theme, x.label, xf, yf]);

  const nearest = (e: React.MouseEvent<HTMLCanvasElement>): number | null => {
    if (!scale) return null;
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const cx = Math.floor(mx / HIT_PX);
    const cy = Math.floor(my / HIT_PX);
    let best: number | null = null;
    let bestD = HIT_PX * HIT_PX;
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const k of grid.get(`${cx + dx}|${cy + dy}`) ?? []) {
          const p = shown[k];
          const d = (scale.px(p.x) - mx) ** 2 + (scale.py(p.y) - my) ** 2;
          if (d <= bestD) {
            bestD = d;
            best = k;
          }
        }
    return best;
  };

  const hp = hover != null ? shown[hover] : null;
  const row = hp ? data[hp.i] : null;
  return (
    <div className="space-y-1.5">
    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
      <span>
        {mode === "all" ? `All ${pts.length.toLocaleString()} points` : `${shown.length.toLocaleString()} of ${pts.length.toLocaleString()} points (overlaps thinned; every outlier kept)`}
      </span>
      <div role="radiogroup" aria-label="Points shown" className="inline-flex rounded-md border p-0.5">
        {(["all", "sampled"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => {
              setHover(null);
              setMode(m);
            }}
            className={cn("rounded px-2 py-0.5", mode === m ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
          >
            {m === "all" ? "All points" : "Sampled"}
          </button>
        ))}
      </div>
    </div>
    <div ref={wrap} className="relative w-full" style={{ height }}>
      <span ref={probe} className="hidden" aria-hidden />
      <canvas
        ref={canvas}
        role="img"
        aria-label={`Scatter plot of ${pts.length.toLocaleString()} points: ${y.label} against ${x.label}${log ? " (log scales)" : ""}`}
        style={{ width, height, cursor: onSelect && hover != null ? "pointer" : "default" }}
        onMouseMove={(e) => setHover(nearest(e))}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => {
          const k = nearest(e);
          if (k != null && onSelect) onSelect(data[shown[k].i]);
        }}
      />
      {row && scale && hp && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md"
          style={{ left: Math.min(scale.px(hp.x) + 10, width - 200), top: Math.max(0, scale.py(hp.y) - 48) }}
        >
          {tooltipLabel && <div className="mb-0.5 max-w-[220px] truncate font-medium">{tooltipLabel(row)}</div>}
          <div className="text-muted-foreground">
            {x.label}: <span className="font-mono text-foreground">{xf(hp.x)}</span>
          </div>
          <div className="text-muted-foreground">
            {y.label}: <span className="font-mono text-foreground">{yf(hp.y)}</span>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
