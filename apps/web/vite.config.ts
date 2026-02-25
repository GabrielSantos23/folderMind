import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

// Read the current app version from tauri.conf.json
const tauriConf = JSON.parse(
  readFileSync(
    path.resolve(__dirname, "../../src-tauri/tauri.conf.json"),
    "utf-8",
  ),
);
const appVersion: string = tauriConf.version ?? "0.0.0";

export default defineConfig({
  base: "./",
  plugins: [tailwindcss(), tanstackRouter({}), react()],
  define: {
    __TAURI_APP_VERSION__: JSON.stringify(appVersion),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3001,
  },
});
