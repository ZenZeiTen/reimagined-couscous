import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        text: "var(--text)",
        muted: "var(--muted)",
        primary: "var(--primary)",
        "primary-contrast": "var(--primary-contrast)",
        accent: "var(--accent)",
        border: "var(--border)",
      },
      fontFamily: {
        app: "var(--font-active)",
        display: "var(--font-lora)",
      },
    },
  },
  plugins: [],
};

export default config;
