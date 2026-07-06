import type { Config } from "tailwindcss";

// =============================================================
// PULSARNAV AI — Tailwind Config
// All values derived from design_analytics.md ONLY.
// Do NOT add colors, sizes, or radii not in the spec.
// =============================================================

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
  ],
  theme: {
    // Override default colors entirely — only use the design system palette
    colors: {
      transparent: "transparent",
      current:     "currentColor",
      void:        "#000000",
      carbon:      "#1c1c1c",
      graphite:    "#4d4d4d",
      steel:       "#808080",
      ash:         "#ababab",
      paper:       "#ffffff",
      periwinkle:  "#7089ba",
    },
    // Override font families
    fontFamily: {
      display: ["var(--font-display)", "ui-sans-serif", "system-ui", "sans-serif"],
      sans:    ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      mono:    ["var(--font-mono)", "ui-monospace", "Menlo", "monospace"],
    },
    // Override the spacing scale — exact from design_analytics.md
    spacing: {
      "0":   "0px",
      "px":  "1px",
      "4":   "4px",
      "5":   "5px",
      "6":   "6px",
      "8":   "8px",
      "9":   "9px",
      "10":  "10px",
      "12":  "12px",
      "14":  "14px",
      "16":  "16px",
      "18":  "18px",
      "20":  "20px",
      "24":  "24px",
      "28":  "28px",
      "32":  "32px",
      "34":  "34px",
      "40":  "40px",
      "44":  "44px",
      "48":  "48px",
      "50":  "50px",
      "56":  "56px",
      "64":  "64px",
      "72":  "72px",
      "80":  "80px",
      "96":  "96px",
      "100": "100px",
      "120": "120px",
    },
    // Override border radius — only the values in the design spec
    borderRadius: {
      "none":   "0px",
      "nav":    "6px",
      "tags":   "100px",
      "buttons":"100px",
      "tiles":  "20px",
      "icons":  "50px",
      "full":   "9999px",
    },
    // Font sizes — only the design spec scale
    fontSize: {
      "caption":    ["12px", { lineHeight: "1.2" }],
      "body-sm":    ["14px", { lineHeight: "1.6", letterSpacing: "-0.14px" }],
      "body":       ["16px", { lineHeight: "1.6", letterSpacing: "-0.16px" }],
      "subheading": ["24px", { lineHeight: "1.4", letterSpacing: "-0.24px" }],
      "heading":    ["32px", { lineHeight: "1.2", letterSpacing: "-0.32px" }],
      "display":    ["70px", { lineHeight: "1.1", letterSpacing: "-2.8px" }],
      // Allow tailwind utility sizes for small UI elements
      "xs":  ["10px", { lineHeight: "1.4" }],
      "sm":  ["12px", { lineHeight: "1.5" }],
      "base":["16px", { lineHeight: "1.6" }],
      "lg":  ["18px", { lineHeight: "1.6" }],
      "xl":  ["20px", { lineHeight: "1.5" }],
      "2xl": ["24px", { lineHeight: "1.4" }],
      "3xl": ["32px", { lineHeight: "1.2" }],
      "4xl": ["40px", { lineHeight: "1.1" }],
      "7xl": ["70px", { lineHeight: "1.1" }],
    },
    fontWeight: {
      regular: "400",
      medium:  "500",
      bold:    "700",
      black:   "900",
    },
    extend: {
      maxWidth: {
        "page": "1200px",
      },
      backgroundImage: {
        "radial-lamp": "radial-gradient(ellipse at center, #1c1c1c 0%, #000000 100%)",
        "blueprint-grid": `
          linear-gradient(to right, rgba(112, 137, 186, 0.03) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(112, 137, 186, 0.03) 1px, transparent 1px)
        `,
      },
      backgroundSize: {
        "blueprint": "40px 40px",
      },
      keyframes: {
        "pulse-dot": {
          "0%, 100%": { opacity: "1" },
          "50%":       { opacity: "0.3" },
        },
      },
      animation: {
        "pulse-dot": "pulse-dot 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
