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

test("Sidebar properties sections are ordered: Properties, Operation, Advanced", () => {
  const propertyIndex = source.indexOf("<PropertySection");
  const operationIndex = source.indexOf("<OperationSection");
  const advancedIndex = source.indexOf("<AdvancedSettingsSection");
  assert.ok(propertyIndex >= 0, "PropertySection must be rendered");
  assert.ok(operationIndex > propertyIndex, "OperationSection must be after PropertySection");
  assert.ok(advancedIndex > operationIndex, "AdvancedSettingsSection must be after OperationSection");
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

test("Empty schema rows stay visible with required markers (v0.3 Phase 1A)", () => {
  // visibleSchemaRows must NOT filter by empty value — only by isActive.
  assert.match(source, /visibleSchemaRows[\s\S]{0,200}isActive !== false/);
  assert.doesNotMatch(source, /visibleSchemaRows[\s\S]{0,200}trim\(\)\s*!==\s*""/);
  // Required fields get a marker and an empty-state highlight (card layout).
  assert.match(source, /sidebarOperationParamRequired/);
  assert.match(source, /sidebarOperationParamInputWrap--required-empty/);
  assert.match(source, /Обязательное поле/);
});
