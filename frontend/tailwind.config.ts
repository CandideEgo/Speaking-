import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Cormorant Garamond"', '"EB Garamond"', 'Garamond', '"Times New Roman"', 'serif'],
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        // Brand primary (coral)
        brand: {
          50: "#faf5f0",
          100: "#f5ebe0",
          200: "#edd6c5",
          300: "#e2b89e",
          400: "#d99a79",
          500: "#cc785c",
          600: "#a9583e",
          700: "#8a4530",
          800: "#6e3828",
          900: "#5a2e22",
          950: "#331a14",
        },

        // === Warm cream design system tokens ===

        // Surfaces
        canvas: "#faf9f5",
        "surface-soft": "#f5f0e8",
        "surface-card": "#efe9de",
        "surface-cream-strong": "#e8e0d2",
        "surface-dark": "#181715",
        "surface-dark-elevated": "#252320",
        "surface-dark-soft": "#1f1e1b",

        // Text
        ink: "#141413",
        body: "#3d3d3a",
        "body-strong": "#252523",
        muted: "#6c6a64",
        "muted-soft": "#8e8b82",

        // Primary (coral)
        primary: {
          DEFAULT: "#cc785c",
          active: "#a9583e",
          disabled: "#e6dfd8",
        },

        // On-colors
        "on-primary": "#ffffff",
        "on-dark": "#faf9f5",
        "on-dark-soft": "#a09d96",

        // Accents
        "accent-teal": "#5db8a6",
        "accent-amber": "#e8a55a",

        // Borders
        hairline: {
          DEFAULT: "#e6dfd8",
          soft: "#ebe6df",
        },

        // Semantic
        success: "#5db872",
        warning: "#d4a017",
        error: "#c64545",

        // Platform identity colors
        "platform-bilibili": "#00aeec",
        "platform-bilibili-pink": "#fb7299",
        "platform-douyin": "#fe2c55",

        // Learning mode highlights (product-specific, not brand tokens)
        learn: {
          highlight: "#4ade80",
          highlightHover: "#22c55e",
          phrase: "#facc15",
          grammar: "#f97316",
          correct: "#22c55e",
          wrong: "#ef4444",
        },

        // CSS variable-backed colors (for runtime theming if needed)
        background: "rgb(var(--background) / <alpha-value>)",
        foreground: "rgb(var(--foreground) / <alpha-value>)",
        "muted-foreground": "rgb(var(--muted-foreground) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        "sidebar-bg": "rgb(var(--sidebar-bg) / <alpha-value>)",
        "topbar-bg": "rgb(var(--topbar-bg) / <alpha-value>)",
      },
      borderRadius: {
        xs: "4px",
        sm: "6px",
        md: "8px",
        lg: "12px",
        xl: "16px",
        pill: "9999px",
      },
      spacing: {
        section: "96px",
      },
      letterSpacing: {
        "display-xl": "-1.5px",
        "display-lg": "-1px",
        "display-md": "-0.5px",
        "display-sm": "-0.3px",
        "caption-wide": "1.5px",
      },
    },
  },
  plugins: [],
};

export default config;
