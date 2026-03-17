import test from "node:test";
import assert from "node:assert/strict";

import { buildRevisionDiffView } from "./revisionCompareModule.js";

const BPMN_A = "<definitions><process id='P'><task id='Task_A'/></process></definitions>";
const BPMN_B = "<definitions><process id='P'><task id='Task_A'/><task id='Task_B'/></process></definitions>";
const BPMN_C = "<definitions><process id='P'><task id='Task_C'/></process></definitions>";

test("compare reads exactly selected two revisions", () => {
  const revisions = [
    { id: "r3", xml: BPMN_C },
    { id: "r2", xml: BPMN_B },
    { id: "r1", xml: BPMN_A },
  ];
  const diff = buildRevisionDiffView({
    revisions,
    baseRevisionId: "r1",
    targetRevisionId: "r2",
  });
  assert.equal(diff.ok, true);
  assert.equal(Number(diff.summary?.added?.tasks || 0) >= 1, true);
});

test("compare returns explicit error when one selected revision is missing", () => {
  const diff = buildRevisionDiffView({
    revisions: [{ id: "r1", xml: BPMN_A }],
    baseRevisionId: "r1",
    targetRevisionId: "r2",
  });
  assert.equal(diff.ok, false);
  assert.match(String(diff.error || ""), /недоступна/i);
});

