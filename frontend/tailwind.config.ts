import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "Inter", "Roboto", "sans-serif"],
      },
      colors: {
        // Clean, light theme — flat colors only, no gradients.
        main: "#f8fafc",
        surface: "#ffffff",
        border: "#e2e8f0",
        "text-primary": "#0f172a",
        "text-secondary": "#64748b",
        "text-subtle": "#94a3b8",
        accent: {
          DEFAULT: "#2563eb",
          hover: "#1d4ed8",
          light: "#eff6ff",
        },
        // Diff semantics used consistently across the panel and the 3D view.
        diff: {
          added: "#059669",
          "added-light": "#ecfdf5",
          removed: "#ef4444",
          "removed-light": "#fef2f2",
          changed: "#2563eb",
          "changed-light": "#eff6ff",
        },
        warning: {
          DEFAULT: "#d97706",
          light: "#fffbeb",
        },
      },
    },
  },
  plugins: [],
};
export default config;
