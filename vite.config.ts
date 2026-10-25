import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { VitePWA } from "vite-plugin-pwa";

// GitHub Pages のサブパス（リポジトリ名）に合わせる
const base = "/juggler_simulator/";

export default defineConfig({
  base,
  plugins: [
    preact(),
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["icon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "スロ設定ナビ",
        short_name: "設定ナビ",
        description: "パチスロの設定推定（端末内で計算）",
        lang: "ja",
        start_url: base,
        scope: base,
        display: "standalone",
        background_color: "#f9f9f7",
        theme_color: "#2a78d6",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon.svg", sizes: "any", type: "image/svg+xml" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,json}"],
      },
    }),
  ],
});
