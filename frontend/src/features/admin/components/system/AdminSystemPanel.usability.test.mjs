import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./AdminSystemPanel.jsx", import.meta.url), "utf8");

test("AdminSystemPanel renders sub-tabs for notes, runtime, audit and flags", () => {
  assert.match(source, /SYSTEM_TABS/);
  assert.match(source, /Заметки/);
  assert.match(source, /Runtime/);
  assert.match(source, /Аудит/);
  assert.match(source, /Feature flags/);
  assert.match(source, /<AdminTabs/);
});

test("AdminSystemPanel loads dashboard data and renders widgets", () => {
  assert.match(source, /apiAdminGetDashboard/);
  assert.match(source, /RedisHealthWidget/);
  assert.match(source, /JobsThroughputWidget/);
  assert.match(source, /RecentAuditWidget/);
  assert.match(source, /FeatureFlagsWidget/);
});
