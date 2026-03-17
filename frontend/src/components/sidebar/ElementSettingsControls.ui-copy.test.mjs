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
  assert.match(source, /Overlay companions/);
  assert.match(source, /Показать в overlay/);
  assert.match(source, /Показать все related overlays/);
  assert.match(source, /Свернуть related overlays/);
  assert.match(source, /Дополнительные BPMN-свойства/);
  assert.match(source, /Extension properties текущего элемента/);
  assert.match(source, /Справочник/);
});

test("Camunda IO grid keeps global overlay toggles and no row-level Show on task column", () => {
  assert.match(source, /Camunda Input\/Output/);
  assert.match(source, /\+ Add input/);
  assert.match(source, /\+ Add output/);
  assert.match(source, /<span>Name<\/span>/);
  assert.match(source, /<span>Type<\/span>/);
  assert.match(source, /<span>Value<\/span>/);
  assert.match(source, /<span className="isCenter">Action<\/span>/);
  assert.doesNotMatch(source, /Show on task/);
  assert.doesNotMatch(source, /row-level Show on task/);
});
