import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./ElementSettingsControls.jsx", import.meta.url), "utf8");

test("CamundaPropertiesSettings accepts onSaveAllBatch prop", () => {
  assert.match(source, /onSaveAllBatch,/);
  assert.match(source, /onSaveAllBatch,\s*\n?\s*onFocusDrawioCompanion/);
});

test("Save All handler prefers onSaveAllBatch and toggles local busy state", () => {
  assert.match(source, /const \[saveAllBusy, setSaveAllBusy\] = useState\(false\)/);
  assert.match(source, /if \(typeof onSaveAllBatch === "function"\) \{\s*setSaveAllBusy\(true\);\s*try \{\s*await onSaveAllBatch\(\);\s*\} finally \{\s*setSaveAllBusy\(false\);\s*\}\s*return;\s*\}/);
});

test("Save All button disables while saveAllBusy and shows progress copy", () => {
  assert.match(source, /disabled=\{!!disabled \|\| !!saveAllBusy \|\| !!extensionStateBusy \|\| !!bpmnDocumentationBusy\}/);
  assert.match(source, /\{saveAllBusy \|\| extensionStateBusy \|\| bpmnDocumentationBusy \? "Сохраняю\.\.\." : "Сохранить всё"\}/);
});
