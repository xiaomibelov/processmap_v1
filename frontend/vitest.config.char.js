import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.js";

// Characterization tests for the workspace explorer (DECOMP.md step 0).
// Kept separate from vitest.config.js (smoke) so both suites stay fast and
// independently runnable: `npm run test:smoke` / `npm run test:char`.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      globals: true,
      include: ["src/**/*.char.test.jsx"],
      setupFiles: ["src/test-utils/charSetup.js"],
      testTimeout: 15000,
      hookTimeout: 15000,
    },
  })
);
