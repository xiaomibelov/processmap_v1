import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.resolve(__dirname, "../BpmnXmlCodeEditor.jsx");
const source = fs.readFileSync(sourcePath, "utf8");

describe("BpmnXmlCodeEditor source contract", () => {
  it("imports CodeMirror 6 view and state", () => {
    assert.match(source, /from\s*["']@codemirror\/view["']/);
    assert.match(source, /from\s*["']@codemirror\/state["']/);
  });

  it("uses XML language support", () => {
    assert.match(source, /from\s*["']@codemirror\/lang-xml["']/);
    assert.match(source, /xml\s*\(\s*\)/);
  });

  it("enables line numbers and folding", () => {
    assert.match(source, /lineNumbers\s*\(\s*\)/);
    assert.match(source, /foldGutter\s*\(\s*\)/);
  });

  it("enables search and lint gutter", () => {
    assert.match(source, /search\s*\(\s*\)/);
    assert.match(source, /lintGutter\s*\(\s*\)/);
  });

  it("binds Mod-s to onSave", () => {
    assert.match(source, /Mod-s/);
    assert.match(source, /onSaveRef\.current/);
  });

  it("destroys editor on unmount", () => {
    assert.match(source, /view\.destroy\s*\(\s*\)/);
  });

  it("applies a light theme", () => {
    assert.match(source, /backgroundColor:\s*["']#ffffff["']/);
  });
});
