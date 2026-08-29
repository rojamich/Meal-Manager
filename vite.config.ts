import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

/**
 * The production CSP lives in index.html because GitHub Pages can't set headers. Vite's
 * dev server needs inline scripts and eval for HMR, so the tag is stripped while serving
 * and shipped intact on build.
 */
function cspDevStrip() {
  return {
    name: "csp-dev-strip",
    apply: "serve" as const,
    transformIndexHtml(html: string) {
      return html.replace(
        /<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?\/>/,
        "<!-- CSP omitted in dev; see index.html -->"
      );
    }
  };
}

export default defineConfig({
  base: "/Meal-Manager/",
  plugins: [
    cspDevStrip(),
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["pwa-192.svg", "pwa-512.svg"],
      manifest: {
        name: "Meal Manager",
        short_name: "Meals",
        description: "Offline meal planning and grocery lists",
        theme_color: "#0f172a",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "./",
        icons: [
          {
            src: "pwa-192.svg",
            sizes: "192x192",
            type: "image/svg+xml",
            purpose: "any"
          },
          {
            src: "pwa-512.svg",
            sizes: "512x512",
            type: "image/svg+xml",
            purpose: "any"
          }
        ]
      },
      workbox: {
        navigateFallback: "./index.html"
      }
    })
  ]
});
