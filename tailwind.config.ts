import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#050816",
        card: "#0F172A",
        primary: "#00BFFF",
        secondary: "#38BDF8",
        success: "#22C55E",
        warning: "#F59E0B",
        error: "#EF4444",
        text: "#F8FAFC",
      },
      boxShadow: {
        glow: "0 0 32px rgba(0,191,255,0.22)",
        panel: "0 24px 80px rgba(0,0,0,0.38)",
      },
      backgroundImage: {
        "radial-space": "radial-gradient(circle at top left, rgba(56,189,248,0.18), transparent 28%), radial-gradient(circle at 78% 12%, rgba(34,197,94,0.09), transparent 22%), linear-gradient(180deg, #050816 0%, #07111f 48%, #050816 100%)",
      },
      keyframes: {
        orbit: {
          "0%": { transform: "rotate(0deg) translateX(120px) rotate(0deg)" },
          "100%": { transform: "rotate(360deg) translateX(120px) rotate(-360deg)" },
        },
        pulseGlow: {
          "0%, 100%": { opacity: "0.35", transform: "scale(0.92)" },
          "50%": { opacity: "1", transform: "scale(1.08)" },
        },
        scan: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100%)" },
        },
      },
      animation: {
        orbit: "orbit 18s linear infinite",
        pulseGlow: "pulseGlow 2.8s ease-in-out infinite",
        scan: "scan 3.4s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
