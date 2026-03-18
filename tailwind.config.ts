import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        dw: {
          bg: "#0e0a07",
          wood: "#3D2817",
          "wood-light": "#5C3D1E",
          "wood-dark": "#2a1a10",
          aluminum: "#b0b0b0",
          "aluminum-light": "#d0d0d0",
          "aluminum-dark": "#808080",
          chrome: "#e0e0e0",
          gold: "#D4AF37",
          "gold-dim": "#8a7023",
          "gold-glow": "#e8c84a",
          surface: "#1a1a1a",
          text: "#F5F5DC",
          muted: "#8a8580",
          danger: "#c0392b",
          panel: "#2a2a2e",
          lcd: "#b8cc40",
        },
      },
      fontFamily: {
        mono: ["var(--font-ibm-plex-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
