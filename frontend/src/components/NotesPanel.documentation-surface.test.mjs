import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./NotesPanel.jsx", import.meta.url), "utf8");

test("NotesPanel derives BPMN documentation from XML and forwards it into CamundaPropertiesSection", () => {
  assert.match(source, /function parseSelectedBpmnDocumentation\(/);
  assert.match(source, /localName\)\.toLowerCase\(\) === "documentation"/);
  assert.match(source, /selectedBpmnDocumentation=\{isElementMode \? selectedBpmnDocumentation : \[\]\}/);
});
