import { defineConfig } from "@playwright/test";

const baseURL = process.env.E2E_APP_BASE_URL || "http://127.0.0.1:5177";
const requestedBrowser = String(process.env.E2E_BROWSER || "chromium").trim().toLowerCase();
const browserName = requestedBrowser === "webkit" ? "webkit" : "chromium";

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: {
    timeout: 20_000,
  },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: browserName,
      use: { browserName },
    },
  ],
});
