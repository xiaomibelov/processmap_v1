import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./useSubprocessNavigation.js", import.meta.url), "utf8");

test("navigateToSubprocess uses server-provided subprocessTitle with fallback", () => {
  assert.match(source, /name: res\.subprocessTitle \|\| "Без названия"/);
});

test("navigateToSubprocess does not push duplicate child crumbs", () => {
  assert.match(source, /const lastSid = String\(list\[list\.length - 1\]\?\.session_id \|\| ""\)\.trim\(\)/);
  assert.match(source, /const childSid = String\(childCrumb\.session_id \|\| ""\)\.trim\(\)/);
  assert.match(source, /if \(lastSid && childSid && lastSid === childSid\) return list;/);
});

test("returnToParent trims the top of the breadcrumb stack by session identity", () => {
  assert.match(source, /if \(list\.length > 1\) return list\.slice\(0, -1\);/);
});
