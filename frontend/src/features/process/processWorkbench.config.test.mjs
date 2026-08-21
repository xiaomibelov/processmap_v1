import test from "node:test";
import assert from "node:assert/strict";
import { PROCESS_WORKBENCH_CONFIG } from "./processWorkbench.config.js";

test("process workbench top-level labels match product terminology", () => {
  assert.deepEqual(
    PROCESS_WORKBENCH_CONFIG.tabs.map((tab) => ({ id: tab.id, label: tab.label })),
    [
      { id: "interview", label: "Анализ процессов" },
      { id: "diagram", label: "Diagram (BPMN)" },
      { id: "xml", label: "XML" },
      { id: "doc", label: "DOC" },
      { id: "dod", label: "DOD" },
    ],
  );
});

test("empty guide copy references renamed workbench surfaces", () => {
  assert.equal(PROCESS_WORKBENCH_CONFIG.emptyGuide.steps.some((step) => step.includes("`BPMN`")), false);
  assert.equal(PROCESS_WORKBENCH_CONFIG.emptyGuide.steps.some((step) => step.includes("`Анализ`")), false);
  assert.equal(PROCESS_WORKBENCH_CONFIG.emptyGuide.steps.some((step) => step.includes("`Diagram (BPMN)`")), true);
  assert.equal(PROCESS_WORKBENCH_CONFIG.emptyGuide.steps.some((step) => step.includes("`Анализ процессов`")), true);
});
