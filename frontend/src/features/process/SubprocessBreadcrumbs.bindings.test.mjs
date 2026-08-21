import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./SubprocessBreadcrumbs.jsx", import.meta.url), "utf8");

test("crumb keys are stable and identity-based, not derived from display name", () => {
  assert.match(source, /key: `\$\{idx\}-\$\{String\(crumb\?\.session_id \|\| idx\)\}`/);
});

test("navigation resolves by session_id, never by name or index", () => {
  assert.match(source, /onClick: idx === list\.length - 1 \? undefined : \(\) => onNavigate\?\.\(crumb\?\.session_id, idx\)/);
});

test("duplicated display names do not collapse because each crumb carries its own session_id", () => {
  assert.match(source, /String\(crumb\?\.name \|\| "Без названия"\)\.trim\(\) \|\| "Без названия"/);
  assert.match(source, /key: `\$\{idx\}-\$\{String\(crumb\?\.session_id \|\| idx\)\}`/);
});

test("clickable parent passes session_id and index to the caller", () => {
  assert.match(source, /onClick=\{crumb\.onClick\}/);
  assert.match(source, /onNavigate\?\.\(crumb\?\.session_id, idx\)/);
});
