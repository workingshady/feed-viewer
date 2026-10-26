import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import L from "leaflet";
import {
  CircleMarker,
  LayersControl,
  MapContainer,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { Switch } from "@/components/ui/switch";
import { GEO_POINTS_MAP_DEFAULT_MAX_PINS } from "@/lib/geoPointsMapConstants";
import type { Listing } from "@/lib/types";
import { cn } from "@/lib/utils";
import { OSM_ATTRIBUTION, OSM_TILE_URL, SATELLITE_ATTRIBUTION, SATELLITE_TILE_URL } from "@/components/ListingsMap";
import "leaflet/dist/leaflet.css";

export { GEO_POINTS_MAP_DEFAULT_MAX_PINS } from "@/lib/geoPointsMapConstants";

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
  /** Increment when pin set changes shape (e.g. sampled ↔ all). */
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

export function GeoPointsMap({
  listings,
  heightClassName = "h-[min(72vh,700px)]",
  embedded = false,
  defaultBaseLayer = "satellite",
  maxPins = GEO_POINTS_MAP_DEFAULT_MAX_PINS,
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
  /** Max pins when “sampled” mode is on (toggle appears when coords exceed this). */
  maxPins?: number;
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
  const [showAllPins, setShowAllPins] = useState(false);
  const [layoutRev, setLayoutRev] = useState(0);

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

  const samplingApplies = withCoords.length > maxPins;
  useEffect(() => {
    if (!samplingApplies && showAllPins) setShowAllPins(false);
  }, [samplingApplies, showAllPins]);

  const sampled = useMemo(() => {
    if (!samplingApplies || showAllPins) return withCoords;
    const step = Math.ceil(withCoords.length / maxPins);
    const out: Listing[] = [];
    for (let i = 0; i < withCoords.length; i += step) out.push(withCoords[i]);
    return out;
  }, [withCoords, maxPins, samplingApplies, showAllPins]);

  const pts = useMemo(() => {
    return sampled.map((l) => ({ lat: l.latitude!, lng: l.longitude! }));
  }, [sampled]);

  const toggleShowAll = (on: boolean) => {
    setShowAllPins(on);
    setLayoutRev((n) => n + 1);
  };

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
      {samplingApplies ? (
        <div className="pointer-events-none absolute left-3 top-12 z-[500] flex max-w-[min(calc(100%-6rem),20rem)] flex-col gap-1 [&_*]:pointer-events-auto">
          <div
            className="flex items-center gap-2 rounded-lg border border-border bg-card/95 px-2.5 py-1.5 shadow-md backdrop-blur-sm"
            title={
              showAllPins
                ? "Drawing every pin can slow pan and zoom on large feeds."
                : `Evenly spaced sample of up to ${maxPins.toLocaleString()} pins for smoother pan and zoom.`
            }
          >
            <Switch
              id="geo-points-show-all"
              checked={showAllPins}
              onCheckedChange={toggleShowAll}
              aria-label={showAllPins ? "Use sampled pins for speed" : "Show all pins"}
            />
            <label htmlFor="geo-points-show-all" className="cursor-pointer text-xs font-medium leading-snug text-foreground">
              {showAllPins ? "All pins (may lag)" : `Sample for speed (max ${maxPins.toLocaleString()})`}
            </label>
          </div>
        </div>
      ) : null}
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

        {sampled.map((l) => {
          const lat = l.latitude!;
          const lng = l.longitude!;
          const stroke = colorForPurpose(l.purpose);
          const r = clamp(3 + Math.log10((l.images?.length ?? 0) + 1) * 2.2, 3, 7);
          const isSelected = selectedId != null && l.id === selectedId;
          return (
            <CircleMarker
              key={l.id}
              center={[lat, lng]}
              radius={r}
              pathOptions={{
                color: stroke,
                weight: isSelected ? 2.5 : 1,
                fillColor: stroke,
                fillOpacity: isSelected ? 0.9 : 0.65,
              }}
              eventHandlers={{
                mouseover: () => onHoverListingIdChange?.(l.id),
                mouseout: () => {
                  onHoverListingIdChange?.(null);
                  onHoverListingPosChange?.(null);
                },
                mousemove: (e) => {
                  const pt = (e as { containerPoint?: { x: number; y: number } } | undefined)?.containerPoint;
                  if (pt && Number.isFinite(pt.x) && Number.isFinite(pt.y)) onHoverListingPosChange?.({ x: pt.x, y: pt.y });
                },
                click: () => onSelectListingId?.(l.id),
              }}
            />
          );
        })}
      </MapContainer>
      <div className="absolute bottom-2 left-2 z-[500] max-w-[min(calc(100%-1rem),22rem)] rounded-lg border border-border bg-background/90 px-2 py-1 text-[11px] text-muted-foreground shadow-sm">
        {withCoords.length === sampled.length ? (
          <span>
            Showing all {withCoords.length.toLocaleString()} pin{withCoords.length === 1 ? "" : "s"}
            {showAllPins && samplingApplies ? " — full set; map may feel slower" : ""}
          </span>
        ) : (
          <span>
            Showing {sampled.length.toLocaleString()} of {withCoords.length.toLocaleString()} pins (sampled) — use the
            switch above for all pins
          </span>
        )}
      </div>
    </div>
  );
}

