import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  root: ".",
  resolve: {
    alias: {
      "agent-flow-core": path.resolve(__dirname, "../../packages/agent-flow-core/src/index.ts"),
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
  server: {
    port: 5717,
  },
  envPrefix: "AGENT_",
});
