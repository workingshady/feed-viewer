import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import L from "leaflet";
import {
  LayersControl,
  MapContainer,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { Listing } from "@/lib/types";
import { cn } from "@/lib/utils";
import { OSM_ATTRIBUTION, OSM_TILE_URL, SATELLITE_ATTRIBUTION, SATELLITE_TILE_URL } from "@/components/ListingsMap";
import "leaflet/dist/leaflet.css";

export type GeoPointsMapView = {
  center: { lat: number; lng: number };
  zoom: number;
  bounds: { north: number; south: number; east: number; west: number } | null;
};

function MapViewSync({
  onViewChange,
  reportIntervalMs = 250,
}: {
  onViewChange?: (view: GeoPointsMapView) => void;
  reportIntervalMs?: number;
}) {
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

function FitBoundsOnce({
  pts,
  fitSignal,
  layoutRev,
}: {
  pts: Array<{ lat: number; lng: number }>;
  /** Increment to re-fit to points. */
  fitSignal: number;
  /** Increment when the pin set changes shape. */
  layoutRev: number;
}) {
  const map = useMap();
  const didInitial = useRef(false);
  const lastLayoutRev = useRef(layoutRev);

  useEffect(() => {
    if (pts.length === 0) return;
    const layoutBumped = layoutRev !== lastLayoutRev.current;
    if (layoutBumped) lastLayoutRev.current = layoutRev;
    if (didInitial.current && fitSignal === 0 && !layoutBumped) return;

    if (pts.length === 1) {
      map.setView([pts[0].lat, pts[0].lng], Math.max(map.getZoom(), 14));
      didInitial.current = true;
      return;
    }
    const b = L.latLngBounds(pts.map((p) => [p.lat, p.lng] as [number, number]));
    map.fitBounds(b, { padding: [42, 42], maxZoom: 14 });
    didInitial.current = true;
  }, [map, pts, fitSignal, layoutRev]);

  return null;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function colorForPurpose(purpose: string | undefined) {
  if (purpose === "sale") return "#22c55e"; // green
  if (purpose === "rent") return "#38bdf8"; // sky
  return "#a78bfa"; // violet
}

type PinHandlers = {
  onHover?: (id: string | null) => void;
  onHoverPos?: (pos: { x: number; y: number } | null) => void;
  onSelect?: (id: string) => void;
};

const pinStyle = (l: Listing, selected: boolean): L.CircleMarkerOptions => {
  const c = colorForPurpose(l.purpose);
  return { color: c, weight: selected ? 2.5 : 1, fillColor: c, fillOpacity: selected ? 0.9 : 0.65 };
};

/**
 * Every pin, drawn by Leaflet directly on one canvas. Creating the markers outside React keeps tens
 * of thousands of pins fast, so the map never needs to sample.
 */
function AllPinsLayer({ listings, selectedId, handlers }: { listings: Listing[]; selectedId?: string | null; handlers: PinHandlers }) {
  const map = useMap();
  const markers = useRef(new Map<string, { m: L.CircleMarker; l: Listing }>());
  const h = useRef(handlers);
  h.current = handlers;
  const selected = useRef<string | null>(null);

  useEffect(() => {
    const renderer = L.canvas({ padding: 0.5 });
    const group = L.layerGroup();
    const byId = new Map<string, { m: L.CircleMarker; l: Listing }>();
    for (const l of listings) {
      const r = clamp(3 + Math.log10((l.images?.length ?? 0) + 1) * 2.2, 3, 7);
      const m = L.circleMarker([l.latitude!, l.longitude!], { renderer, radius: r, ...pinStyle(l, l.id === selected.current) });
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
      byId.set(l.id, { m, l });
    }
    group.addTo(map);
    markers.current = byId;
    return () => {
      group.remove();
      renderer.remove();
    };
  }, [map, listings]);

  // Restyle only the previously and newly selected pins.
  useEffect(() => {
    const prev = selected.current ? markers.current.get(selected.current) : undefined;
    if (prev) prev.m.setStyle(pinStyle(prev.l, false));
    const next = selectedId ? markers.current.get(selectedId) : undefined;
    if (next) {
      next.m.setStyle(pinStyle(next.l, true));
      next.m.bringToFront();
    }
    selected.current = selectedId ?? null;
  }, [selectedId, listings]);

  return null;
}

export function GeoPointsMap({
  listings,
  heightClassName = "h-[min(72vh,700px)]",
  embedded = false,
  defaultBaseLayer = "satellite",
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
  /** Selected pin (locked by click). */
  selectedId?: string | null;
  /** Hovered pin (ephemeral). */
  onHoverListingIdChange?: (id: string | null) => void;
  /** Optional hover position (container pixel coordinates) for floating preview UI. */
  onHoverListingPosChange?: (pos: { x: number; y: number } | null) => void;
  /** Click pin to lock selection + open preview. */
  onSelectListingId?: (id: string) => void;
  /** Report map view so parent can keep state (bounds/zoom/center). */
  onViewChange?: (view: GeoPointsMapView) => void;
  /** Increment to re-fit bounds to current points. */
  fitBoundsSignal?: number;
}) {
  const layoutRev = 0;

  const withCoords = useMemo(() => {
    const pts = listings.filter(
      (l) =>
        l.latitude != null &&
        l.longitude != null &&
        Number.isFinite(l.latitude) &&
        Number.isFinite(l.longitude),
    );
    return pts;
  }, [listings]);

  const pts = useMemo(() => withCoords.map((l) => ({ lat: l.latitude!, lng: l.longitude! })), [withCoords]);

  const center: [number, number] =
    pts.length > 0 ? [pts[0].lat, pts[0].lng] : [25.2048, 55.2708];

  if (withCoords.length === 0) {
    return (
      <div
        className={cn(
          "text-center text-muted-foreground text-sm",
          embedded ? "p-6 bg-muted/30" : "rounded-xl border border-border bg-card p-10",
        )}
      >
        No listings with valid coordinates match the current filters. Map latitude and longitude fields in{" "}
        <Link to="/field-mapping" className="text-primary-text underline">
          XML field mapping
        </Link>
        .
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden [&_.leaflet-container]:z-0 [&_.leaflet-control-layers]:text-xs [&_.leaflet-control-layers]:rounded-lg [&_.leaflet-control-layers]:border-border/80",
        heightClassName,
        embedded ? "rounded-b-2xl" : "rounded-xl border border-border",
      )}
    >
      <MapContainer
        center={center}
        zoom={11}
        className="h-full w-full"
        scrollWheelZoom
        preferCanvas
      >
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked={defaultBaseLayer === "streets"} name="Map">
            <TileLayer attribution={OSM_ATTRIBUTION} url={OSM_TILE_URL} />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer checked={defaultBaseLayer === "satellite"} name="Satellite">
            <TileLayer attribution={SATELLITE_ATTRIBUTION} url={SATELLITE_TILE_URL} />
          </LayersControl.BaseLayer>
        </LayersControl>
        <MapViewSync onViewChange={onViewChange} />
        <FitBoundsOnce pts={pts} fitSignal={fitBoundsSignal} layoutRev={layoutRev} />

        <AllPinsLayer
          listings={withCoords}
          selectedId={selectedId}
          handlers={{ onHover: onHoverListingIdChange, onHoverPos: onHoverListingPosChange, onSelect: onSelectListingId }}
        />
      </MapContainer>
      <div className="absolute bottom-2 left-2 z-[500] max-w-[min(calc(100%-1rem),22rem)] rounded-lg border border-border bg-background/90 px-2 py-1 text-[11px] text-muted-foreground shadow-sm">
        Showing all {withCoords.length.toLocaleString()} pin{withCoords.length === 1 ? "" : "s"}
      </div>
    </div>
  );
}

