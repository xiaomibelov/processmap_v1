import test from "node:test";
import assert from "node:assert/strict";

import {
  BPMN_IMPORT_EMPTY_FILE_ERROR,
  BPMN_IMPORT_FILE_TYPE_ERROR,
  BPMN_IMPORT_NOT_XML_ERROR,
  eventHasExternalFiles,
  isBpmnImportFile,
  validateBpmnImportFile,
  validateBpmnImportText,
} from "./bpmnFileDrop.js";

// Behavioral tests for the BPMN file drop/import decision logic that
// ProcessStage.jsx uses (imported from ./bpmnFileDrop.js).

test("valid .bpmn/.xml files pass the extension+MIME gate", () => {
  const accepted = [
    { name: "diagram.bpmn", type: "text/xml" },
    { name: "diagram.bpmn", type: "application/xml" },
    { name: "diagram.bpmn", type: "application/bpmn+xml" },
    { name: "diagram.bpmn", type: "application/octet-stream" },
    { name: "diagram.bpmn", type: "" }, // browsers often leave MIME empty
    { name: "DIAGRAM.BPMN", type: "TEXT/XML" }, // case-insensitive
    { name: "process.xml", type: "application/xml" },
    { name: "process.xml", type: "application/something+xml" },
  ];
  for (const file of accepted) {
    assert.equal(isBpmnImportFile(file), true, `expected accept: ${JSON.stringify(file)}`);
    assert.equal(validateBpmnImportFile(file), "", `expected no error: ${JSON.stringify(file)}`);
  }
});

test(".txt file is rejected with the exact Russian error", () => {
  assert.equal(
    validateBpmnImportFile({ name: "notes.txt", type: "text/plain" }),
    "Можно импортировать только BPMN/XML файлы с расширением .bpmn или .xml.",
  );
  assert.equal(validateBpmnImportFile({ name: "notes.txt", type: "text/plain" }), BPMN_IMPORT_FILE_TYPE_ERROR);
});

test(".png file is rejected with the exact Russian error", () => {
  assert.equal(
    validateBpmnImportFile({ name: "screenshot.png", type: "image/png" }),
    "Можно импортировать только BPMN/XML файлы с расширением .bpmn или .xml.",
  );
});

test("valid extension with a non-XML MIME type is still rejected", () => {
  assert.equal(isBpmnImportFile({ name: "evil.bpmn", type: "image/png" }), false);
  assert.equal(validateBpmnImportFile({ name: "evil.bpmn", type: "image/png" }), BPMN_IMPORT_FILE_TYPE_ERROR);
});

test("missing file is rejected", () => {
  assert.equal(isBpmnImportFile(null), false);
  assert.equal(validateBpmnImportFile(undefined), BPMN_IMPORT_FILE_TYPE_ERROR);
});

test("empty file content is rejected with the exact Russian error", () => {
  assert.equal(validateBpmnImportText(""), "Файл пустой.");
  assert.equal(validateBpmnImportText(""), BPMN_IMPORT_EMPTY_FILE_ERROR);
  assert.equal(validateBpmnImportText("   \n\t  "), BPMN_IMPORT_EMPTY_FILE_ERROR);
  assert.equal(validateBpmnImportText(null), BPMN_IMPORT_EMPTY_FILE_ERROR);
});

test("non-XML content is rejected with the exact Russian error", () => {
  assert.equal(validateBpmnImportText("just some plain text"), "Похоже, это не BPMN/XML файл.");
  assert.equal(validateBpmnImportText("just some plain text"), BPMN_IMPORT_NOT_XML_ERROR);
  // Angle brackets alone are not enough — must look like BPMN.
  assert.equal(validateBpmnImportText("<html><body>hi</body></html>"), BPMN_IMPORT_NOT_XML_ERROR);
});

test("BPMN/XML-looking content passes the content sniff", () => {
  const bpmnXml = "<?xml version=\"1.0\"?><bpmn:definitions xmlns:bpmn=\"http://www.omg.org/spec/BPMN/20100524/MODEL\"/>";
  assert.equal(validateBpmnImportText(bpmnXml), "");
  assert.equal(validateBpmnImportText("<definitions xmlns=\"http://www.omg.org/spec/BPMN/20100524/MODEL\"></definitions>"), "");
});

test("element drags (dataTransfer without Files type) are ignored", () => {
  // In-canvas element drags carry custom types only — must not trigger import.
  const elementDrag = { dataTransfer: { types: ["text/plain", "application/x-processmap-element"] } };
  assert.equal(eventHasExternalFiles(elementDrag), false);

  const emptyTypes = { dataTransfer: { types: [] } };
  assert.equal(eventHasExternalFiles(emptyTypes), false);

  assert.equal(eventHasExternalFiles({}), false);
  assert.equal(eventHasExternalFiles({ dataTransfer: null }), false);
  assert.equal(eventHasExternalFiles(null), false);
});

test("external OS file drags (dataTransfer with Files type) are detected", () => {
  assert.equal(eventHasExternalFiles({ dataTransfer: { types: ["Files"] } }), true);
  // DOMStringList-like types without .includes (older browsers).
  assert.equal(eventHasExternalFiles({ dataTransfer: { types: { 0: "Files", length: 1 } } }), true);
  assert.equal(eventHasExternalFiles({ dataTransfer: { types: { 0: "text/plain", length: 1 } } }), false);
});
