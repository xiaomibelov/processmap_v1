import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./BpmnStage.jsx", import.meta.url), "utf8");

test("bpmn stage preserves selection through import refresh instead of clearing it", () => {
  assert.match(source, /const selectionImportGuardRef = useRef\(\{ viewer: "", editor: "" \}\);/);
  assert.match(source, /function beginImportSelectionGuard\(kind\)/);
  assert.match(source, /function finishImportSelectionGuard\(inst, kind, reason = "import_refresh"\)/);
  assert.match(source, /finishImportSelectionGuard\(m, "editor", "import_restore"\);/);
  assert.match(source, /finishImportSelectionGuard\(v, "viewer", "import_restore"\);/);
  assert.doesNotMatch(source, /renderModeler[\s\S]*clearSelectedDecor\(m, "editor"\);\s*emitElementSelectionChange\(null\);/);
  assert.doesNotMatch(source, /renderViewer[\s\S]*clearSelectedDecor\(v, "viewer"\);\s*emitElementSelectionChange\(null\);/);
});

test("empty selection events are ignored while an import restore is in flight", () => {
  assert.match(source, /selection_change_suppressed[\s\S]*mode: "editor"/);
  assert.match(source, /selection_change_suppressed[\s\S]*mode: "viewer"/);
});

test("import restore clears truthfully when the previous element no longer exists", () => {
  assert.match(source, /result: "clear_missing_element"/);
  assert.match(source, /clearAiQuestionPanel\(inst, mode\);\s*emitElementSelectionChange\(null\);/);
});

test("legitimate empty selection outside the import guard still clears normally", () => {
  assert.match(source, /if \(!isSelectableElement\(selected\)\) \{\s*if \(String\(selectionImportGuardRef\.current\.editor \|\| ""\)\.trim\(\)\)/);
  assert.match(source, /if \(!isSelectableElement\(selected\)\) \{\s*if \(String\(selectionImportGuardRef\.current\.viewer \|\| ""\)\.trim\(\)\)/);
  assert.match(source, /clearSelectedDecor\(m, "editor"\);\s*emitElementSelectionChange\(null\);\s*clearAiQuestionPanel\(m, "editor"\);/);
  assert.match(source, /clearSelectedDecor\(v, "viewer"\);\s*emitElementSelectionChange\(null\);\s*clearAiQuestionPanel\(v, "viewer"\);/);
});
