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
          panel: "#9c9786",
          "panel-light": "#a8a392",
          "panel-dark": "#8c8776",
          control: "#333333",
          "crt-bg": "#1e2e1a",
          "crt-bright": "#75cc46",
          "crt-dim": "#4a822c",
          "led-orange": "#FF7300",
          text: "#111111",
          muted: "#6b6758",
          danger: "#c92a2a",
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
