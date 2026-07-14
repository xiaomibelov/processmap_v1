import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./ElementSettingsControls.jsx", import.meta.url), "utf8");
const advancedSource = fs.readFileSync(new URL("./AdvancedSettingsSection.jsx", import.meta.url), "utf8");
const combinedSource = `${source}\n${advancedSource}`;

test("CamundaPropertiesSettings accepts onSaveAllBatch prop", () => {
  assert.match(source, /onSaveAllBatch,/);
  assert.match(source, /onSaveAllBatch,\s*\n?\s*onFocusDrawioCompanion/);
});

test("Save All handler prefers onSaveAllBatch and toggles local busy state", () => {
  assert.match(source, /const \[saveAllBusy, setSaveAllBusy\] = useState\(false\)/);
  assert.match(source, /if \(typeof onSaveAllBatch === "function"\) \{\s*setSaveAllBusy\(true\);\s*try \{\s*await onSaveAllBatch\(\);\s*\} finally \{\s*setSaveAllBusy\(false\);\s*\}\s*return;\s*\}/);
});

test("Save All button disables while saveAllBusy and shows progress copy", () => {
  assert.match(source, /busy=\{saveAllBusy\}/, "ElementSettingsControls passes saveAllBusy to AdvancedSettingsSection");
  assert.match(combinedSource, /disabled=\{!!disabled \|\| !!busy \|\| !!extensionStateBusy \|\| !!bpmnDocumentationBusy\}/);
  assert.match(combinedSource, /\{busy \|\| extensionStateBusy \|\| bpmnDocumentationBusy \? "Сохраняю\.\.\." : "Сохранить всё"\}/);
});
