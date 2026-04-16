import test from "node:test";
import assert from "node:assert/strict";

import {
  isManualSaveSource,
  normalizeXmlForSaveComparison,
  shouldCanonicalRePersistManualSave,
} from "./manualSaveCanonicalXml.js";

test("isManualSaveSource matches manual save source and publish_manual_save reason", () => {
  assert.equal(isManualSaveSource("manual_save", ""), true);
  assert.equal(isManualSaveSource("", "publish_manual_save"), true);
  assert.equal(isManualSaveSource("autosave", "autosave"), false);
});

test("normalizeXmlForSaveComparison ignores formatting-only XML differences", () => {
  const compact = "<bpmn:userTask id=\"Task_1\" name=\"Task\"/>";
  const pretty = "<bpmn:userTask id=\"Task_1\"\n  name=\"Task\"\n/>";
  assert.equal(normalizeXmlForSaveComparison(compact), normalizeXmlForSaveComparison(pretty));
});

test("shouldCanonicalRePersistManualSave returns true when manual-save persisted XML diverges", () => {
  const canonicalXml = "<bpmn:userTask id=\"Task_1\" name=\"NEW\"/>";
  const persistedXml = "<bpmn:userTask id=\"Task_1\" name=\"OLD\"/>";
  assert.equal(shouldCanonicalRePersistManualSave({
    source: "manual_save",
    persistReason: "publish_manual_save",
    canonicalXml,
    persistedXml,
  }), true);
});

test("shouldCanonicalRePersistManualSave returns false for non-manual flows", () => {
  const canonicalXml = "<bpmn:userTask id=\"Task_1\" name=\"NEW\"/>";
  const persistedXml = "<bpmn:userTask id=\"Task_1\" name=\"OLD\"/>";
  assert.equal(shouldCanonicalRePersistManualSave({
    source: "autosave",
    persistReason: "autosave",
    canonicalXml,
    persistedXml,
  }), false);
});

test("shouldCanonicalRePersistManualSave returns false when normalized XML is equal", () => {
  const canonicalXml = `<bpmn:userTask id="Task_1" name="KEEP"/>`;
  const persistedXml = `<bpmn:userTask id="Task_1"\n name="KEEP" />`;
  assert.equal(shouldCanonicalRePersistManualSave({
    source: "manual_save",
    persistReason: "publish_manual_save",
    canonicalXml,
    persistedXml,
  }), false);
});
