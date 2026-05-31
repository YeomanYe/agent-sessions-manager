/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#fafafa",
        foreground: "#0a0a0a",
        muted: "#737373",
        border: "#e5e5e5",
        accent: "#2563eb",
        success: "#16a34a",
        warning: "#ca8a04",
        danger: "#dc2626",
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
}
