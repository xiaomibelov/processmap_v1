import test from "node:test";
import assert from "node:assert/strict";

import { buildInterviewPatchPayload } from "./processStageDomain.js";

test("generic interview patch omits analysis.product_actions from autosave payload", () => {
  const savePlan = buildInterviewPatchPayload(
    {
      steps: [{ id: "step_1", action: "Нарезать" }],
      analysis: {
        product_actions: [{ id: "pa_1", product_name: "Курица" }],
        custom_marker: "keep",
      },
    },
    [],
    [],
    [],
    [],
  );

  assert.equal(savePlan.patch.interview.analysis.product_actions, undefined);
  assert.equal(savePlan.patch.interview.analysis.custom_marker, "keep");
  assert.deepEqual(savePlan.patch.interview.steps, [{ id: "step_1", action: "Нарезать" }]);
});

test("generic interview patch removes empty analysis after stripping product_actions", () => {
  const savePlan = buildInterviewPatchPayload(
    {
      steps: [{ id: "step_1", action: "Нарезать" }],
      analysis: {
        product_actions: [{ id: "pa_1", product_name: "Курица" }],
      },
    },
    [],
    [],
    [],
    [],
  );

  assert.equal(Object.prototype.hasOwnProperty.call(savePlan.patch.interview, "analysis"), false);
  assert.deepEqual(savePlan.patch.interview.steps, [{ id: "step_1", action: "Нарезать" }]);
});
