/**
 * External map URLs — free OSM + Google Maps (no API key for opening in browser).
 * Coordinates should match listing latitude/longitude from the feed.
 */

/** OpenStreetMap centered on pin. */
export function openStreetMapPinUrl(lat: number, lng: number, zoom = 17): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}&zoom=${zoom}`;
}

/** Google Maps — search / place query at coordinates (road map). */
export function googleMapsQueryUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

/**
 * Google Maps — opens with satellite / aerial imagery at the pin.
 * Uses the standard @lat,lng,zoom + data flag for Earth view.
 */
export function googleMapsSatelliteUrl(lat: number, lng: number, zoom = 18): string {
  return `https://www.google.com/maps/@${lat},${lng},${zoom}z/data=!3m1!1e3`;
}
