import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./AdminGitMirrorPanel.jsx", import.meta.url), "utf8");

test("AdminGitMirrorPanel renders config form and detail panel", () => {
  assert.match(source, /Git mirror \/ публикация/);
  assert.match(source, /Включить Git mirror/);
  assert.match(source, /Provider/);
  assert.match(source, /Repository \/ Project/);
  assert.match(source, /Branch/);
  assert.match(source, /Base path/);
  assert.match(source, /Сохранить Git mirror/);
});

test("AdminGitMirrorPanel shows health status and target summary in detail panel", () => {
  assert.match(source, /Состояние публикации/);
  assert.match(source, /Статус:/);
  assert.match(source, /Цель публикации/);
  assert.match(source, /apiGetOrgGitMirrorConfig/);
  assert.match(source, /apiPatchOrgGitMirrorConfig/);
});

test("AdminGitMirrorPanel supports validate action", () => {
  assert.match(source, /Проверить конфигурацию/);
  assert.match(source, /apiValidateOrgGitMirrorConfig/);
  assert.match(source, /handleValidate/);
});
