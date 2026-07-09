import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./ElementSettingsControls.jsx", import.meta.url), "utf8");

test("Properties inspector uses Russian-first copy for dictionary workflow", () => {
  assert.match(source, /Операция/);
  assert.match(source, /Не выбрано/);
  assert.match(source, /Свойства операции/);
  assert.match(source, /Overlay companions/);
  assert.match(source, /Показать в overlay/);
  assert.match(source, /Показать все related overlays/);
  assert.match(source, /Свернуть related overlays/);
  assert.match(source, /Дополнительные BPMN-свойства/);
  assert.match(source, /BPMN Documentation/);
  assert.match(source, /Extension properties текущего элемента/);
  assert.match(source, /Справочник/);
});

test("Sidebar properties sections are ordered: Quick, Additional, Camunda I/O, BPMN Documentation", () => {
  const quickIndex = source.indexOf("Быстрые свойства");
  const additionalIndex = source.indexOf("Дополнительные BPMN-свойства");
  const ioIndex = source.indexOf("Camunda Input/Output");
  const documentationIndex = source.indexOf("BPMN Documentation");
  assert.ok(quickIndex >= 0, "quick properties section label must exist");
  assert.ok(additionalIndex > quickIndex, "additional BPMN section must be after quick properties");
  assert.ok(ioIndex > additionalIndex, "Camunda I/O section must be after additional BPMN");
  assert.ok(documentationIndex > ioIndex, "BPMN Documentation section must be after Camunda I/O");
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
