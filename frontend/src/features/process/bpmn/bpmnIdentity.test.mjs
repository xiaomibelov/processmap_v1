import assert from "node:assert/strict";
import test from "node:test";

import { isTechnicalBpmnId, readableBpmnText } from "./bpmnIdentity.js";

test("isTechnicalBpmnId detects BPMN runtime ids without matching readable labels", () => {
  assert.equal(isTechnicalBpmnId("Activity_02r3c3z"), true);
  assert.equal(isTechnicalBpmnId("Task_1"), true);
  assert.equal(isTechnicalBpmnId("Проверить температуру"), false);
  assert.equal(isTechnicalBpmnId("Activity check"), false);
});

test("readableBpmnText skips technical ids and returns the first readable label", () => {
  assert.equal(readableBpmnText("Activity_02r3c3z", "Проверить температуру"), "Проверить температуру");
  assert.equal(readableBpmnText("Activity_02r3c3z", ""), "");
});
