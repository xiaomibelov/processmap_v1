import test from "node:test";
import assert from "node:assert/strict";

import { normalizeInterview } from "./utils.js";

test("normalizeInterview builds manual PathSpec and deterministic order_index", () => {
  const input = {
    steps: [
      { id: "s3", action: "Step 3", node_id: "N3", order_index: 3, work_duration_sec: 60, wait_duration_sec: 0 },
      { id: "s1", action: "Step 1", node_id: "N1", order_index: 1, work_duration_sec: 120, wait_duration_sec: 30 },
      { id: "s2", action: "Step 2", node_id: "N2", order_index: 2, work_duration_sec: 180, wait_duration_sec: 60 },
    ],
  };

  const out = normalizeInterview(input);

  assert.deepEqual(out.steps.map((step) => step.id), ["s1", "s2", "s3"]);
  assert.deepEqual(out.steps.map((step) => Number(step.order_index)), [1, 2, 3]);
  assert.equal(out.path_spec.mode, "manual");
  assert.deepEqual(
    out.path_spec.steps.map((step) => `${step.step_id}:${step.order_index}`),
    ["s1:1", "s2:2", "s3:3"],
  );
});

test("normalizeInterview keeps work/wait seconds and legacy minute mirrors", () => {
  const out = normalizeInterview({
    steps: [
      {
        id: "s1",
        action: "A",
        node_id: "N1",
        order_index: 1,
        work_duration_sec: 90,
        wait_duration_sec: 30,
      },
    ],
  });

  const step = out.steps[0];
  assert.equal(step.work_duration_sec, 90);
  assert.equal(step.wait_duration_sec, 30);
  assert.equal(step.duration_sec, 90);
  assert.equal(step.step_time_sec, 90);
  assert.equal(step.duration_min, "2");
  assert.equal(step.wait_min, "1");
});
