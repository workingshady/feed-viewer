/**
 * Theme mode resolution and application.
 *
 * Every function here is pure or takes its side-effecting dependency as an
 * argument. That is deliberate, not stylistic: `src/test/setup.ts` installs a
 * `window.matchMedia` stub hardcoded to `matches: false` with no-op listeners,
 * so system-mode behaviour is untestable through the global. Injecting the
 * dependency keeps this module fully covered without fighting that stub.
 *
 * The inline script in `index.html` duplicates a few lines of this resolution
 * logic to apply the theme before first paint. That duplication is required —
 * a module import cannot run before the stylesheet — but this file stays the
 * source of truth. Change the storage key or the mode vocabulary here and the
 * inline script must be updated to match.
 *
 * Design: docs/superpowers/specs/2026-07-28-light-dark-theme-design.md
 */

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_MODES: readonly ThemeMode[] = ["light", "dark", "system"] as const;

/**
 * Storage key prefix is load-bearing. `workspaceSnapshot.ts` captures and wipes
 * localStorage filtered to the `rexml_` prefix (`wipeRexmlLocalStorage`), so a
 * `rexml_`-prefixed key here would be clobbered whenever a workspace snapshot
 * from another device was applied. `feedviewer.` keeps the theme a per-device
 * preference, matching the existing `feedviewer.listings.*` convention.
 */
export const THEME_STORAGE_KEY = "feedviewer.theme";

/**
 * Default when nothing valid is stored. Deliberately "dark", not "system":
 * this feature must not change the appearance for anyone who had no say in it.
 * Following the OS is opt-in.
 */
export const DEFAULT_MODE: ThemeMode = "dark";

export const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

/** Class toggled on <html>. Matches `darkMode: ["class"]` in tailwind.config.ts. */
const DARK_CLASS = "dark";

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === "string" && (THEME_MODES as readonly string[]).includes(value);
}

/**
 * Read the stored mode, falling back to {@link DEFAULT_MODE} for anything
 * unusable: absent, empty, misspelled, JSON, or a storage that throws
 * (Safari private mode, disabled storage, hardened enterprise policy).
 */
export function readStoredMode(storage?: Pick<Storage, "getItem"> | null): ThemeMode {
  const store = storage ?? safeLocalStorage();
  if (!store) return DEFAULT_MODE;
  try {
    const raw = store.getItem(THEME_STORAGE_KEY);
    return isThemeMode(raw) ? raw : DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

/** Persist the mode. A failure (quota, disabled storage) is non-fatal — the
 *  theme still applies for this session. */
export function writeStoredMode(mode: ThemeMode, storage?: Pick<Storage, "setItem"> | null): void {
  const store = storage ?? safeLocalStorage();
  if (!store) return;
  try {
    store.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    /* Non-fatal: preference is not persisted, current session is unaffected. */
  }
}

/** Resolve a mode to a concrete theme. `system` defers to the OS preference. */
export function resolveTheme(mode: ThemeMode, prefersDark: boolean): ResolvedTheme {
  if (mode === "light") return "light";
  if (mode === "dark") return "dark";
  return prefersDark ? "dark" : "light";
}

/**
 * Whether the OS currently prefers dark.
 *
 * Defaults to `true` when `matchMedia` is unavailable, so an environment that
 * cannot report a preference lands on the app's existing dark appearance rather
 * than flipping to light.
 */
export function prefersDarkScheme(win?: Pick<Window, "matchMedia"> | null): boolean {
  // `undefined` means "not supplied — use the global"; an explicit `null` means
  // "there is no window", which callers and tests rely on to exercise the
  // no-matchMedia path. Do not collapse these with `??`.
  const target = win === undefined ? (typeof window !== "undefined" ? window : null) : win;
  if (!target || typeof target.matchMedia !== "function") return true;
  try {
    return target.matchMedia(DARK_MEDIA_QUERY).matches;
  } catch {
    return true;
  }
}

/**
 * Apply a resolved theme to the document: the Tailwind `dark` class, the native
 * `color-scheme` (so scrollbars, date pickers and `<select>` popups match), and
 * the mobile address-bar colour.
 */
export function applyTheme(resolved: ResolvedTheme, root?: HTMLElement | null): void {
  const el = root ?? (typeof document !== "undefined" ? document.documentElement : null);
  if (!el) return;

  el.classList.toggle(DARK_CLASS, resolved === "dark");
  el.style.colorScheme = resolved;

  syncMetaThemeColor(el, resolved);
}

/**
 * Point `<meta name="theme-color">` at the resolved background so mobile
 * browser chrome matches the page. Reads the computed token rather than
 * hardcoding a hex, so it cannot drift from index.css.
 */
function syncMetaThemeColor(el: HTMLElement, resolved: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) return;
  let color = resolved === "dark" ? "#0f0f0f" : "#f6f8f5";
  try {
    const token = getComputedStyle(el).getPropertyValue("--background").trim();
    if (token) color = `hsl(${token})`;
  } catch {
    /* Fall back to the literal above. */
  }
  meta.setAttribute("content", color);
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    // Accessing localStorage itself throws when storage is blocked by policy.
    return null;
  }
}
