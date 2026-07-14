import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.resolve(__dirname, "../BpmnXmlStructureView.jsx");
const source = fs.readFileSync(sourcePath, "utf8");

describe("BpmnXmlStructureView source contract", () => {
  it("is lazy-loadable and exported as default", () => {
    assert.match(source, /export default function BpmnXmlStructureView/);
  });

  it("uses DOMParser for readonly parsing", () => {
    assert.match(source, /new DOMParser\(\)/);
    assert.match(source, /parsererror/);
  });

  it("debounces value updates", () => {
    assert.match(source, /useDebouncedValue/);
    assert.match(source, /500/);
  });

  it("renders a collapsible tree", () => {
    assert.match(source, /bpmnXmlStructureNode/);
    assert.match(source, /bpmnXmlStructureToggle/);
    assert.match(source, /expanded/);
  });

  it("calls onSelectLine with line number", () => {
    assert.match(source, /onSelectLine/);
    assert.match(source, /node\.line/);
  });

  it("tracks significant BPMN tags", () => {
    assert.match(source, /process/);
    assert.match(source, /task/);
    assert.match(source, /sequenceflow/i);
  });
});
