import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        heading: ["var(--font-heading)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          /**
           * Brand green as TEXT. `primary` itself measures 1.86:1 on the dark
           * background, so `text-primary` is unreadable there — use
           * `text-primary-text`. See the theme spec.
           */
          text: "hsl(var(--primary-text) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
          /** Amber as TEXT — the raw brand amber fails AA on white. */
          text: "hsl(var(--secondary-text) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
          /** Red as TEXT — the fill red is only 3.74:1 on the dark card. */
          text: "hsl(var(--destructive-text) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        /**
         * Hero/landing accent. Mint in dark, deep green in light (mint fails
         * AA on white). `highlight` is for text/icons, `fill` for solid CTAs.
         */
        highlight: {
          DEFAULT: "hsl(var(--highlight) / <alpha-value>)",
          fill: "hsl(var(--highlight-fill) / <alpha-value>)",
          "fill-foreground": "hsl(var(--highlight-fill-foreground) / <alpha-value>)",
        },
        /** Modal/sheet scrim — lighter, tinted veil in light mode. */
        overlay: "hsl(var(--overlay))",
        "footer-brand": "hsl(var(--footer-brand) / <alpha-value>)",
        /** Surface one level above `card` (popovers, sticky panels). */
        "surface-raised": "hsl(var(--surface-raised))",
        /**
         * Text/icons over photos, hero art, or a saturated brand fill —
         * white in BOTH themes. Use this instead of `text-white` so the
         * intent ("white on purpose") is legible in the markup.
         */
        "on-media": "hsl(var(--on-media) / <alpha-value>)",
        brand: {
          green: "hsl(var(--sb-green) / <alpha-value>)",
          sand: "hsl(var(--sb-sand) / <alpha-value>)",
          rose: "hsl(var(--sb-rose) / <alpha-value>)",
          slate: "hsl(var(--sb-slate) / <alpha-value>)",
          amber: "hsl(var(--sb-amber) / <alpha-value>)",
          mist: "hsl(var(--sb-mist) / <alpha-value>)",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        topbar: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(300%)" },
        },
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "hero-star-float": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.4s ease-out",
        "hero-star-float": "hero-star-float 3.5s ease-in-out infinite",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
