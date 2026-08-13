import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("./ProcessStage.jsx", import.meta.url), "utf8");

test("ProcessStage drag-and-drop BPMN import reuses the file import pipeline", () => {
  assert.match(source, /async function importBpmnFile\(file\)/);
  assert.match(source, /async function onImportPicked\(e\)[\s\S]*await importBpmnFile\(file\);/);
  assert.match(source, /function handleBpmnFileDrop\(event\)[\s\S]*void importBpmnFile\(file\);/);
});

test("ProcessStage handles only external file drags and protects browser file open", () => {
  assert.match(source, /function eventHasExternalFiles\(event\)/);
  assert.match(source, /types\.includes\("Files"\)/);
  assert.match(source, /if \(!eventHasExternalFiles\(event\)\) return;/);
  assert.match(source, /window\.addEventListener\("dragover", preventExternalFileOpen\)/);
  assert.match(source, /window\.addEventListener\("drop", preventExternalFileOpen\)/);
});

test("ProcessStage validates BPMN\/XML extension and MIME before import", () => {
  assert.match(source, /function isBpmnImportFile\(file\)/);
  assert.match(source, /name\.endsWith\("\.bpmn"\) \|\| name\.endsWith\("\.xml"\)/);
  assert.match(source, /type === "text\/xml"/);
  assert.match(source, /type === "application\/xml"/);
  assert.match(source, /type === "application\/octet-stream"/);
  assert.match(source, /setGenErr\("Можно импортировать только BPMN\/XML файлы/);
});

test("ProcessStage shows a canvas drop overlay while a BPMN file drag is active", () => {
  assert.match(source, /bpmnFileDragActive/);
  assert.match(source, /data-testid="bpmn-file-drop-overlay"/);
  assert.match(source, /Отпустите файл для импорта/);
});
