import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * WCAG AA regression gate for the theme palette.
 *
 * This parses `src/index.css` rather than restating the colours, so a token
 * edited there without checking contrast fails here. Restating them would let
 * the two drift and quietly make this test meaningless.
 *
 * Design + measured values: docs/superpowers/specs/2026-07-28-light-dark-theme-design.md
 */

const AA_NORMAL = 4.5;

const CSS = readFileSync(path.resolve(__dirname, "../index.css"), "utf8");

/** Grab a top-level theme block's body. Anchored to the 2-space indent used
 *  inside `@layer base` so the 4-space `:root, .dark` print override is skipped. */
function block(selector: ":root" | ".dark", occurrence = 0): string {
  const escaped = selector.replace(".", "\\.");
  const re = new RegExp(`^ {2}${escaped} \\{$([\\s\\S]*?)^ {2}\\}$`, "gm");
  const matches = [...CSS.matchAll(re)];
  const found = matches[occurrence];
  if (!found) throw new Error(`theme block ${selector}[${occurrence}] not found in index.css`);
  return found[1];
}

function tokensOf(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/^\s*(--[a-z0-9-]+):\s*([^;]+);/gim)) {
    out[m[1]] = m[2].trim();
  }
  return out;
}

// Block order in index.css: shared :root, light :root, then .dark.
const SHARED = tokensOf(block(":root", 0));
const LIGHT = { ...SHARED, ...tokensOf(block(":root", 1)) };
const DARK = { ...SHARED, ...tokensOf(block(".dark", 0)) };

/** Resolve `var(--x)` indirection (e.g. `--foreground: var(--sb-mist)`). */
function resolve(tokens: Record<string, string>, name: string, depth = 0): string {
  const raw = tokens[name];
  if (raw === undefined) throw new Error(`token ${name} is not defined`);
  if (depth > 8) throw new Error(`token ${name} has circular var() references`);
  const m = raw.match(/^var\((--[a-z0-9-]+)\)$/i);
  return m ? resolve(tokens, m[1], depth + 1) : raw;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const sn = s / 100;
  const ln = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number) => ln - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function parseHsl(value: string): [number, number, number] {
  // Tailwind convention: bare `H S% L%`, no hsl() wrapper, no alpha.
  const m = value.match(/^(-?[\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  if (!m) throw new Error(`cannot parse as opaque HSL: "${value}"`);
  return hslToRgb(Number(m[1]), Number(m[2]), Number(m[3]));
}

function contrast(tokens: Record<string, string>, fg: string, bg: string): number {
  const [l1, l2] = [
    relativeLuminance(parseHsl(resolve(tokens, fg))),
    relativeLuminance(parseHsl(resolve(tokens, bg))),
  ].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Text pairs that must clear AA. Extend this when a new pairing ships. */
const PAIRS: ReadonlyArray<readonly [fg: string, bg: string]> = [
  ["--foreground", "--background"],
  ["--foreground", "--card"],
  ["--foreground", "--popover"],
  ["--foreground", "--accent"],
  ["--foreground", "--muted"],
  ["--muted-foreground", "--background"],
  ["--muted-foreground", "--card"],
  ["--muted-foreground", "--muted"],
  ["--muted-foreground", "--accent"],
  ["--primary-text", "--background"],
  ["--primary-text", "--card"],
  ["--primary-foreground", "--primary"],
  ["--secondary-foreground", "--secondary"],
  ["--secondary-text", "--card"],
  ["--destructive-foreground", "--destructive"],
  ["--destructive-text", "--card"],
  ["--destructive-text", "--background"],
  ["--success", "--card"],
  ["--warning", "--card"],
  ["--sidebar-foreground", "--sidebar-background"],
  ["--sidebar-primary-foreground", "--sidebar-primary"],
  ["--on-media", "--primary"],
];

describe.each([
  ["light", LIGHT],
  ["dark", DARK],
])("%s theme meets WCAG AA", (_name, tokens) => {
  it.each(PAIRS)("%s on %s clears 4.5:1", (fg, bg) => {
    expect(contrast(tokens, fg, bg)).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});

describe("palette invariants", () => {
  it("parses all three theme blocks", () => {
    expect(Object.keys(LIGHT).length).toBeGreaterThan(20);
    expect(Object.keys(DARK).length).toBeGreaterThan(20);
  });

  it("defines every token used by a checked pair in both themes", () => {
    for (const name of new Set(PAIRS.flat())) {
      expect(() => resolve(LIGHT, name), `light: ${name}`).not.toThrow();
      expect(() => resolve(DARK, name), `dark: ${name}`).not.toThrow();
    }
  });

  it("keeps --primary unusable as text on dark, which is why --primary-text exists", () => {
    // Guards the reasoning, not just the value: if someone lightens --primary
    // to "fix" this, --primary-text becomes redundant and this test should be
    // revisited deliberately rather than silently passing.
    expect(contrast(DARK, "--primary", "--background")).toBeLessThan(AA_NORMAL);
    expect(contrast(DARK, "--primary-text", "--background")).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it("keeps --destructive unusable as text on the dark card, hence --destructive-text", () => {
    expect(contrast(DARK, "--destructive", "--card")).toBeLessThan(AA_NORMAL);
    expect(contrast(DARK, "--destructive-text", "--card")).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it("uses --primary as a fill behind --primary-foreground in both themes", () => {
    expect(contrast(LIGHT, "--primary-foreground", "--primary")).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrast(DARK, "--primary-foreground", "--primary")).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});
