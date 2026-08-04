import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: process.env.VITE_BASE ?? "/",
  plugins: [
    vue(),
    VitePWA({
      registerType: "autoUpdate",
      // Registered explicitly in main.ts so updates can reload the page.
      injectRegister: false,
      includeAssets: [
        "favicon.svg",
        "apple-touch-icon.png",
        "pwa-192x192.png",
        "pwa-512x512.png",
        "pwa-512x512-maskable.png",
        "push-sw.js",
      ],
      manifest: {
        name: "TripLedger",
        short_name: "TripLedger",
        description: "Offline-first trip expense settlement",
        theme_color: "#0d9488",
        background_color: "#0f172a",
        display: "standalone",
        start_url: ".",
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "pwa-512x512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ["**/*.{js,css,html,ico,svg,png,webmanifest,woff2}"],
        // Main bundle includes Excel/PDF libs; raise SW precache limit.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        importScripts: ["push-sw.js"],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === "document",
            handler: "NetworkFirst",
            options: {
              cacheName: "tl-pages",
              networkTimeoutSeconds: 3,
            },
          },
          {
            urlPattern: ({ request }) =>
              request.destination === "script" ||
              request.destination === "style" ||
              request.destination === "worker",
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "tl-assets",
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    // exceljs is lazy-loaded on export only (~900 kB); other chunks stay under 500 kB.
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("exceljs")) return "exceljs";
          if (id.includes("pdf-lib")) return "pdf-lib";
          if (id.includes("@supabase")) return "supabase";
          if (
            id.includes("primevue") ||
            id.includes("@primevue") ||
            id.includes("primeicons")
          ) {
            return "primevue";
          }
          if (
            id.includes("/vue/") ||
            id.includes("\\vue\\") ||
            id.includes("pinia") ||
            id.includes("vue-router") ||
            id.includes("@vue/")
          ) {
            return "vue-vendor";
          }
        },
      },
    },
  },
  server: {
    port: 5173,
  },
});
