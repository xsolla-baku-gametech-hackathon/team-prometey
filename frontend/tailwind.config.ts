import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        darkest: "#0b0d10",
        sidebar: "#13161c",
        panel: "#181c24",
        card: "#202632",
        "card-hover": "#28303f",
        border: "#293040",
        primary: {
          DEFAULT: "#3d7fff",
          hover: "#5994ff",
          dim: "#1e3a6e",
        },
        success: {
          DEFAULT: "#2ecb72",
          dim: "#103822",
        },
        danger: {
          DEFAULT: "#f85149",
          dim: "#441818",
        },
        warning: {
          DEFAULT: "#e3b341",
          dim: "#423214",
        },
      },
    },
  },
  plugins: [],
};
export default config;
