import { useCallback, useEffect, useMemo, useState } from "react";
import {
  applyTheme,
  DARK_MEDIA_QUERY,
  isThemeMode,
  prefersDarkScheme,
  readStoredMode,
  resolveTheme,
  THEME_STORAGE_KEY,
  writeStoredMode,
  type ResolvedTheme,
  type ThemeMode,
} from "@/lib/theme";

export type UseThemeResult = {
  /** What the user chose: light, dark, or follow-the-OS. */
  mode: ThemeMode;
  /** What that actually renders as right now. */
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
};

/**
 * Reads/writes the theme and keeps it in sync with two external sources:
 * the OS preference (only while mode is `system`) and other tabs.
 *
 * The inline script in `index.html` has already applied the correct class
 * before this mounts, so there is no first-paint flash to correct here.
 */
export function useTheme(): UseThemeResult {
  const [mode, setModeState] = useState<ThemeMode>(() => readStoredMode());
  const [prefersDark, setPrefersDark] = useState<boolean>(() => prefersDarkScheme());

  const resolved = useMemo(() => resolveTheme(mode, prefersDark), [mode, prefersDark]);

  // Keep the DOM in step with the resolved theme.
  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  // OS preference changes. Tracked unconditionally but only *matters* when mode
  // is `system` — resolveTheme ignores it otherwise, so an explicit light/dark
  // choice is never overridden by the OS.
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(DARK_MEDIA_QUERY);
    const onChange = (e: MediaQueryListEvent) => setPrefersDark(e.matches);
    // Safari < 14 predates addEventListener on MediaQueryList.
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }
    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }, []);

  // Another tab changed the theme: adopt it so tabs don't disagree.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== THEME_STORAGE_KEY) return;
      if (isThemeMode(e.newValue)) setModeState(e.newValue);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    writeStoredMode(next);
  }, []);

  return { mode, resolved, setMode };
}
