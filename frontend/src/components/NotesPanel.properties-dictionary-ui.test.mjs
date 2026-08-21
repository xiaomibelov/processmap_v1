import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./NotesPanel.jsx", import.meta.url), "utf8");

test("NotesPanel uses Russian title for properties section and wires operation selector props", () => {
  assert.match(source, /sectionKey="properties"/);
  assert.match(source, /title="Свойства"/);
  assert.match(source, /operationOptions=\{isElementMode \? orgPropertyDictionaryOperations : \[\]\}/);
  assert.match(source, /onOperationKeyChange=\{updateSelectedOperationKey\}/);
});
