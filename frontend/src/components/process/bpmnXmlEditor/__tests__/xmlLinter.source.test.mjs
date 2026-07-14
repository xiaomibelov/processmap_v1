import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bpmnXmlLinter } from "../xmlLinter.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.resolve(__dirname, "../xmlLinter.js");
const source = fs.readFileSync(sourcePath, "utf8");

describe("xmlLinter source contract", () => {
  it("exports bpmnXmlLinter as a function", () => {
    assert.equal(typeof bpmnXmlLinter, "function");
  });

  it("creates a linter extension", () => {
    const ext = bpmnXmlLinter({ delay: 300 });
    assert.ok(ext);
  });

  it("uses DOMParser to detect parsererror", () => {
    assert.match(source, /new DOMParser\(\)/);
    assert.match(source, /parsererror/);
  });

  it("checks BPMN definitions root element", () => {
    assert.match(source, /definitions/);
    assert.match(source, /bpmn/);
  });

  it("supports configurable debounce delay", () => {
    assert.match(source, /options\.delay/);
    assert.match(source, /delay/);
  });
});
