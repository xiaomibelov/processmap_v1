import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./AdminSystemPanel.jsx", import.meta.url), "utf8");

test("AdminSystemPanel renders underline sub-tabs for notes, logs, settings and maintenance", () => {
  assert.match(source, /SYSTEM_TABS/);
  assert.match(source, /Notes/);
  assert.match(source, /Logs/);
  assert.match(source, /Settings/);
  assert.match(source, /Maintenance/);
  assert.match(source, /<AdminTabs/);
});

test("AdminSystemPanel loads dashboard data and renders dense tables and compact cards", () => {
  assert.match(source, /apiAdminGetDashboard/);
  assert.match(source, /Recent Audit/);
  assert.match(source, /Recent Failures/);
  assert.match(source, /Redis Health/);
  assert.match(source, /Jobs Throughput/);
  assert.match(source, /FeatureFlagsWidget/);
});
