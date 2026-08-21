import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.resolve(__dirname, "../BpmnXmlEditor.jsx");
const source = fs.readFileSync(sourcePath, "utf8");

describe("BpmnXmlEditor source contract", () => {
  it("uses React.lazy to load CodeMirror wrapper", () => {
    assert.match(source, /lazy\s*\(/);
    assert.match(source, /import\s*\(\s*["']\.\/BpmnXmlCodeEditor["']/);
  });

  it("renders toolbar with format, reset, save buttons", () => {
    assert.match(source, /Форматировать XML/);
    assert.match(source, /Сбросить/);
    assert.match(source, /Сохранить XML/);
  });

  it("includes a status bar", () => {
    assert.match(source, /bpmnXmlEditorStatusBar/);
    assert.match(source, /Строка/);
    assert.match(source, /Колонка/);
  });

  it("debounces onChange", () => {
    assert.match(source, /useDebouncedCallback/);
    assert.match(source, /300/);
  });

  it("validates XML before save", () => {
    assert.match(source, /validateBpmnXmlText/);
    assert.match(source, /isInvalid/);
  });

  it("pretty-prints XML via prettyPrintXml", () => {
    assert.match(source, /prettyPrintXml/);
  });
});
