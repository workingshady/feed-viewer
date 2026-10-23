# Light/Dark Theme System — Design

**Date:** 2026-07-28
**Status:** Approved, ready for implementation planning
**Branch:** `perf-optimization-wip`

## Problem

The app has exactly one appearance, and it is dark. Every design token lives in
`:root` unconditionally; there is no `.dark` block. `index.html` hardcodes
`class="dark"` on `<html>` and `tailwind.config.ts` sets `darkMode: ["class"]`,
but that class currently governs nothing about the palette — only Tailwind's
`dark:` variant and `src/components/ui/chart.tsx`'s `THEMES` map.

There is no way for a user to choose light mode, and the codebase cannot support
one without work: 347 hardcoded dark-assuming color utilities are spread across
22 files.

### Verified accessibility defect in the current theme

`--primary` (`153 42% 20%`, #1D4734) against `--background` (`0 0% 6%`) measures
**1.86:1** — far below the WCAG AA minimum of 4.5:1. The `.pill-green`
component class (`src/index.css`) applies `text-primary`, so that text is
effectively unreadable today. The deep green is sound as a *fill* behind white
text (10.28:1) but cannot be used as text on a dark surface.

This is a pre-existing bug, not one introduced here, and this work fixes it.

## Goals

1. A professional light theme that is comfortable for extended use.
2. A user-facing toggle with light / dark / system modes.
3. Both themes correct across the whole app — no white-on-white or invisible
   surfaces.
4. All text pairs meet WCAG AA, enforced by a test so it cannot silently
   regress.
5. Dark mode's current appearance is preserved as the default.

### Non-goals

- No redesign of layout, spacing, typography, or component structure.
- No new brand colors. The existing `--sb-*` ramp is the source of truth.
- No theming of third-party map tiles (see Edge Cases).

## Current state audit

### Token inventory (`src/index.css`, all in `:root`)

| Role | Tokens | Values |
| --- | --- | --- |
| Surfaces (~60%) | background, card, popover, muted, accent, border/input | Pure neutral, `0%` saturation, lightness `6% → 9% → 10% → 12% → 14% → 18%` |
| Text (~30%) | foreground, muted-foreground | `--sb-mist` #E4E8E3 (`108 10% 90%`), grey `0 0% 70%` |
| Accent (~10%) | primary, secondary | `--sb-green` #1D4734, `--sb-amber` #E09B6B |

The brand ramp defines six colors, but `--sb-sand`, `--sb-rose`, and
`--sb-slate` are used only in ambient radial gradients and the listing accent.

Note the inconsistency this design exploits: **surfaces are pure grey (0%
saturation) while the foreground is green-tinted.** Tinting surfaces in light
mode is what makes it read as branded rather than generic.

### Hardcoded color debt

| Pattern | Count |
| --- | --- |
| `text-white` | 164 |
| `border-white/…` | 87 |
| `bg-white/…` | 78 |
| `bg-black/…` | 15 |
| `shadow-black` | 2 |
| `text-black` | 1 |
| **Total** | **347 across 22 files** |

Plus ~42 near-black hex literals: `#0a0a0a` (21), `#0f0f0f` (13), `#080808`
(5), `#070807` (5), `#0b1210` (2).

Specific offenders in `src/index.css`:

- `.dark-input` — `bg-[#111]`, `border-white/10`, `text-white`, `placeholder:text-white/25`
- `.premium-table` — `text-white/35`, `bg-white/3`, `border-white/8`, `text-white/65`
- `.pill-white` — `bg-white/5 border-white/10 text-white/60`
- `.section-eyebrow` — `text-white/30`
- `--listing-frame: 0 0% 100% / 0.06` — a white overlay hairline
- `::selection` — hardcoded `color: #fff`
- Shadows — black at **0.55–0.62 opacity**, which reads as grime on light surfaces
- `html { color-scheme: dark }` — hardcoded
- `src/components/ui/sonner.tsx` — `theme="dark"` hardcoded

**Critical distinction:** not all 347 are bugs. Many sit over hero images and
photo overlays — the header's `homeHero` mode over the dark green hero, image
badges, gradient scrims — where white is correct in *both* themes. The sweep is
a per-usage triage, never a find-and-replace.

### Already light-ready (no work needed)

`src/components/GitStyleDiffBlock.tsx` already uses paired variants
(`text-rose-600 dark:text-rose-400`, `bg-rose-500/12 text-rose-950
dark:bg-rose-950/35`). It works correctly once tokens are restructured, and it
establishes the `dark:` pairing precedent to follow elsewhere.

## Research basis

- Avoid pure `#FFFFFF` page backgrounds; off-white reduces visual fatigue.
- Light mode **inverts elevation** — higher surfaces are *lighter*, so cards go
  white above an off-white page. Dark mode does the opposite.
- A functional theme needs at least four surface levels: base, raised,
  secondary-raised, overlay.
- Limit to 3–5 semantic colors; decorative color adds noise without information.
- Light mode leans on hairline borders for separation; dark mode leans on shadow.
- Prevent theme flash with a render-blocking inline `<script>` in `<head>` that
  applies the stored theme before first paint. Keep it small and ES5-safe — it
  is not transpiled.

Sources: [shadcn theming](https://ui-private.shadcn.com/docs/theming) ·
[60-30-10 → CSS variables](https://www.sixtythirtyten.co/blog/shadcn-ui-color-system-60-30-10) ·
[Atlassian elevation](https://atlassian.design/foundations/elevation) ·
[Fluent 2 elevation](https://fluent2.microsoft.design/elevation) ·
[dark-mode tokens & hierarchy](https://muz.li/blog/dark-mode-design-systems-a-complete-guide-to-patterns-tokens-and-hierarchy/) ·
[preventing theme FOUC](https://www.notanumber.in/blog/fixing-react-dark-mode-flickering)

## Architecture

### Token restructure

`src/index.css` splits into three blocks:

1. `:root` — theme-independent values: `--font-*`, `--radius`, the six `--sb-*`
   brand colors.
2. `:root` — **light** theme values (the default cascade).
3. `.dark` — dark overrides.

`index.html` keeps `class="dark"` on `<html>`, so the default appearance is
unchanged for existing users. `color-scheme` moves out of the shared `html`
rule into each theme block.

### New semantic tokens

Introduced to eliminate hardcoded values:

| Token | Purpose |
| --- | --- |
| `--primary-text` | Brand green usable as *text*. Light: `153 42% 20%`. Dark: `153 45% 62%`. Fixes the 1.86:1 defect. |
| `--surface-raised` | Explicit level above `--card` (popovers, sticky panels). |
| `--hairline` | Replaces `--listing-frame` and the `border-white/8`-style ring overlays. |
| `--on-media` | Text/icons over photos, hero art, and colored fills. White in **both** themes — this is what the legitimate `text-white` usages become. |
| `--scrim` | Image/media overlay gradients, per-theme opacity. |

### Palette

All values HSL, matching the existing unwrapped `H S% L%` convention.

| Token | Light | Dark |
| --- | --- | --- |
| `--background` | `108 14% 97%` | `0 0% 6%` |
| `--card` | `0 0% 100%` | `0 0% 9%` |
| `--popover` / `--surface-raised` | `0 0% 100%` | `0 0% 10%` |
| `--muted` | `108 12% 94%` | `0 0% 12%` |
| `--accent` | `108 13% 91%` | `0 0% 14%` |
| `--border` / `--input` | `108 10% 86%` | `0 0% 18%` |
| `--foreground` | `158 24% 12%` | `108 10% 90%` |
| `--muted-foreground` | `158 10% 38%` | `0 0% 70%` |
| `--primary` (fill) | `153 42% 20%` | `153 42% 20%` |
| `--primary-text` | `153 42% 20%` | `153 45% 62%` |
| `--primary-foreground` | `0 0% 100%` | `0 0% 100%` |
| `--secondary` | `25 62% 58%` | `25 65% 65%` |
| `--secondary-foreground` | `25 80% 12%` | `0 0% 10%` |
| `--success` | `152 55% 32%` | `152 60% 40%` |
| `--warning` | `32 90% 33%` | `38 92% 50%` |
| `--destructive` | `0 70% 45%` | `0 72% 51%` |
| `--ring` | `153 42% 20%` | `153 45% 62%` |
| `--on-media` | `0 0% 100%` | `0 0% 100%` |
| `--hairline` | `158 20% 12% / 0.05` | `0 0% 100% / 0.06` |

**On the four surface levels.** In dark mode all four are distinguished by
lightness (`6% → 9% → 10% → 12%`). In light mode `--card` and `--popover` are
both pure white, so the fourth level is expressed by **shadow and hairline
rather than lightness** — an off-white page, a white card, and a white popover
lifted by `--shadow-elevated`. This is deliberate and matches the research
finding that light mode separates by border while dark separates by depth; it is
not an oversight that two tokens share a value.

Two values were corrected during verification because the contrast check failed
them: `--muted-foreground` moved from `158 8% 42%` to `158 10% 38%`, and
`--warning` had to drop to `32 90% 33%` (amber is the hardest hue to bring to AA
on white).

`--secondary` is intentionally *not* identical across themes: amber at `65%`
lightness fails AA on a white surface, so light mode uses `58%`. The two themes'
amber will not be pixel-identical, by necessity.

### Charts

Light-mode chart values, darkened for legibility on white:

| Token | Light | Dark (unchanged) |
| --- | --- | --- |
| `--chart-line` | `153 45% 34%` | `153 42% 52%` |
| `--chart-bar` | `153 40% 38%` | `153 38% 46%` |
| `--chart-grid` | `108 10% 88%` | `0 0% 22%` |
| `--chart-axis` | `158 8% 45%` | `0 0% 52%` |
| `--chart-severity-error` | `0 68% 48%` | `0 72% 58%` |
| `--chart-severity-warning` | `32 85% 42%` | `38 88% 54%` |
| `--chart-severity-info` | `153 42% 36%` | `153 40% 50%` |
| `--chart-neutral` | `195 20% 42%` | `195 17% 52%` |

### Shadows

Light mode drops from black/0.55 to a green-black at low opacity, since
separation comes from hairlines rather than depth:

```
--shadow-card:       0 1px 2px 0 hsl(158 20% 12% / 0.06),
                     0 10px 30px -18px hsl(153 42% 20% / 0.14)
--shadow-card-hover: 0 2px 4px 0 hsl(158 20% 12% / 0.08),
                     0 18px 44px -22px hsl(153 42% 20% / 0.20)
--shadow-elevated:   0 30px 70px -28px hsl(153 42% 20% / 0.24)
```

Dark values are unchanged.

### Ambient gradients

`.listing-detail-page::before` and `.dashboard-page::before` layer radial
gradients at `primary/0.10–0.12`, `secondary/0.06–0.07`, `sb-slate/0.06–0.08`.
On a `97%`-lightness page these muddy the surface, so light mode halves them to
roughly `0.05 / 0.03 / 0.03`. Values become tokens (`--ambient-1/2/3`) rather
than being duplicated across both selectors.

### Color distribution

Elevation inverts per theme, and 60-30-10 coverage is preserved:

- **Light:** page `97%` → card `100%` white → popover `100%` + shadow. Surfaces
  keep hue 108 (subtle green); text uses hue 158 to sit in the same family.
- **Dark:** unchanged ascending darkness `6% → 9% → 10%`.
- Accent coverage stays ~10%. No new hues introduced.

## Theme switching

### Module: `src/lib/theme.ts`

Pure, dependency-injected functions — following the precedent of commit
`3ab2d5e` ("Extract listing search into a tested module"). Dependency injection
is required, not stylistic: `src/test/setup.ts` stubs `window.matchMedia` with a
hardcoded `matches: false` and no-op `addEventListener`, so system-mode
behaviour is untestable through the global.

```ts
export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "feedviewer.theme";

/**
 * Default when nothing valid is stored. Deliberately "dark", not "system":
 * existing users must not have their appearance changed by this feature.
 * System is opt-in.
 */
export const DEFAULT_MODE: ThemeMode = "dark";

export function isThemeMode(v: unknown): v is ThemeMode;
export function readStoredMode(storage?: Pick<Storage, "getItem">): ThemeMode;
export function writeStoredMode(mode: ThemeMode, storage?: Pick<Storage, "setItem">): void;
export function resolveTheme(mode: ThemeMode, prefersDark: boolean): ResolvedTheme;
export function applyTheme(resolved: ResolvedTheme, root?: HTMLElement): void;
```

`applyTheme` toggles the `dark` class on `<html>`, sets `style.colorScheme`, and
updates the `<meta name="theme-color">` content.

### Storage key: `feedviewer.theme`

The prefix is load-bearing, not cosmetic. `src/lib/workspaceSnapshot.ts`
captures and wipes localStorage filtered to the `rexml_` prefix
(`wipeRexmlLocalStorage`, line 149; capture scan, line 88). Using
`feedviewer.` means the theme is:

- excluded from workspace snapshots, so it stays a per-device preference; and
- safe from `wipeRexmlLocalStorage()` when a snapshot is applied.

Naming it `rexml_theme` would cause a snapshot restored from another device to
clobber the local theme. This also matches the existing `feedviewer.listings.*`
convention for device-local UI preferences.

### Hook: `src/hooks/useTheme.ts`

Exposes `{ mode, resolved, setMode }`. Subscribes to:

- `matchMedia("(prefers-color-scheme: dark)")` `change` — re-resolves only when
  `mode === "system"`.
- `window` `storage` — cross-tab synchronisation.

### No-flash script (`index.html`)

A small ES5 inline script in `<head>`, before stylesheets, reads
`feedviewer.theme`, resolves `system` against `matchMedia`, and sets the class
before first paint. Wrapped in `try/catch` so a `localStorage` throw cannot
block rendering. It duplicates a few lines of resolution logic by necessity —
this is the accepted trade-off documented in the research, and the comment will
say so and point at `theme.ts` as the source of truth.

### Toggle UI (`src/components/AppHeader.tsx`)

An icon chip inserted beside the existing admin `Shield` link (around line 696),
before the `xl` divider at line 688. It reuses the `compareOutsideChip({
homeHero, onPage, canUse })` helper so it inherits header styling — including
the `homeHero` transparent-over-hero variant — and opens the `DropdownMenu`
already imported in that file.

Items: `Sun`/Light, `Moon`/Dark, `Monitor`/System (all already available from
`lucide-react`). The trigger shows the icon for the *resolved* theme, with a
check against the active *mode*. `aria-label` announces current state
("Theme: System (dark)"); the checked item carries `aria-checked` via Radix's
radio-group items.

## Edge cases and scenarios

Each is a required behaviour, not a nice-to-have.

### Loading and persistence

1. **Flash of wrong theme** — inline head script applies class pre-paint.
2. **`localStorage` unavailable** (private mode, disabled storage, quota) —
   every access wrapped in `try/catch`; fall back to `DEFAULT_MODE` (`dark`).
3. **Corrupt stored value** (`"blue"`, `""`, `null`, JSON) — validated by
   `isThemeMode`; anything unrecognised falls back to `DEFAULT_MODE` (`dark`).
4. **Quota exceeded on write** — swallowed; theme still applies for the session.
5. **First visit for an existing user** — nothing stored, so `DEFAULT_MODE`
   (`dark`) applies and the app looks exactly as it does today, regardless of OS
   preference. Light mode is never imposed; it is always a deliberate choice.

### System mode

6. **OS theme changes while app is open** — `matchMedia` `change` listener
   re-resolves, but *only* when mode is `system`; explicit light/dark must not
   be overridden.
7. **`matchMedia` unsupported** — feature-detected; `prefersDark` defaults to
   `true` (preserving today's dark default).

### Multi-tab and multi-device

8. **Two tabs open, theme changed in one** — `storage` event syncs the other.
9. **Workspace snapshot applied from another device** — theme survives, because
   the `feedviewer.` prefix is outside `wipeRexmlLocalStorage`'s filter.

### Rendering correctness

10. **Recharts re-read** — chart colors resolve from CSS variables at render.
   Charts must re-render on theme change; the `resolved` value from `useTheme`
   feeds a `key` or is threaded into chart config so a switch remounts them.
   `chart.tsx`'s existing `THEMES = { light: "", dark: ".dark" }` already
   supports both and needs no change.
11. **Transition repaint storm** — switching themes across a large DOM with a
    global color transition causes visible tearing. No blanket `transition:
    color` is added; if a smooth fade is wanted, it must be gated behind a
    short-lived `data-theme-changing` attribute on `<html>`.
12. **`prefers-reduced-motion`** — any theme transition is disabled entirely
    under the existing reduced-motion media query.
13. **Native controls and scrollbars** — `color-scheme` per theme so
    scrollbars, date pickers, and `<select>` popups match. The custom
    `::-webkit-scrollbar-thumb` uses `--muted-foreground / 0.35`, verified
    visible on the light page background.
14. **Chrome autofill** — autofill forces its own background, overriding
    `.dark-input`. Handled with a `:-webkit-autofill` rule using an inset
    `box-shadow` in the theme's input color, per theme.
15. **`::selection`** — currently hardcoded `color: #fff`; becomes
    token-driven per theme.
16. **Windows High Contrast / forced-colors** — a `@media (forced-colors:
    active)` guard ensures token colors yield to system colors rather than
    fighting them. Relevant: primary development target is Windows 11.
17. **Print** — `@media print` forces light tokens; printing the dark theme
    wastes ink and is unreadable.
18. **Mobile browser chrome** — `<meta name="theme-color">` updated by
    `applyTheme` so the address bar matches.

### Content and third-party

19. **Leaflet map tiles** — `ListingsMap.tsx` / `GeoPointsMap.tsx` use
    unfiltered light OSM and satellite tiles, and Leaflet's own popup/control
    CSS is light. These already look light-on-dark today; in light mode they fit
    better. **Out of scope** — no tile filtering. Leaflet control and popup
    chrome gets a token pass so it does not clash.
20. **Photos and hero art must not be recolored** — only `--scrim` overlay
    opacity changes; no filters on media.
21. **Sonner toasts** — hardcoded `theme="dark"` replaced with the resolved
    theme from the hook.
22. **`badge-sale` / `badge-rent`** — hardcoded brand hex fills
    (`#1D4734` + white, `#E09B6B` + `#0f0f0f`). Both are legitimate in either
    theme; they stay, converted to `--on-media` / `--secondary-foreground` for
    their text so intent is explicit.
23. **Skeletons and shimmer** — any `bg-white/5`-style placeholder is invisible
    on light and must become `--muted`.
24. **Backdrop-blur panels** — `.listing-detail-jump-nav` uses `bg-card/70
    backdrop-blur-md shadow-black/5`; the shadow and translucency need
    per-theme values.

### Accessibility

25. **All text pairs meet WCAG AA** — enforced by test (below).
26. **`text-primary` on dark is fixed** — `.pill-green` and any other
    `text-primary` usage switches to `--primary-text`.
27. **Focus rings** — `--ring` follows `--primary-text`, so the ring is visible
    on both backgrounds.
28. **Disabled states** — `muted-foreground/50` is exempt from contrast
    requirements but must remain perceivable; checked visually in both themes.
29. **Keyboard and screen reader** — the toggle is a Radix `DropdownMenu` with
    radio items, labelled with the active mode and its resolved result.

## Testing

### Unit (vitest)

- `src/lib/theme.test.ts` — `isThemeMode` validation including corrupt input;
  `readStoredMode` with a throwing storage stub; `resolveTheme` across all
  `mode × prefersDark` combinations; `applyTheme` class/`colorScheme`/meta
  effects. Dependency injection makes all of this possible without touching the
  global `matchMedia` stub.
- `src/lib/themeContrast.test.ts` — a WCAG relative-luminance implementation
  asserting every foreground/background pair in both themes clears 4.5:1. This
  is the regression gate: the palette cannot be edited into non-compliance
  silently. Pairs and current measurements:

| Pair | Light | Dark |
| --- | --- | --- |
| foreground on background | 14.80 | 15.44 |
| foreground on card | 15.73 | — |
| foreground on accent | 13.03 | — |
| muted-foreground on background | 5.38 | 9.07 |
| muted-foreground on card | 5.71 | — |
| muted-foreground on muted | 5.04 | — |
| primary-text on background | 9.67 | 9.72 |
| primary-text on card | 10.28 | 9.11 |
| on-media on primary fill | 10.28 | 10.28 |
| secondary-foreground on secondary | 5.73 | — |
| success on card | 4.98 | — |
| warning on card | 5.34 | — |
| destructive on card | 5.87 | — |

### E2E (Playwright)

No existing spec asserts on colors or the `dark` class, so nothing breaks.
Additions:

- Toggle light → assert `html` loses `dark`, reload → assert it persists.
- Select System → assert it follows the emulated
  `prefers-color-scheme` (Playwright's `colorScheme` option).
- Light-mode pass over `/`, `/import`, `/listings`, `/database`,
  `/feed-compare`, `/listing/:id` asserting zero console errors — mirroring the
  blank-render guard in `e2e/home.spec.ts`.

### Manual verification

Drive the running app with Playwright, screenshot every main route in **both**
themes, and look at the images. A passing selector is not evidence that a
surface is legible.

## Delivery

The sweep touches ~22 files, so it lands in reviewable commits rather than one:

1. **Tokens** — restructure `index.css` into `:root`/`.dark`, add new semantic
   tokens, per-theme shadows/charts/ambient. Dark appearance unchanged.
2. **Switching** — `theme.ts`, `useTheme.ts`, inline script, unit tests,
   contrast test.
3. **Toggle UI** — `AppHeader` chip and dropdown; Sonner wired to resolved theme.
4. **Sweep: shared CSS** — the `index.css` component classes (`.dark-input`,
   `.premium-table`, `.pill-*`, `.section-eyebrow`, `::selection`).
5. **Sweep: components by area** — header, listing detail, listings/database
   tables, dashboards, import, remaining. Triaged per usage.
6. **Edge cases** — autofill, print, forced-colors, meta theme-color, Leaflet
   chrome.
7. **Verification** — full test run plus both-theme screenshots of every route.

## Risks

- **Sweep misclassification** — converting a legitimate over-media `text-white`
  to `--foreground` makes hero text invisible in light mode. Mitigated by
  reviewing each usage in context and by the both-theme screenshot pass.
- **Amber divergence** — the two themes' `--secondary` differ in lightness by
  necessity (AA on white). Accepted and documented.
- **Recharts staleness** — if the remount trigger is missed, charts keep
  previous-theme colors until navigation. Covered by an e2e assertion on a
  chart-bearing route after toggling.
