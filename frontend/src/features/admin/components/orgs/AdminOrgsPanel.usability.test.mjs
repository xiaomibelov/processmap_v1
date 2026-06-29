import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./AdminOrgsPanel.jsx", import.meta.url), "utf8");
const detailSource = fs.readFileSync(new URL("./AdminOrgDetailPanel.jsx", import.meta.url), "utf8");
const tableSource = fs.readFileSync(new URL("./OrgsTable.jsx", import.meta.url), "utf8");

test("AdminOrgsPanel renders create form, selectable table and detail panel", () => {
  assert.match(source, /Создать организацию/);
  assert.match(source, /<OrgsTable/);
  assert.match(source, /<AdminOrgDetailPanel/);
  assert.match(source, /selectedOrgId/);
  assert.match(source, /onSelect/);
});

test("OrgsTable supports row selection highlight", () => {
  assert.match(tableSource, /selectedOrgId/);
  assert.match(tableSource, /onSelect/);
  assert.match(tableSource, /cursor-pointer/);
  assert.match(tableSource, /bg-emerald-50\/60/);
});

test("AdminOrgDetailPanel shows org counts and editable name", () => {
  assert.match(detailSource, /Детали организации/);
  assert.match(detailSource, /Участники/);
  assert.match(detailSource, /Проекты/);
  assert.match(detailSource, /Активные сессии/);
  assert.match(detailSource, /Инвайты/);
  assert.match(detailSource, /Сохранить название/);
  assert.match(detailSource, /apiPatchOrg/);
});
