import test from "node:test";
import assert from "node:assert/strict";

import { buildLintAutoFixPreview, runBpmnLint } from "./bpmnLint.js";

const XML_WITHOUT_END = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" />
    <bpmn:task id="Task_1" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
  </bpmn:process>
</bpmn:definitions>`;

const HAS_DOM_PARSER = typeof DOMParser !== "undefined";

test("runBpmnLint flags missing endEvent in MVP profile", { skip: !HAS_DOM_PARSER }, () => {
  const lint = runBpmnLint({
    xmlText: XML_WITHOUT_END,
    profileId: "mvp",
  });
  assert.equal(lint.profile.id, "mvp");
  assert.ok(lint.summary.total > 0);
  assert.ok(lint.issues.some((issue) => issue.ruleId === "missing_end_event"));
});

test("buildLintAutoFixPreview creates safe ops for endEvent and empty task labels", { skip: !HAS_DOM_PARSER }, () => {
  const preview = buildLintAutoFixPreview({
    xmlText: XML_WITHOUT_END,
    issues: [
      {
        nodeId: "Task_1",
        ruleId: "missing_end_event",
      },
      {
        nodeId: "Task_1",
        ruleId: "task_without_label",
      },
    ],
  });
  const types = preview.ops.map((op) => String(op?.type || ""));
  assert.ok(types.includes("addEndEvent"));
  assert.ok(types.includes("rename"));
  assert.ok(preview.safeFixes >= 2);
});
