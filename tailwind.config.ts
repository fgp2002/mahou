import type { Config } from "tailwindcss";

// Los colores salen de variables CSS (globals.css) para que claro/oscuro cambien sin tocar componentes.
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;
const scale = (prefix: string, steps: number[]) => Object.fromEntries(steps.map((s) => [s, v(`${prefix}-${s}`)]));

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    colors: {
      transparent: "transparent",
      current: "currentColor",
      white: v("white"),
      black: "#000",
      slate: scale("slate", [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]),
      brand: scale("brand", [50, 100, 300, 500, 600, 700, 800]),
      red: scale("red", [100, 600, 700]),
      green: scale("green", [100, 600, 700]),
      amber: scale("amber", [50, 100, 300, 600, 700, 800]),
      orange: scale("orange", [100, 800]),
    },
    extend: {
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgb(0 0 0 / 0.04), 0 4px 14px rgb(0 0 0 / 0.05)",
      },
    },
  },
  plugins: [],
};
export default config;
