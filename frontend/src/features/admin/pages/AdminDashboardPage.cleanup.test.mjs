import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test("dashboard page replaces template usage card with publish git mirror widget", () => {
  const source = fs.readFileSync(path.join(__dirname, "AdminDashboardPage.jsx"), "utf8");
  assert.equal(
    source.includes("TemplateUsageWidget"),
    false,
    "dashboard should demote template usage widget in this cleanup contour",
  );
  assert.ok(
    source.includes("PublishGitMirrorWidget"),
    "dashboard should show publish/git mirror operational widget",
  );
});

test("dashboard KPI row removes Redis mode duplicate and adds publish mirror KPIs", () => {
  const source = fs.readFileSync(path.join(__dirname, "../components/dashboard/DashboardKpiRow.jsx"), "utf8");
  assert.equal(
    source.includes("Redis Mode"),
    false,
    "redis mode should no longer be duplicated in KPI row",
  );
  assert.ok(
    source.includes("Published BPMN Versions"),
    "kpi row should include published versions signal",
  );
  assert.ok(
    source.includes("Mirrored to Git"),
    "kpi row should include mirrored-to-git signal",
  );
});
