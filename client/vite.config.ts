import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["manifest.webmanifest"],
      manifest: {
        name: "Fruitified POS",
        short_name: "Fruitified",
        description: "Fruit cafe point of sale",
        start_url: "/",
        display: "standalone",
        background_color: "#f7f1e6",
        theme_color: "#c85f2f",
        icons: [
          {
            src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='20' fill='%23c85f2f'/%3E%3Ctext x='50' y='73' font-size='64' font-family='Arial,sans-serif' font-weight='bold' text-anchor='middle' fill='white'%3EF%3C/text%3E%3C/svg%3E",
            sizes: "192x192 512x512 any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
        navigateFallback: "/index.html",
        // Don't let the SW intercept API POSTs; only GETs are cached.
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            // Menu + store config: serve fast, refresh in background, survive offline.
            urlPattern: ({ url }) =>
              url.pathname === "/api/menu" || url.pathname === "/api/config",
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "cafepos-catalog",
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
      },
      devOptions: { enabled: true, type: "module" },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://127.0.0.1:4000", changeOrigin: true },
    },
  },
});
