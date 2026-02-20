import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || "http://127.0.0.1:8011";
const vitePort = Number(process.env.VITE_PORT || 5177);

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: vitePort,
    strictPort: true,
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
