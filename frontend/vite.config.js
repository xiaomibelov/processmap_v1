import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || "http://127.0.0.1:8011";
const vitePort = Number(process.env.VITE_PORT || 5177);
const extraAllowedHosts = String(process.env.VITE_ALLOWED_HOSTS || "")
  .split(",")
  .map((host) => host.trim())
  .filter(Boolean);
const allowedHosts = Array.from(
  new Set([
    "localhost",
    "127.0.0.1",
    "stage.processmap.ru",
    ...extraAllowedHosts,
  ])
);

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: vitePort,
    strictPort: true,
    allowedHosts,
    hmr: {
      port: Number(process.env.VITE_HMR_PORT || vitePort),
    },
    proxy: {
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true,
        secure: false
      }
    }
  }
});
