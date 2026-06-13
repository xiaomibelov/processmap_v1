import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(__dirname, "TopBarContainer.jsx"), "utf8");

test("TopBarContainer uses useAnalyticsRouteState for navigation", () => {
  assert.match(source, /useAnalyticsRouteState/);
  assert.match(source, /openAnalyticsHubFromHook/);
});

test("TopBarContainer has a feature flag for rollback", () => {
  assert.match(source, /USE_ANALYTICS_ROUTE_STATE_NAV/);
});

test("TopBarContainer keeps legacy manual navigation fallback", () => {
  assert.match(source, /useLegacyAnalyticsNavigation/);
});

test("TopBarContainer derives active state from route state", () => {
  assert.match(source, /analyticsHubRoute\.active/);
});
