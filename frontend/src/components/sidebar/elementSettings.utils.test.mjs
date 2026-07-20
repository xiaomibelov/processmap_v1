import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  toText,
  str,
  asArray,
  clampInlineValue,
  isTaskLikeBpmnType,
  camundaIoTypeLabel,
  formatSequenceLabel,
  normalizeDocumentationRows,
  buildCamundaPropertiesDraftKey,
  readDisplayModeBeforeV2,
  writeDisplayModeBeforeV2,
} from "./elementSettings.utils.js";

function makeLocalStorage() {
  const store = new Map();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key),
  };
}

describe("elementSettings.utils", () => {
  beforeEach(() => {
    delete globalThis.window;
  });

  it("toText/str trim string-ish values", () => {
    assert.equal(toText("  x  "), "x");
    assert.equal(str(null), "");
    assert.equal(str(0), "");
    assert.equal(str(undefined), "");
    assert.equal(toText(""), "");
  });

  it("asArray returns arrays or empty", () => {
    assert.deepEqual(asArray([1, 2]), [1, 2]);
    assert.deepEqual(asArray(null), []);
    assert.deepEqual(asArray({}), []);
  });

  it("clampInlineValue clamps whitespace and long strings", () => {
    assert.equal(clampInlineValue("hello world", 20), "hello world");
    assert.equal(clampInlineValue("a".repeat(200), 120).endsWith("…"), true);
    assert.equal(clampInlineValue("   "), "");
    assert.equal(clampInlineValue(null), "");
    assert.equal(clampInlineValue("short", 10), "short");
  });

  it("isTaskLikeBpmnType recognizes task-like types", () => {
    assert.equal(isTaskLikeBpmnType("bpmn:UserTask"), true);
    assert.equal(isTaskLikeBpmnType("bpmn:ServiceTask"), true);
    assert.equal(isTaskLikeBpmnType("bpmn:CallActivity"), true);
    assert.equal(isTaskLikeBpmnType("bpmn:SequenceFlow"), false);
    assert.equal(isTaskLikeBpmnType(null), false);
  });

  it("camundaIoTypeLabel maps known shapes", () => {
    assert.equal(camundaIoTypeLabel("expression"), "expr");
    assert.equal(camundaIoTypeLabel("empty"), "empty");
    assert.equal(camundaIoTypeLabel("script"), "script");
    assert.equal(camundaIoTypeLabel("nested"), "nested");
    assert.equal(camundaIoTypeLabel("mapping"), "map");
    assert.equal(camundaIoTypeLabel("text"), "text");
    assert.equal(camundaIoTypeLabel(), "text");
  });

  it("formatSequenceLabel maps presets and falls back", () => {
    assert.equal(formatSequenceLabel("primary"), "Основной");
    assert.equal(formatSequenceLabel("primary_alt_2"), "Основной 2");
    assert.equal(formatSequenceLabel("unknown"), "unknown");
    assert.equal(formatSequenceLabel(""), "Не выбрано");
    assert.equal(formatSequenceLabel(null), "Не выбрано");
  });

  it("normalizeDocumentationRows adds ids and handles non-array input", () => {
    assert.deepEqual(normalizeDocumentationRows([{ text: "a" }]), [
      { text: "a", textFormat: "", id: "documentation_1" },
    ]);
    assert.deepEqual(normalizeDocumentationRows(null), []);
    assert.deepEqual(
      normalizeDocumentationRows([
        { text: "first\r\nline", textFormat: "text/html", id: "custom" },
      ]),
      [{ text: "first\nline", textFormat: "text/html", id: "custom" }],
    );
  });

  it("buildCamundaPropertiesDraftKey builds or skips empty ids", () => {
    assert.equal(buildCamundaPropertiesDraftKey("sid", "eid"), "sid:eid:camunda-properties");
    assert.equal(buildCamundaPropertiesDraftKey("", "eid"), "");
    assert.equal(buildCamundaPropertiesDraftKey("sid", ""), "");
  });

  it("readDisplayModeBeforeV2 round-trips through localStorage", () => {
    globalThis.window = { localStorage: makeLocalStorage() };
    assert.equal(readDisplayModeBeforeV2("s1"), null);
    writeDisplayModeBeforeV2("s1", "compact");
    assert.equal(readDisplayModeBeforeV2("s1"), "compact");
    writeDisplayModeBeforeV2("", "compact");
    assert.equal(readDisplayModeBeforeV2("s1"), "compact");
  });
});
