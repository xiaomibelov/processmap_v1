import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./SubprocessBreadcrumbs.jsx", import.meta.url), "utf8");

test("SubprocessBreadcrumbs renders the current path including the root session", () => {
  assert.match(source, /const list = Array\.isArray\(breadcrumbs\) \? breadcrumbs : \[\]/);
  assert.doesNotMatch(source, /if \(list\.length < 2\) return null/);
  assert.match(source, /if \(list\.length === 0\) return null/);
});

test("SubprocessBreadcrumbs exposes clickable parents and a non-clickable current segment", () => {
  assert.match(source, /isLast/);
  assert.match(source, /onNavigate\?\.\(crumb\?\.session_id\)/);
  assert.match(source, /\{crumb\?\.name \|\| "Текущий"\}/);
});

test("SubprocessBreadcrumbs no longer embeds the back arrow inside the path", () => {
  assert.doesNotMatch(source, /onBack/);
  assert.doesNotMatch(source, /←/);
});
