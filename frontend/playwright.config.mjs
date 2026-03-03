import { defineConfig } from "@playwright/test";

const baseURL = process.env.E2E_APP_BASE_URL || "http://127.0.0.1:5177";
const requestedBrowser = String(process.env.E2E_BROWSER || "chromium").trim().toLowerCase();
const browserName = requestedBrowser === "webkit" ? "webkit" : "chromium";
const e2eProfile = String(process.env.E2E_PROFILE || "").trim().toLowerCase();

if (e2eProfile === "enterprise") {
  if (!process.env.E2E_ORG_SWITCH) process.env.E2E_ORG_SWITCH = "1";
  if (!process.env.E2E_ENTERPRISE) process.env.E2E_ENTERPRISE = "1";
  if (!process.env.E2E_REPORTS_DELETE) process.env.E2E_REPORTS_DELETE = "1";
  if (!process.env.E2E_ENTERPRISE_REPORTS_DELETE) process.env.E2E_ENTERPRISE_REPORTS_DELETE = process.env.E2E_REPORTS_DELETE;
}

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
