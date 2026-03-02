import test from "node:test";
import assert from "node:assert/strict";
import { buildScenarioMetrics, buildScenarioStepRows } from "./scenarioMetrics.js";

test("buildScenarioStepRows uses scenario rows sequence when available", () => {
  const scenario = {
    sequence: [{ node_id: "Task_Only_Fallback" }],
    rows: [
      {
        kind: "row_step",
        row_type: "step",
        node_id: "Task_1",
        title: "Task 1",
      },
      {
        kind: "row_group",
        row_type: "gateway",
        children: [
          {
            kind: "row_branch",
            is_primary: true,
            children: [
              {
                kind: "row_step",
                row_type: "step",
                node_id: "Task_2",
                title: "Task 2",
              },
            ],
          },
          {
            kind: "row_branch",
            is_primary: false,
            children: [
              {
                kind: "row_step",
                row_type: "step",
                node_id: "Task_Alt",
                title: "Task Alt",
              },
            ],
          },
        ],
      },
      {
        kind: "row_step",
        row_type: "terminal",
        node_id: "End_1",
        title: "End",
      },
    ],
  };

  const rows = buildScenarioStepRows(scenario);
  assert.deepEqual(
    rows.map((row) => row.node_id),
    ["Task_1", "Task_2", "End_1"],
  );
});

test("buildScenarioMetrics sums work and wait by ordered route steps", () => {
  const scenario = {
    rows: [
      { kind: "row_step", row_type: "step", node_id: "Task_1", title: "Task 1" },
      { kind: "row_step", row_type: "step", node_id: "Task_2", title: "Task 2" },
      { kind: "row_step", row_type: "step", node_id: "Task_3", title: "Task 3" },
    ],
  };
  const stepTimeByNodeId = {
    Task_1: { work_duration_sec: 60, wait_duration_sec: 20 },
    Task_2: { work_duration_sec: 120, wait_duration_sec: 0 },
    Task_3: { work_duration_sec: 0, wait_duration_sec: 40 },
  };

  const metrics = buildScenarioMetrics(scenario, stepTimeByNodeId);
  assert.equal(metrics.steps_count, 3);
  assert.equal(metrics.work_time_total_sec, 180);
  assert.equal(metrics.wait_time_total_sec, 60);
  assert.equal(metrics.total_time_sec, 240);
});

