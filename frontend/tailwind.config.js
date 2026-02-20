/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: "hsl(var(--bg) / <alpha-value>)",
        bgSoft: "hsl(var(--bg-soft) / <alpha-value>)",
        panel: "hsl(var(--panel) / <alpha-value>)",
        panel2: "hsl(var(--panel2) / <alpha-value>)",
        border: "hsl(var(--border) / <alpha-value>)",
        borderStrong: "hsl(var(--border-strong) / <alpha-value>)",
        fg: "hsl(var(--text) / <alpha-value>)",
        muted: "hsl(var(--muted) / <alpha-value>)",
        accent: "hsl(var(--accent) / <alpha-value>)",
        accentHover: "hsl(var(--accent-hover) / <alpha-value>)",
        accentSoft: "hsl(var(--accent-soft) / <alpha-value>)",
        accent2: "hsl(var(--accent2) / <alpha-value>)",
        focus: "hsl(var(--focus) / <alpha-value>)",
        ring: "hsl(var(--ring) / <alpha-value>)",
        success: "hsl(var(--success) / <alpha-value>)",
        warning: "hsl(var(--warning) / <alpha-value>)",
        danger: "hsl(var(--danger) / <alpha-value>)",
        info: "hsl(var(--info) / <alpha-value>)",
      },
      boxShadow: {
        panel: "var(--shadow)",
      },
      borderRadius: {
        xl2: "0.875rem",
      },
      fontSize: {
        xs: ["12px", "16px"],
        sm: ["14px", "20px"],
        base: ["16px", "24px"],
      },
    },
  },
  plugins: [],
};
