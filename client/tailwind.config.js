/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Fruitified brand — soft terracotta from the wordmark, toned down to pastel.
        brand: {
          50: "#fdf6f1",
          100: "#f8e7dc",
          200: "#f0d2c2",
          300: "#e5b7a3",
          400: "#d79a83",
          500: "#c67f66",
          600: "#b56a51", // CTAs — white text still reads
          700: "#95533f",
          800: "#763f30",
          900: "#5f3327",
        },
        // Earthy accents pulled from the logo's fruit palette.
        forest: { light: "#9caa8e", DEFAULT: "#586b4d", dark: "#3f4d38" },
        sage: "#c3cdb7",
        berry: "#5f6e9e",
        gold: "#d7a15c",
        cream: "#f7f1e6",
        ink: "#2c2620",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
