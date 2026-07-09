import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./ElementSettingsControls.jsx", import.meta.url), "utf8");
const additionalSectionSource = fs.readFileSync(new URL("./sections/AdditionalBpmnPropertiesSection.jsx", import.meta.url), "utf8");
const combinedSource = `${source}\n${additionalSectionSource}`;

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
  assert.match(combinedSource, /Extension properties текущего элемента/);
  assert.match(source, /Справочник/);
});

test("Additional BPMN Properties section is rendered before Camunda I/O and BPMN Documentation", () => {
  const additionalComponentIndex = source.indexOf("<AdditionalBpmnPropertiesSection");
  const documentationIndex = source.indexOf("BPMN Documentation");
  const ioIndex = source.indexOf("Camunda Input/Output");
  assert.ok(additionalComponentIndex >= 0, "additional BPMN section component must be used");
  assert.ok(documentationIndex > additionalComponentIndex, "documentation section must be after additional BPMN");
  assert.ok(ioIndex > additionalComponentIndex, "Camunda I/O must stay after additional BPMN section");
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
