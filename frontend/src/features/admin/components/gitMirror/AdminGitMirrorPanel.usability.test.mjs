import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./AdminGitMirrorPanel.jsx", import.meta.url), "utf8");
const formSource = fs.readFileSync(new URL("./OrgGitMirrorForm.jsx", import.meta.url), "utf8");

test("AdminGitMirrorPanel renders dense status table with expandable detail", () => {
  assert.match(source, /Git mirror/);
  assert.match(source, /w-full border-collapse text-xs/);
  assert.match(source, /expanded/);
  assert.match(source, /setExpanded/);
  assert.match(source, /OrgGitMirrorForm/);
});

test("OrgGitMirrorForm renders config form and status panel", () => {
  assert.match(formSource, /Включить Git mirror/);
  assert.match(formSource, /Provider/);
  assert.match(formSource, /Repository/);
  assert.match(formSource, /Branch/);
  assert.match(formSource, /Base path/);
  assert.match(formSource, /Сохранить Git mirror/);
  assert.match(formSource, /Состояние публикации/);
  assert.match(formSource, /Статус:/);
  assert.match(formSource, /apiGetOrgGitMirrorConfig/);
  assert.match(formSource, /apiPatchOrgGitMirrorConfig/);
});

test("OrgGitMirrorForm supports validate action", () => {
  assert.match(formSource, /Проверить конфигурацию/);
  assert.match(formSource, /apiValidateOrgGitMirrorConfig/);
});
