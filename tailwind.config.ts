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
          chassis: "#0a0a0a",
          panel: "#111111",
          "panel-border": "#1e1e1e",
          "vfd-bg": "#050e08",
          "vfd-teal": "#00e5cc",
          "vfd-teal-dim": "#007a6e",
          "vfd-amber": "#ffb300",
          "vfd-amber-dim": "#7a5500",
          "vfd-green": "#00ff88",
          "vfd-red": "#ff2200",
          "vfd-blue": "#0088ff",
          "btn-face": "#1a1a1a",
          "btn-border": "#2a2a2a",
          "btn-label": "#cccccc",
          "btn-label-dim": "#555555",
          "btn-active": "#00e5cc",
          "btn-aud": "#ccff00",
          text: "#cccccc",
          muted: "#555555",
          danger: "#ff2200",
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
