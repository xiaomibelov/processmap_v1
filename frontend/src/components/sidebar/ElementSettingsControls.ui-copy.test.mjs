import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./ElementSettingsControls.jsx", import.meta.url), "utf8");

test("Properties inspector uses Russian-first copy for dictionary workflow", () => {
  assert.match(source, /Показывать свойства над задачей при выделении/);
  assert.match(source, /Всегда показывать свойства над задачей/);
  assert.match(source, /Операция/);
  assert.match(source, /Не выбрано/);
  assert.match(source, /Свойства операции/);
  assert.match(source, /Свойства элемента/);
  assert.match(source, /Дополнительные BPMN-свойства/);
  assert.match(source, /Extension properties текущего элемента/);
  assert.match(source, /Справочник/);
});
