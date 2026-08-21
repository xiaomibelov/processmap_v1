import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./AdminOrgsPanel.jsx", import.meta.url), "utf8");
const tableSource = fs.readFileSync(new URL("./OrgsTable.jsx", import.meta.url), "utf8");
const detailSource = fs.readFileSync(new URL("./OrgDetailTabs.jsx", import.meta.url), "utf8");

test("AdminOrgsPanel renders create form and expandable table", () => {
  assert.match(source, /Создать организацию/);
  assert.match(source, /<OrgsTable/);
  assert.match(source, /expandedOrgId/);
  assert.match(source, /onToggleExpand/);
  assert.match(source, /<OrgDetailTabs/);
});

test("OrgsTable supports expandable rows with underline tabs", () => {
  assert.match(tableSource, /expandedOrgId/);
  assert.match(tableSource, /onToggleExpand/);
  assert.match(tableSource, /cursor-pointer/);
  assert.match(tableSource, /bg-emerald-50\/60/);
  assert.match(tableSource, /colSpan=\{8\}/);
  assert.match(detailSource, /Detail/);
  assert.match(detailSource, /Members/);
  assert.match(detailSource, /Git mirror/);
  assert.match(detailSource, /Settings/);
  assert.match(detailSource, /<AdminTabs/);
});

test("OrgDetailTabs shows org counts and editable name", () => {
  assert.match(detailSource, /Детали организации/);
  assert.match(detailSource, /Участники/);
  assert.match(detailSource, /Проекты/);
  assert.match(detailSource, /Активные сессии/);
  assert.match(detailSource, /Инвайты/);
  assert.match(detailSource, /Сохранить название/);
  assert.match(detailSource, /apiPatchOrg/);
});
