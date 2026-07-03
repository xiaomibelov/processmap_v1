import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isLifecycleFlushSource,
  resolveLifecycleFlushGuardSignal,
} from "../bpmn/save/lifecycleFlushGuardSignal.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readSource() {
  return fs.readFileSync(path.join(__dirname, "useBpmnSync.js"), "utf8");
}

test("useBpmnSync defines lifecycle flush classifier helper", () => {
  assert.equal(isLifecycleFlushSource("beforeunload"), true);
  assert.equal(isLifecycleFlushSource("pagehide"), true);
  assert.equal(isLifecycleFlushSource("visibility_hidden"), true);
  assert.equal(isLifecycleFlushSource("manual_save"), false);
});

test("accepted manual save with no new dirty delta skips lifecycle duplicate diagram save", () => {
  const signal = resolveLifecycleFlushGuardSignal({
    source: "beforeunload",
    saveDebugState: {
      store: {
        xml: "<bpmn:task name='saved' />",
        dirty: false,
        rev: 0,
        lastSavedRev: 2,
      },
    },
    liveRuntimeXml: "<bpmn:task name='saved'/>",
    fallbackXml: "<bpmn:task name='saved'/>",
  });
  assert.equal(signal.skip, true);
  assert.equal(signal.reason, "lifecycle_no_dirty_delta");
  assert.equal(signal.hasFreshDirtyDelta, false);
});

test("new diagram dirty delta after accepted manual save still allows lifecycle diagram save", () => {
  const signal = resolveLifecycleFlushGuardSignal({
    source: "beforeunload",
    saveDebugState: {
      store: {
        xml: "<bpmn:task name='saved' />",
        dirty: false,
        rev: 0,
        lastSavedRev: 2,
      },
    },
    liveRuntimeXml: "<bpmn:task name='dirty-after-save'/>",
    fallbackXml: "<bpmn:task name='saved'/>",
  });
  assert.equal(signal.skip, false);
  assert.equal(signal.reason, "lifecycle_dirty_delta_present");
  assert.equal(signal.hasFreshDirtyDelta, true);
});

test("useBpmnSync integrates fresh runtime lifecycle guard signal", () => {
  const source = readSource();
  assert.equal(source.includes("const saveDebugState = bpmnRef.current?.getSaveDebugState?.() || null;"), true);
  assert.equal(source.includes("bpmnRef.current?.getRuntimeXmlSnapshot?.({ format: true })"), true);
  assert.equal(source.includes("resolveLifecycleFlushGuardSignal({"), true);
  assert.equal(source.includes("if (!lifecycleGuardSignal?.skip && lifecycleGuardSignal?.hasFreshDirtyDelta) {"), true);
  assert.equal(source.includes("lifecycleXmlOverride = toText(lifecycleGuardSignal?.liveRuntimeXml || \"\");"), true);
  assert.equal(source.includes("xmlOverride: lifecycleXmlOverride,"), true);
  assert.equal(source.includes("syncXmlToSession(fallbackXml, { source: `${source}:skip_no_dirty_delta` });"), true);
  assert.equal(source.includes("logBpmnTrace(\"FLUSH_SAVE_SKIPPED_NO_DIRTY_DELTA\""), true);
});
