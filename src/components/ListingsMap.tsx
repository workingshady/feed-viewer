import { useEffect } from "react";
import { Link } from "react-router-dom";
import L from "leaflet";
import { LayersControl, MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import type { Listing } from "@/lib/types";
import {
  googleMapsQueryUrl,
  googleMapsSatelliteUrl,
  openStreetMapPinUrl,
} from "@/lib/mapExternalLinks";
import { cn } from "@/lib/utils";
import "leaflet/dist/leaflet.css";

/** Free OSM tiles — uses exact listing latitude/longitude (from feed or geopoints). */
export const OSM_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
export const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Esri World Imagery — free satellite / aerial tiles (attribution required). */
export const SATELLITE_TILE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
export const SATELLITE_ATTRIBUTION =
  'Tiles &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community';

const DefaultIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

function FitBounds({
  listings,
  fitSingleZoom,
}: {
  listings: Listing[];
  /** Zoom when exactly one pin (higher = closer to building-level). */
  fitSingleZoom: number;
}) {
  const map = useMap();
  useEffect(() => {
    const pts = listings.filter(
      (l) =>
        l.latitude != null &&
        l.longitude != null &&
        Number.isFinite(l.latitude) &&
        Number.isFinite(l.longitude),
    );
    if (pts.length === 0) return;
    if (pts.length === 1) {
      map.setView([pts[0].latitude!, pts[0].longitude!], fitSingleZoom);
      return;
    }
    const b = L.latLngBounds(pts.map((l) => [l.latitude!, l.longitude!] as [number, number]));
    map.fitBounds(b, { padding: [48, 48], maxZoom: 14 });
  }, [map, listings, fitSingleZoom]);
  return null;
}

function popupPriceLine(l: Listing): string {
  if (!Number.isFinite(l.price) || l.price <= 0) return "POA";
  return `${l.price.toLocaleString()} ${l.currency || ""}`.trim();
}

type ListingsMapProps = {
  listings: Listing[];
  /** Outer map height (Tailwind classes). */
  heightClassName?: string;
  /** Nested inside an existing card — drops extra border/radius. */
  embedded?: boolean;
  /** Zoom for a single marker (default 14 on listings page, 16 on listing detail). */
  fitSingleZoom?: number;
  /** Which base layer is selected first (both remain available in the layer control). */
  defaultBaseLayer?: "streets" | "satellite";
};

export function ListingsMap({
  listings,
  heightClassName = "h-[min(70vh,560px)]",
  embedded = false,
  fitSingleZoom = 14,
  defaultBaseLayer = "satellite",
}: ListingsMapProps) {
  const withCoords = listings.filter(
    (l) =>
      l.latitude != null &&
      l.longitude != null &&
      Number.isFinite(l.latitude) &&
      Number.isFinite(l.longitude),
  );

  const center: [number, number] =
    withCoords.length > 0 ? [withCoords[0].latitude!, withCoords[0].longitude!] : [25.2048, 55.2708];

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
        </Link>{" "}
        if your feed includes them.
      </div>
    );
  }

  return (
    <div
      className={cn(
        "w-full overflow-hidden [&_.leaflet-container]:z-0 [&_.leaflet-control-layers]:text-xs [&_.leaflet-control-layers]:rounded-lg [&_.leaflet-control-layers]:border-border/80",
        heightClassName,
        embedded ? "rounded-b-2xl" : "rounded-xl border border-border",
      )}
    >
      <MapContainer center={center} zoom={11} className="h-full w-full" scrollWheelZoom>
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked={defaultBaseLayer === "streets"} name="Map">
            <TileLayer attribution={OSM_ATTRIBUTION} url={OSM_TILE_URL} />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer checked={defaultBaseLayer === "satellite"} name="Satellite">
            <TileLayer attribution={SATELLITE_ATTRIBUTION} url={SATELLITE_TILE_URL} />
          </LayersControl.BaseLayer>
        </LayersControl>
        <FitBounds listings={withCoords} fitSingleZoom={fitSingleZoom} />
        {withCoords.map((l) => {
          const lat = l.latitude!;
          const lng = l.longitude!;
          return (
            <Marker key={l.id} position={[lat, lng]}>
              <Popup>
                <div className="min-w-[180px] text-foreground">
                  <div className="font-semibold text-sm">{l.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{popupPriceLine(l)}</div>
                  <Link to={`/listing/${l.id}`} className="text-xs text-primary-text underline mt-2 inline-block">
                    View listing
                  </Link>
                  <div className="mt-2 pt-2 border-t border-border/60 flex flex-col gap-1.5 text-[10px]">
                    <span className="font-medium text-muted-foreground uppercase tracking-wide">Open in</span>
                    <div className="flex flex-wrap gap-x-2 gap-y-1">
                      <a
                        href={googleMapsQueryUrl(lat, lng)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary-text underline underline-offset-2"
                      >
                        Google (map)
                      </a>
                      <a
                        href={googleMapsSatelliteUrl(lat, lng)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary-text underline underline-offset-2"
                      >
                        Google (satellite)
                      </a>
                      <a
                        href={openStreetMapPinUrl(lat, lng)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground underline underline-offset-2"
                      >
                        OSM
                      </a>
                    </div>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
