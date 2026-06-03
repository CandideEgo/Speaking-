import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        display: ['"Cormorant Garamond"', '"EB Garamond"', 'Garamond', '"Times New Roman"', 'serif'],
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
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
        // Claude-inspired warm palette
        ink: "#141413",
        canvas: "#faf9f5",
        coral: {
          DEFAULT: "#cc785c",
          active: "#a9583e",
          disabled: "#e6dfd8",
        },
        cream: {
          soft: "#f5f0e8",
          card: "#efe9de",
          strong: "#e8e0d2",
        },
        navy: {
          DEFAULT: "#181715",
          elevated: "#252320",
          soft: "#1f1e1b",
        },
        hairline: {
          DEFAULT: "#e6dfd8",
          soft: "#ebe6df",
        },
        accent: "rgb(var(--accent) / <alpha-value>)",
        background: "rgb(var(--background) / <alpha-value>)",
        foreground: "rgb(var(--foreground) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
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