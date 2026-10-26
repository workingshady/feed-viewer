import { dotSprite, stamp } from "@/lib/canvasDots";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import L from "leaflet";
import Supercluster from "supercluster";
import { LayersControl, MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { Listing } from "@/lib/types";
import { cn } from "@/lib/utils";
import { OSM_ATTRIBUTION, OSM_TILE_URL, SATELLITE_ATTRIBUTION, SATELLITE_TILE_URL } from "@/components/ListingsMap";
import { listingPpsf, type GeoOutlier, type MarketCluster } from "@/lib/geoOutliers";
import { MARKETS, marketOf, type MarketCode } from "@/lib/markets";
import "leaflet/dist/leaflet.css";

export type GeoPointsMapView = {
  center: { lat: number; lng: number };
  zoom: number;
  bounds: { north: number; south: number; east: number; west: number } | null;
};

/** How points are drawn: grouped clusters, every pin, or a density grid. */
export type MapDisplayMode = "clusters" | "pins" | "density";
/** What a pin's colour encodes. */
export type MapColorBy = "purpose" | "ppsf" | "market" | "outlier";

/* ── colour ──────────────────────────────────────────────────────────────
 * Categorical (purpose, market): fixed series order, the same hue for an entity on every page.
 * Sequential (price per sq ft, density): one blue hue light → dark, five steps.
 * Status (outliers): reserved red / amber, always with a ring and a legend label, never colour alone. */

const SEQ = ["#c6dbef", "#9ecae1", "#6baed6", "#3182bd", "#08519c"];
const STATUS = { high: "#dc2626", medium: "#d97706", none: "#94a3b8" };
const NO_DATA = "#a3a3a3";

/** Canvas can't read CSS variables, so series tokens are resolved on each draw. */
function cssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}
function palette() {
  return {
    sale: cssVar("--series-1", "#2a78d6"),
    rent: cssVar("--series-2", "#eb6834"),
    other: cssVar("--series-4", "#eda100"),
    market: { AE: cssVar("--series-1", "#2a78d6"), SG: cssVar("--series-2", "#eb6834"), MY: cssVar("--series-3", "#1baf7a"), PK: cssVar("--series-4", "#eda100") } as Record<MarketCode, string>,
  };
}

/**
 * Price per sq ft → one of five sequential steps, using quintiles within the listing's own market
 * and purpose (currencies and sale/rent levels are never mixed on one scale).
 */
function ppsfBinner(listings: Listing[]) {
  const groups = new Map<string, number[]>();
  const key = (l: Listing) => `${marketOf(l).code}|${l.purpose}`;
  for (const l of listings) {
    const v = listingPpsf(l);
    if (v == null) continue;
    const arr = groups.get(key(l));
    if (arr) arr.push(v);
    else groups.set(key(l), [v]);
  }
  const edges = new Map<string, number[]>();
  for (const [k, v] of groups) {
    const s = v.sort((a, b) => a - b);
    edges.set(k, [0.2, 0.4, 0.6, 0.8].map((p) => s[Math.floor((s.length - 1) * p)]));
  }
  return (l: Listing): number | null => {
    const v = listingPpsf(l);
    const e = edges.get(key(l));
    if (v == null || !e) return null;
    return e.filter((x) => v > x).length;
  };
}

type Styler = (l: Listing) => { fill: string; ring: string | null };

function makeStyler(listings: Listing[], colorBy: MapColorBy, outliers?: Map<string, GeoOutlier>): Styler {
  const p = palette();
  const bin = colorBy === "ppsf" ? ppsfBinner(listings) : null;
  return (l) => {
    const o = outliers?.get(l.id);
    const ring = o ? (o.flags.some((f) => f.severity === "high") ? STATUS.high : STATUS.medium) : null;
    if (colorBy === "outlier") return { fill: o ? ring! : STATUS.none, ring };
    if (colorBy === "market") return { fill: p.market[marketOf(l).code], ring };
    if (colorBy === "ppsf") {
      const b = bin!(l);
      return { fill: b == null ? NO_DATA : SEQ[b], ring };
    }
    return { fill: l.purpose === "sale" ? p.sale : l.purpose === "rent" ? p.rent : p.other, ring };
  };
}

export function mapLegend(colorBy: MapColorBy, mode: MapDisplayMode, markets: MarketCode[]): { label: string; color: string; ring?: boolean }[] {
  const p = palette();
  if (mode === "density") return SEQ.map((c, i) => ({ label: ["fewest listings", "", "", "", "most listings"][i], color: c }));
  const base =
    colorBy === "purpose"
      ? [
          { label: "Sale", color: p.sale },
          { label: "Rent", color: p.rent },
          { label: "Other", color: p.other },
        ]
      : colorBy === "market"
        ? markets.map((m) => ({ label: MARKETS[m].name, color: p.market[m] }))
        : colorBy === "ppsf"
          ? [...SEQ.map((c, i) => ({ label: ["lowest 20% price / sq ft", "", "middle", "", "highest 20%"][i], color: c })), { label: "no size or price", color: NO_DATA }]
          : [{ label: "No issue", color: STATUS.none }];
  return [...base, { label: "Outlier (serious)", color: STATUS.high, ring: true }, { label: "Outlier", color: STATUS.medium, ring: true }];
}

/* ── map plumbing ───────────────────────────────────────────────────── */

function MapViewSync({ onViewChange, reportIntervalMs = 250 }: { onViewChange?: (view: GeoPointsMapView) => void; reportIntervalMs?: number }) {
  const lastSentAt = useRef<number>(0);
  const send = (map: L.Map) => {
    const now = Date.now();
    if (now - lastSentAt.current < reportIntervalMs) return;
    lastSentAt.current = now;
    const c = map.getCenter();
    const b = map.getBounds();
    onViewChange?.({
      center: { lat: c.lat, lng: c.lng },
      zoom: map.getZoom(),
      bounds: b ? { north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() } : null,
    });
  };
  useMapEvents({
    moveend(e) {
      send(e.target);
    },
    zoomend(e) {
      send(e.target);
    },
  });
  return null;
}

function FitBounds({ pts, fitSignal }: { pts: Array<{ lat: number; lng: number }>; fitSignal: number }) {
  const map = useMap();
  const didInitial = useRef(false);
  const lastSignal = useRef(fitSignal);
  useEffect(() => {
    if (pts.length === 0) return;
    const bumped = fitSignal !== lastSignal.current;
    lastSignal.current = fitSignal;
    if (didInitial.current && !bumped) return;
    if (pts.length === 1) map.setView([pts[0].lat, pts[0].lng], Math.max(map.getZoom(), 14));
    else map.fitBounds(L.latLngBounds(pts.map((p) => [p.lat, p.lng] as [number, number])), { padding: [42, 42], maxZoom: 14 });
    didInitial.current = true;
  }, [map, pts, fitSignal]);
  return null;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

type PinHandlers = {
  onHover?: (id: string | null) => void;
  onHoverPos?: (pos: { x: number; y: number } | null) => void;
  onSelect?: (id: string) => void;
};

function addPin(group: L.LayerGroup, renderer: L.Renderer, l: Listing, style: { fill: string; ring: string | null }, selected: boolean, h: React.MutableRefObject<PinHandlers>) {
  const r = clamp(3 + Math.log10((l.images?.length ?? 0) + 1) * 2.2, 3, 7) + (style.ring ? 1.5 : 0);
  const m = L.circleMarker([l.latitude!, l.longitude!], {
    renderer,
    radius: r,
    color: selected ? "#111827" : style.ring ?? style.fill,
    weight: selected ? 3 : style.ring ? 2.5 : 1,
    fillColor: style.fill,
    fillOpacity: selected ? 0.95 : 0.7,
  });
  m.on("mouseover", () => h.current.onHover?.(l.id));
  m.on("mouseout", () => {
    h.current.onHover?.(null);
    h.current.onHoverPos?.(null);
  });
  m.on("mousemove", (e: L.LeafletMouseEvent) => {
    const pt = e.containerPoint;
    if (pt && Number.isFinite(pt.x) && Number.isFinite(pt.y)) h.current.onHoverPos?.({ x: pt.x, y: pt.y });
  });
  m.on("click", () => h.current.onSelect?.(l.id));
  m.addTo(group);
  return m;
}

/**
 * Every pin drawn by one canvas in a single pass (points batched by colour), with hover and click
 * found through a pixel grid. Nothing is created per pin, so 100k+ listings pan and hover smoothly.
 */
function PinsLayer({ listings, styler, selectedId, handlers }: { listings: Listing[]; styler: Styler; selectedId?: string | null; handlers: PinHandlers }) {
  const map = useMap();
  const h = useRef(handlers);
  h.current = handlers;
  const sel = useRef(selectedId);
  sel.current = selectedId;
  const redrawRef = useRef<() => void>(() => {});

  // World pixel coordinates at zoom 0 and colours: computed once per data/colour change.
  const data = useMemo(() => {
    const n = listings.length;
    const x = new Float64Array(n);
    const y = new Float64Array(n);
    const fill: string[] = new Array(n);
    const ring: (string | null)[] = new Array(n);
    const r = new Float32Array(n);
    listings.forEach((l, i) => {
      const pt = L.CRS.EPSG3857.latLngToPoint(L.latLng(l.latitude!, l.longitude!), 0);
      x[i] = pt.x;
      y[i] = pt.y;
      const st = styler(l);
      fill[i] = st.fill;
      ring[i] = st.ring;
      r[i] = clamp(3 + Math.log10((l.images?.length ?? 0) + 1) * 2.2, 3, 7) + (st.ring ? 1.5 : 0);
    });
    const byFill = new Map<string, number[]>();
    const rings: number[] = [];
    for (let i = 0; i < n; i++) {
      if (ring[i]) rings.push(i);
      else {
        const arr = byFill.get(fill[i]);
        if (arr) arr.push(i);
        else byFill.set(fill[i], [i]);
      }
    }
    return { x, y, fill, ring, r, byFill, rings };
  }, [listings, styler]);

  useEffect(() => {
    const container = map.getContainer();
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;inset:0;z-index:400;pointer-events:none";
    container.appendChild(canvas);
    const ctx = canvas.getContext("2d")!;
    const CELL = 10;
    let grid = new Map<number, number[]>();
    let px = new Float32Array(0);
    let py = new Float32Array(0);
    let frame = 0;

    const draw = () => {
      frame = 0;
      const size = map.getSize();
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== size.x * dpr || canvas.height !== size.y * dpr) {
        canvas.width = size.x * dpr;
        canvas.height = size.y * dpr;
        canvas.style.width = `${size.x}px`;
        canvas.style.height = `${size.y}px`;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.x, size.y);
      const scale = 2 ** map.getZoom();
      const origin = map.getPixelOrigin();
      const offset = map.containerPointToLayerPoint([0, 0]);
      const n = data.x.length;
      px = new Float32Array(n);
      py = new Float32Array(n);
      grid = new Map();
      for (let i = 0; i < n; i++) {
        const cx = data.x[i] * scale - origin.x - offset.x;
        const cy = data.y[i] * scale - origin.y - offset.y;
        px[i] = cx;
        py[i] = cy;
        if (cx < -10 || cy < -10 || cx > size.x + 10 || cy > size.y + 10) continue;
        const k = Math.floor(cx / CELL) * 100000 + Math.floor(cy / CELL);
        const cell = grid.get(k);
        if (cell) cell.push(i);
        else grid.set(k, [i]);
      }
      const visible = (i: number) => px[i] > -10 && py[i] > -10 && px[i] < size.x + 10 && py[i] < size.y + 10;
      // Pre-drawn dots stamped with drawImage: a path of 100k arcs takes seconds, this milliseconds.
      ctx.globalAlpha = 0.75;
      for (const [color, idx] of data.byFill) {
        for (const i of idx) {
          if (visible(i)) stamp(ctx, dotSprite(color, data.r[i], dpr), px[i], py[i], dpr);
        }
      }
      // Outliers on top: filled, with a status ring.
      for (const i of data.rings) {
        if (!visible(i)) continue;
        ctx.globalAlpha = 0.9;
        stamp(ctx, dotSprite(data.fill[i], data.r[i], dpr, { color: data.ring[i]!, width: 2.5 }), px[i], py[i], dpr);
      }
      const s = sel.current ? listings.findIndex((l) => l.id === sel.current) : -1;
      if (s >= 0 && visible(s)) {
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(px[s], py[s], data.r[s] + 3, 0, Math.PI * 2);
        ctx.fillStyle = data.fill[s];
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#111827";
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    redrawRef.current = schedule;

    const nearest = (e: L.LeafletMouseEvent): number => {
      const { x, y } = e.containerPoint;
      const gx = Math.floor(x / CELL);
      const gy = Math.floor(y / CELL);
      let best = -1;
      let bestD = 9 * 9;
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          for (const i of grid.get((gx + dx) * 100000 + gy + dy) ?? []) {
            const d = (px[i] - x) ** 2 + (py[i] - y) ** 2;
            if (d <= Math.max(bestD, data.r[i] ** 2) && d <= bestD) {
              bestD = d;
              best = i;
            }
          }
      return best;
    };
    let hovered = -1;
    let posFrame = 0;
    let lastPos: { x: number; y: number } | null = null;
    const onMove = (e: L.LeafletMouseEvent) => {
      const i = nearest(e);
      container.style.cursor = i >= 0 ? "pointer" : "";
      if (i !== hovered) {
        hovered = i;
        h.current.onHover?.(i >= 0 ? listings[i].id : null);
        if (i < 0) h.current.onHoverPos?.(null);
      }
      if (i >= 0) {
        lastPos = { x: e.containerPoint.x, y: e.containerPoint.y };
        // At most one position update per frame keeps the page from re-rendering on every pixel.
        if (!posFrame)
          posFrame = requestAnimationFrame(() => {
            posFrame = 0;
            if (lastPos) h.current.onHoverPos?.(lastPos);
          });
      }
    };
    const onOut = () => {
      if (hovered >= 0) {
        hovered = -1;
        h.current.onHover?.(null);
        h.current.onHoverPos?.(null);
      }
    };
    const onClick = (e: L.LeafletMouseEvent) => {
      const i = nearest(e);
      if (i >= 0) h.current.onSelect?.(listings[i].id);
    };
    map.on("move zoom viewreset resize", schedule);
    map.on("mousemove", onMove);
    map.on("mouseout", onOut);
    map.on("click", onClick);
    draw();
    return () => {
      map.off("move zoom viewreset resize", schedule);
      map.off("mousemove", onMove);
      map.off("mouseout", onOut);
      map.off("click", onClick);
      if (frame) cancelAnimationFrame(frame);
      if (posFrame) cancelAnimationFrame(posFrame);
      container.style.cursor = "";
      canvas.remove();
    };
  }, [map, data, listings]);

  // A new selection only repaints; no data is rebuilt.
  useEffect(() => {
    redrawRef.current();
  }, [selectedId]);
  return null;
}

/**
 * Supercluster groups nearby pins per zoom level (bubble size ∝ log count). A red badge shows how
 * many outliers a cluster holds; clicking a cluster zooms into it. Markets are far apart, so a
 * cluster never mixes countries.
 */
function ClustersLayer({ listings, styler, selectedId, handlers }: { listings: Listing[]; styler: Styler; selectedId?: string | null; handlers: PinHandlers }) {
  const map = useMap();
  const h = useRef(handlers);
  h.current = handlers;
  const index = useMemo(() => {
    const sc = new Supercluster<{ i: number; o: number }, { o: number }>({
      radius: 60,
      maxZoom: 16,
      map: (p) => ({ o: p.o }),
      reduce: (acc, p) => {
        acc.o += p.o;
      },
    });
    sc.load(
      listings.map((l, i) => ({
        type: "Feature" as const,
        properties: { i, o: styler(l).ring ? 1 : 0 },
        geometry: { type: "Point" as const, coordinates: [l.longitude!, l.latitude!] },
      })),
    );
    return sc;
  }, [listings, styler]);

  useEffect(() => {
    const renderer = L.canvas({ padding: 0.5 });
    const group = L.layerGroup().addTo(map);
    const draw = () => {
      group.clearLayers();
      const b = map.getBounds();
      const z = Math.round(map.getZoom());
      const feats = index.getClusters([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], z);
      for (const f of feats) {
        const [lng, lat] = f.geometry.coordinates;
        const p = f.properties as { cluster?: boolean; cluster_id?: number; point_count?: number; i?: number; o: number };
        if (p.cluster) {
          const n = p.point_count ?? 0;
          const size = Math.round(clamp(26 + Math.log10(n) * 12, 28, 64));
          const icon = L.divIcon({
            className: "",
            iconSize: [size, size],
            html: `<div class="fvp-cluster" style="width:${size}px;height:${size}px">${n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : n}${p.o ? `<span class="fvp-cluster-badge" title="${p.o} outliers">${p.o}</span>` : ""}</div>`,
          });
          L.marker([lat, lng], { icon, keyboard: false, title: `${n} listings${p.o ? `, ${p.o} outliers` : ""}` })
            .on("click", () => map.flyTo([lat, lng], Math.min(index.getClusterExpansionZoom(p.cluster_id!), 18), { duration: 0.4 }))
            .addTo(group);
        } else {
          const l = listings[p.i!];
          addPin(group, renderer, l, styler(l), l.id === selectedId, h);
        }
      }
    };
    draw();
    map.on("moveend", draw);
    return () => {
      map.off("moveend", draw);
      group.remove();
      renderer.remove();
    };
  }, [map, index, listings, styler, selectedId]);
  return null;
}

/** Density grid: listings per ~28 px cell, five sequential steps; hover shows count and median price / sq ft. */
function DensityLayer({ listings }: { listings: Listing[] }) {
  const map = useMap();
  useEffect(() => {
    const renderer = L.canvas({ padding: 0.5 });
    const group = L.layerGroup().addTo(map);
    const draw = () => {
      group.clearLayers();
      const z = map.getZoom();
      const cell = (360 / 2 ** z / 256) * 28;
      const cells = new Map<string, { n: number; lat: number; lng: number; ppsf: number[] }>();
      for (const l of listings) {
        const ky = Math.floor(l.latitude! / cell);
        const kx = Math.floor(l.longitude! / cell);
        const k = `${ky}|${kx}`;
        const c = cells.get(k) ?? { n: 0, lat: ky * cell, lng: kx * cell, ppsf: [] };
        c.n++;
        const v = listingPpsf(l);
        if (v != null) c.ppsf.push(v);
        cells.set(k, c);
      }
      const counts = [...cells.values()].map((c) => c.n).sort((a, b) => a - b);
      const q = [0.2, 0.4, 0.6, 0.8].map((p) => counts[Math.floor((counts.length - 1) * p)] ?? 0);
      for (const c of cells.values()) {
        const step = q.filter((x) => c.n > x).length;
        const med = c.ppsf.length ? [...c.ppsf].sort((a, b) => a - b)[c.ppsf.length >> 1] : null;
        L.rectangle(
          [
            [c.lat, c.lng],
            [c.lat + cell, c.lng + cell],
          ],
          { renderer, weight: 0, fillColor: SEQ[step], fillOpacity: 0.75 },
        )
          .bindTooltip(`${c.n.toLocaleString()} listing${c.n === 1 ? "" : "s"}${med ? ` · median ${Math.round(med).toLocaleString()} / sq ft` : ""}`, { sticky: true })
          .addTo(group);
      }
    };
    draw();
    map.on("zoomend", draw);
    return () => {
      map.off("zoomend", draw);
      group.remove();
      renderer.remove();
    };
  }, [map, listings]);
  return null;
}

/** Dashed ring per market at the 95th-percentile distance: points beyond it are unusually far out. */
function MarketRings({ clusters }: { clusters: MarketCluster[] }) {
  const map = useMap();
  useEffect(() => {
    const group = L.layerGroup().addTo(map);
    const p = palette();
    for (const c of clusters) {
      if (!(c.ringKm > 0)) continue;
      L.circle([c.centre.lat, c.centre.lng], { radius: c.ringKm * 1000, color: p.market[c.code], weight: 2, dashArray: "6 6", fill: false, interactive: false }).addTo(group);
      L.circleMarker([c.centre.lat, c.centre.lng], { radius: 4, color: p.market[c.code], weight: 2, fillColor: "#fff", fillOpacity: 1 })
        .bindTooltip(`${MARKETS[c.code].name}: 95% of listings within ${c.ringKm.toFixed(1)} km of this centre · ${c.outliers.toLocaleString()} outliers`)
        .addTo(group);
    }
    return () => {
      group.remove();
    };
  }, [map, clusters]);
  return null;
}

export function GeoPointsMap({
  listings,
  heightClassName = "h-[min(72vh,700px)]",
  embedded = false,
  defaultBaseLayer = "satellite",
  mode,
  colorBy = "purpose",
  outliers,
  clusters,
  showRings = false,
  showLegend = true,
  selectedId,
  onHoverListingIdChange,
  onHoverListingPosChange,
  onSelectListingId,
  onViewChange,
  fitBoundsSignal = 0,
}: {
  listings: Listing[];
  heightClassName?: string;
  embedded?: boolean;
  defaultBaseLayer?: "streets" | "satellite";
  /** Default: clusters above 2,000 pins, otherwise every pin. */
  mode?: MapDisplayMode;
  colorBy?: MapColorBy;
  /** Outliers to ring on the map (from detectGeoOutliers). */
  outliers?: Map<string, GeoOutlier>;
  /** Market clusters for the dashed extent rings. */
  clusters?: MarketCluster[];
  showRings?: boolean;
  showLegend?: boolean;
  selectedId?: string | null;
  onHoverListingIdChange?: (id: string | null) => void;
  onHoverListingPosChange?: (pos: { x: number; y: number } | null) => void;
  onSelectListingId?: (id: string) => void;
  onViewChange?: (view: GeoPointsMapView) => void;
  fitBoundsSignal?: number;
}) {
  const withCoords = useMemo(
    () => listings.filter((l) => l.latitude != null && l.longitude != null && Number.isFinite(l.latitude) && Number.isFinite(l.longitude)),
    [listings],
  );
  const pts = useMemo(() => withCoords.map((l) => ({ lat: l.latitude!, lng: l.longitude! })), [withCoords]);
  // Re-colour when the theme switches (series tokens differ in dark mode).
  const [theme, setTheme] = useState(0);
  useEffect(() => {
    const mo = new MutationObserver(() => setTheme((t) => t + 1));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
    return () => mo.disconnect();
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- theme triggers a re-read of CSS colours
  const styler = useMemo(() => makeStyler(withCoords, colorBy, outliers), [withCoords, colorBy, outliers, theme]);
  const display: MapDisplayMode = mode ?? (withCoords.length > 2000 ? "clusters" : "pins");
  const markets = useMemo(() => [...new Set(withCoords.map((l) => marketOf(l).code))], [withCoords]);
  const handlers = { onHover: onHoverListingIdChange, onHoverPos: onHoverListingPosChange, onSelect: onSelectListingId };
  const center: [number, number] = pts.length > 0 ? [pts[0].lat, pts[0].lng] : [25.2048, 55.2708];
  const outlierCount = outliers ? withCoords.filter((l) => outliers.has(l.id)).length : 0;

  if (withCoords.length === 0) {
    return (
      <div className={cn("text-center text-muted-foreground text-sm", embedded ? "p-6 bg-muted/30" : "rounded-xl border border-border bg-card p-10")}>
        No listings with valid coordinates match the current filters. Map latitude and longitude fields in{" "}
        <Link to="/field-mapping" className="text-primary-text underline">
          XML field mapping
        </Link>
        .
      </div>
    );
  }

  const legend = mapLegend(colorBy, display, markets).filter((x) => (x.ring ? outlierCount > 0 : true));
  return (
    <div
      className={cn(
        "relative w-full overflow-hidden [&_.leaflet-container]:z-0 [&_.leaflet-control-layers]:text-xs [&_.leaflet-control-layers]:rounded-lg [&_.leaflet-control-layers]:border-border/80",
        heightClassName,
        embedded ? "rounded-b-2xl" : "rounded-xl border border-border",
      )}
    >
      <MapContainer center={center} zoom={11} className="h-full w-full" scrollWheelZoom preferCanvas>
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked={defaultBaseLayer === "streets"} name="Map">
            <TileLayer attribution={OSM_ATTRIBUTION} url={OSM_TILE_URL} />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer checked={defaultBaseLayer === "satellite"} name="Satellite">
            <TileLayer attribution={SATELLITE_ATTRIBUTION} url={SATELLITE_TILE_URL} />
          </LayersControl.BaseLayer>
        </LayersControl>
        <MapViewSync onViewChange={onViewChange} />
        <FitBounds pts={pts} fitSignal={fitBoundsSignal} />
        {display === "clusters" && <ClustersLayer listings={withCoords} styler={styler} selectedId={selectedId} handlers={handlers} />}
        {display === "pins" && <PinsLayer listings={withCoords} styler={styler} selectedId={selectedId} handlers={handlers} />}
        {display === "density" && <DensityLayer listings={withCoords} />}
        {showRings && clusters && <MarketRings clusters={clusters} />}
      </MapContainer>
      <div className="absolute bottom-2 left-2 z-[500] max-w-[min(calc(100%-1rem),22rem)] rounded-lg border border-border bg-background/90 px-2 py-1 text-[11px] text-muted-foreground shadow-sm">
        {withCoords.length.toLocaleString()} pin{withCoords.length === 1 ? "" : "s"} · {display === "clusters" ? "clustered (click a bubble to zoom)" : display === "density" ? "density grid" : "every pin"}
        {outlierCount ? ` · ${outlierCount.toLocaleString()} outliers ringed` : ""}
      </div>
      {showLegend && legend.length > 0 && (
        <div className="absolute bottom-2 right-2 z-[500] max-w-[15rem] space-y-1 rounded-lg border border-border bg-background/90 px-2.5 py-2 text-[11px] shadow-sm">
          {legend.map((x, i) => (
            <div key={i} className="flex items-center gap-2">
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={x.ring ? { border: `2.5px solid ${x.color}`, background: "transparent" } : { background: x.color }}
                aria-hidden
              />
              <span className="text-muted-foreground">{x.label || " "}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
