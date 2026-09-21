/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Fruitified brand — burnt orange from the wordmark.
        brand: {
          50: "#fdf4ee",
          100: "#f9e3d3",
          200: "#f1c4a6",
          300: "#e6a074",
          400: "#d97e48",
          500: "#c85f2f",
          600: "#b44f26",
          700: "#933f20",
          800: "#76341d",
          900: "#602d1c",
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
