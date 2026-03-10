import test from "node:test";
import assert from "node:assert/strict";
import {
  canCreateDrawioEntityFromBpmnClick,
  resolveDrawioToolIntent,
  shouldBlockBpmnClickDrawioCreation,
} from "./drawioCreateGuard.js";

test("drawio create guard: BPMN click creation blocked without explicit create tool", () => {
  const allowed = canCreateDrawioEntityFromBpmnClick({
    enabled: true,
    locked: false,
    interactionMode: "edit",
    toolId: "select",
  });
  assert.equal(allowed, false);
  assert.equal(
    shouldBlockBpmnClickDrawioCreation({
      enabled: true,
      locked: false,
      interactionMode: "edit",
      toolId: "select",
    }),
    true,
  );
});

test("drawio create guard: tools route to edit mode or full editor", () => {
  assert.deepEqual(
    resolveDrawioToolIntent({ toolId: "select", enabled: true, locked: false }),
    { toolId: "select", intent: "mode_edit", reason: "select_existing" },
  );
  assert.deepEqual(
    resolveDrawioToolIntent({ toolId: "rect", enabled: true, locked: false }),
    { toolId: "rect", intent: "mode_edit", reason: "runtime_overlay_tool" },
  );
});
