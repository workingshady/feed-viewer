import { beforeEach, describe, expect, it } from "vitest";
import {
  applyTheme,
  DEFAULT_MODE,
  isThemeMode,
  prefersDarkScheme,
  readStoredMode,
  resolveTheme,
  THEME_STORAGE_KEY,
  writeStoredMode,
} from "./theme";

/** Storage stub whose every method throws — Safari private mode, blocked policy. */
const throwingStorage = {
  getItem() {
    throw new Error("storage disabled");
  },
  setItem() {
    throw new Error("storage disabled");
  },
};

/** Minimal matchMedia stand-in. The global stub in test/setup.ts is hardcoded
 *  to matches:false, so system-mode cases inject this instead. */
const winWithPrefersDark = (matches: boolean) => ({
  matchMedia: (query: string) => ({ matches, media: query }) as MediaQueryList,
});

describe("isThemeMode", () => {
  it("accepts the three valid modes", () => {
    expect(isThemeMode("light")).toBe(true);
    expect(isThemeMode("dark")).toBe(true);
    expect(isThemeMode("system")).toBe(true);
  });

  it("rejects anything else", () => {
    for (const bad of ["", "blue", "Dark", "DARK", null, undefined, 0, 1, {}, [], true]) {
      expect(isThemeMode(bad)).toBe(false);
    }
  });
});

describe("readStoredMode", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns a stored valid mode", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    expect(readStoredMode()).toBe("light");
  });

  it("falls back to the default when nothing is stored", () => {
    expect(readStoredMode()).toBe(DEFAULT_MODE);
  });

  it("defaults to dark so existing users' appearance never changes", () => {
    expect(DEFAULT_MODE).toBe("dark");
  });

  it.each(["", "blue", "Dark", '{"mode":"light"}', "null"])(
    "falls back to the default for corrupt value %j",
    (raw) => {
      localStorage.setItem(THEME_STORAGE_KEY, raw);
      expect(readStoredMode()).toBe(DEFAULT_MODE);
    },
  );

  it("falls back to the default when storage throws", () => {
    expect(readStoredMode(throwingStorage)).toBe(DEFAULT_MODE);
  });
});

describe("writeStoredMode", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("persists the mode", () => {
    writeStoredMode("system");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("system");
  });

  it("does not throw when storage is unavailable", () => {
    expect(() => writeStoredMode("light", throwingStorage)).not.toThrow();
  });

  it("uses a feedviewer-prefixed key so workspace snapshots cannot wipe it", () => {
    // wipeRexmlLocalStorage() in workspaceSnapshot.ts removes `rexml_` keys.
    // A rexml_-prefixed theme key would be clobbered on snapshot apply.
    expect(THEME_STORAGE_KEY.startsWith("rexml_")).toBe(false);
    expect(THEME_STORAGE_KEY).toBe("feedviewer.theme");
  });
});

describe("resolveTheme", () => {
  it("honours an explicit choice regardless of the OS preference", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("light", false)).toBe("light");
    expect(resolveTheme("dark", true)).toBe("dark");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("follows the OS preference only under system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});

describe("prefersDarkScheme", () => {
  it("reads the media query", () => {
    expect(prefersDarkScheme(winWithPrefersDark(true))).toBe(true);
    expect(prefersDarkScheme(winWithPrefersDark(false))).toBe(false);
  });

  it("defaults to dark when matchMedia is missing", () => {
    // Landing on the app's existing appearance beats guessing light.
    expect(prefersDarkScheme({} as Window)).toBe(true);
    expect(prefersDarkScheme(null)).toBe(true);
  });

  it("defaults to dark when matchMedia throws", () => {
    const hostile = {
      matchMedia() {
        throw new Error("nope");
      },
    } as unknown as Window;
    expect(prefersDarkScheme(hostile)).toBe(true);
  });
});

describe("applyTheme", () => {
  it("adds the dark class and sets color-scheme for dark", () => {
    const el = document.createElement("html");
    applyTheme("dark", el);
    expect(el.classList.contains("dark")).toBe(true);
    expect(el.style.colorScheme).toBe("dark");
  });

  it("removes the dark class and sets color-scheme for light", () => {
    const el = document.createElement("html");
    el.classList.add("dark");
    applyTheme("light", el);
    expect(el.classList.contains("dark")).toBe(false);
    expect(el.style.colorScheme).toBe("light");
  });

  it("is idempotent", () => {
    const el = document.createElement("html");
    applyTheme("dark", el);
    applyTheme("dark", el);
    expect(el.classList.contains("dark")).toBe(true);
    expect(el.className.match(/dark/g)).toHaveLength(1);
  });

  it("does not throw when there is no element to apply to", () => {
    expect(() => applyTheme("light", null)).not.toThrow();
  });
});
