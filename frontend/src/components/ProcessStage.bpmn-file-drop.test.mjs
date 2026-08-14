import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Minimal wiring check for the BPMN file drag-and-drop import in ProcessStage.
//
// Rendering the full ~8000-line ProcessStage component in jsdom is infeasible,
// so the decision logic itself is covered by real behavioral tests in
// features/process/bpmn/import/bpmnFileDrop.test.mjs. This file only verifies
// that ProcessStage is wired to that tested module and to the DOM events —
// it intentionally does NOT re-assert the logic.

const source = fs.readFileSync(new URL("./ProcessStage.jsx", import.meta.url), "utf8");

test("ProcessStage uses the shared tested bpmnFileDrop decision module", () => {
  assert.match(source, /from "\.\.\/features\/process\/bpmn\/import\/bpmnFileDrop\.js"/);
  // Both the Import button path and the drop path share one import pipeline.
  assert.match(source, /async function onImportPicked\(e\)[\s\S]*await importBpmnFile\(file\);/);
  assert.match(source, /function handleBpmnFileDrop\(event\)[\s\S]*void importBpmnFile\(file\);/);
});

test("ProcessStage host div wires drag events and browser file-open protection", () => {
  assert.match(source, /onDragEnter=\{handleBpmnFileDragEnter\}/);
  assert.match(source, /onDragOver=\{handleBpmnFileDragOver\}/);
  assert.match(source, /onDragLeave=\{handleBpmnFileDragLeave\}/);
  assert.match(source, /onDrop=\{handleBpmnFileDrop\}/);
  assert.match(source, /window\.addEventListener\("dragover", preventExternalFileOpen\)/);
  assert.match(source, /window\.addEventListener\("drop", preventExternalFileOpen\)/);
  // Drop overlay affordance while a file drag is active.
  assert.match(source, /data-testid="bpmn-file-drop-overlay"/);
  assert.match(source, /Отпустите файл для импорта/);
});
