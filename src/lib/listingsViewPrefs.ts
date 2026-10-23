const LS_GRID_COLS = "feedviewer.listings.gridCols";
const LS_GRID_LEGACY_MODE = "feedviewer.listings.gridMode";
const LS_GRID_LEGACY_MIN = "feedviewer.listings.gridMinPx";
const LS_ZOOM = "feedviewer.listings.zoom";

export const GRID_COLUMN_MIN = 1;
export const GRID_COLUMN_MAX = 6;

function migrateLegacyGridColumnCount(): number | null {
  try {
    const mode = localStorage.getItem(LS_GRID_LEGACY_MODE);
    const min = localStorage.getItem(LS_GRID_LEGACY_MIN);
    if (mode === "list") return 1;
    if (min) {
      const px = Number(min);
      if (px === 400) return 2;
      if (px === 340) return 3;
      if (px === 280) return 4;
      if (px === 240) return 5;
    }
  } catch { /* ignore */ }
  return null;
}

export function readListingsGridColumnCount(): number {
  try {
    const raw = localStorage.getItem(LS_GRID_COLS);
    if (raw) {
      const n = Number(raw);
      if (n >= GRID_COLUMN_MIN && n <= GRID_COLUMN_MAX) return n;
    }
    const migrated = migrateLegacyGridColumnCount();
    if (migrated != null) {
      writeListingsGridColumnCount(migrated);
      return migrated;
    }
  } catch { /* ignore */ }
  return 4;
}

export function writeListingsGridColumnCount(n: number): void {
  try {
    const c = Math.min(GRID_COLUMN_MAX, Math.max(GRID_COLUMN_MIN, Math.round(n)));
    localStorage.setItem(LS_GRID_COLS, String(c));
  } catch { /* ignore */ }
}

const ZOOM_MIN = 0.75;
const ZOOM_MAX = 1.35;
const ZOOM_STEP = 0.05;
const ZOOM_DEFAULT = 1;

export function readListingsZoom(): number {
  try {
    const raw = localStorage.getItem(LS_ZOOM);
    const n = raw ? Number(raw) : ZOOM_DEFAULT;
    if (!Number.isFinite(n)) return ZOOM_DEFAULT;
    return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(n * 100) / 100));
  } catch {
    return ZOOM_DEFAULT;
  }
}

export function writeListingsZoom(z: number): void {
  try {
    const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));
    localStorage.setItem(LS_ZOOM, String(clamped));
  } catch { /* ignore */ }
}

export function clampZoomStep(delta: number, current: number): number {
  const next = Math.round((current + delta * ZOOM_STEP) * 100) / 100;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
}

export { ZOOM_MIN, ZOOM_MAX, ZOOM_STEP, ZOOM_DEFAULT };

/**
 * Responsive column steps toward `n` columns on wide screens (mobile stays 1, then ramps up).
 */
export const LISTINGS_GRID_COL_CLASSES: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4",
  5: "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
  6: "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6",
};
