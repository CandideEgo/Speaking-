import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "sans-serif",
        ],
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Roboto",
          "sans-serif",
        ],
        mono: [
          '"JetBrains Mono"',
          "ui-monospace",
          "SFMono-Regular",
          "monospace",
        ],
      },
      colors: {
        // Brand primary (vivid orange)
        brand: {
          50: "#fff1eb",
          100: "#ffe0d3",
          200: "#ffc1a8",
          300: "#ff9b76",
          400: "#ff7a45",
          500: "#ff5a1f",
          600: "#e84a10",
          700: "#c33c0c",
          800: "#9a3210",
          900: "#7d2c12",
          950: "#441405",
        },

        // Indigo (secondary accent)
        indigo: {
          50: "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          300: "#a5b4fc",
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#312e81",
          950: "#272362",
          DEFAULT: "#6366f1",
          soft: "#eef2ff",
        },

        // Surfaces — pure white + subtle gray layers
        canvas: "#ffffff",
        "surface-soft": "#fafafa",
        "surface-card": "#f4f4f5",
        "surface-cream-strong": "#ededed",
        "surface-dark": "#0a0a0a",
        "surface-dark-elevated": "#161616",
        "surface-dark-soft": "#1c1c1c",

        // Backward-compatible aliases
        "cream-soft": "#fafafa",
        "cream-card": "#f4f4f5",
        "cream-strong": "#ededed",
        cream: "#f4f4f5",
        parchment: "#fafafa",
        navy: "#0a0a0a",
        "navy-elevated": "#161616",

        // Text — near-black + neutral grays
        ink: "#0a0a0a",
        body: "#27272a",
        "body-strong": "#18181b",
        muted: "#71717a",
        "muted-soft": "#a1a1aa",
        "muted-foreground": "#71717a",

        // Text aliases
        olive: "#71717a",
        "olive-soft": "#a1a1aa",
        ivory: "#fafafa",
        terracotta: "#ff5a1f",

        // Primary (vivid orange)
        primary: {
          DEFAULT: "#ff5a1f",
          active: "#e84a10",
          disabled: "#f4f4f5",
        },

        // coral = primary alias
        coral: "#ff5a1f",
        "coral-active": "#e84a10",
        "coral-soft": "#fff1eb",

        // Semantic colors
        success: {
          DEFAULT: "#16a34a",
          soft: "#ecfdf5",
        },
        warning: {
          DEFAULT: "#d97706",
          soft: "#fffbeb",
        },
        error: "#dc2626",
        danger: "#dc2626",

        // Soft-background pairs for tags/badges
        sky: {
          soft: "#f0f9ff",
        },
        red: {
          soft: "#fef2f2",
        },

        // Teal / amber (legacy)
        teal: "#10b981",
        "accent-teal": "#10b981",
        "accent-amber": "#f59e0b",

        // On-colors
        "on-primary": "#ffffff",
        "on-dark": "#fafafa",
        "on-dark-soft": "#a1a1aa",

        // Borders
        hairline: {
          DEFAULT: "#ededed",
          soft: "#f4f4f5",
          cream: "#ededed",
        },

        // Learning mode highlights
        learn: {
          highlight: "#4ade80",
          highlightHover: "#22c55e",
          phrase: "#facc15",
          grammar: "#f97316",
          correct: "#22c55e",
          wrong: "#ef4444",
        },

        // CSS variable-backed colors (runtime theme)
        background: "rgb(var(--background) / <alpha-value>)",
        foreground: "rgb(var(--foreground) / <alpha-value>)",
        "muted-foreground-var": "rgb(var(--muted-foreground) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        "sidebar-bg": "rgb(var(--sidebar-bg) / <alpha-value>)",
        "topbar-bg": "rgb(var(--topbar-bg) / <alpha-value>)",
      },
      borderRadius: {
        xs: "4px",
        sm: "8px",
        DEFAULT: "12px",
        md: "10px",
        lg: "16px",
        xl: "22px",
        "2xl": "24px",
        pill: "9999px",
      },
      spacing: {
        section: "96px",
        18: "4.5rem",
        88: "22rem",
        128: "32rem",
      },
      maxWidth: {
        page: "1320px",
      },
      letterSpacing: {
        "display-xl": "-0.035em",
        "display-lg": "-0.03em",
        "display-md": "-0.025em",
        "display-sm": "-0.02em",
        "caption-wide": "0.08em",
      },
      boxShadow: {
        soft: "0 1px 2px rgba(10,10,10,.04), 0 1px 3px rgba(10,10,10,.04)",
        card: "0 2px 8px rgba(10,10,10,.05), 0 1px 2px rgba(10,10,10,.04)",
        lift: "0 12px 32px rgba(10,10,10,.08), 0 2px 8px rgba(10,10,10,.04)",
        brand: "0 8px 24px rgba(255,90,31,.28)",
        coral: "0 8px 24px rgba(255,90,31,.28)",
      },
      keyframes: {
        "wave-bar": {
          "0%, 100%": { transform: "scaleY(0.5)" },
          "50%": { transform: "scaleY(1)" },
        },
      },
      animation: {
        "wave-bar": "wave-bar 1s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
