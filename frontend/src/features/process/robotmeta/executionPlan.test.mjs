import test from "node:test";
import assert from "node:assert/strict";

import {
  appendExecutionPlanVersionEntry,
  buildExecutionPlan,
  normalizeExecutionPlanVersionList,
} from "./executionPlan.js";

test("buildExecutionPlan computes stats/issues/hash and reacts to robot meta changes", async () => {
  const base = await buildExecutionPlan({
    sessionId: "sess_1",
    projectId: "proj_1",
    pathId: "primary",
    scenarioLabel: "P0 Ideal",
    generatedAt: "2026-03-01T16:00:00.000Z",
    steps: [
      {
        order_index: 1,
        id: "s1",
        title: "Mix",
        bpmn_ref: "Task_1",
        work_duration_sec: 120,
        wait_duration_sec: 0,
      },
      {
        order_index: 2,
        id: "s2",
        title: "QC",
        bpmn_ref: "Task_2",
        work_duration_sec: 60,
        wait_duration_sec: 20,
      },
    ],
    robotMetaByElementId: {
      Task_1: {
        robot_meta_version: "v1",
        exec: {
          mode: "machine",
          executor: "node_red",
          action_key: "",
          timeout_sec: 10,
          retry: { max_attempts: 1, backoff_sec: 0 },
        },
        mat: { from_zone: "A", to_zone: "B", inputs: [], outputs: [] },
        qc: { critical: false, checks: [] },
      },
      Task_2: {
        robot_meta_version: "v1",
        exec: {
          mode: "machine",
          executor: "robot_cell",
          action_key: "qc.validate",
          timeout_sec: 10,
          retry: { max_attempts: 1, backoff_sec: 0 },
        },
        mat: { from_zone: "", to_zone: "", inputs: [], outputs: [] },
        qc: { critical: true, checks: [] },
      },
    },
    bpmnTypeById: {
      Task_1: "userTask",
      Task_2: "serviceTask",
    },
  });

  assert.equal(base.plan_version, "v1");
  assert.equal(base.stats.steps_total, 2);
  assert.equal(base.stats.robot_ready, 1);
  assert.equal(base.stats.robot_incomplete, 1);
  assert.equal(base.stats.human_only, 0);
  assert.equal(base.steps[0].robot_status, "incomplete");
  assert.equal(base.steps[1].robot_status, "ready");
  assert.ok(base.issues.some((issue) => issue.code === "MISSING_ACTION_KEY"));
  assert.ok(base.issues.some((issue) => issue.code === "QC_CRITICAL_NO_CHECKS"));

  const changed = await buildExecutionPlan({
    sessionId: "sess_1",
    projectId: "proj_1",
    pathId: "primary",
    scenarioLabel: "P0 Ideal",
    generatedAt: "2026-03-01T16:00:00.000Z",
    steps: [
      {
        order_index: 1,
        id: "s1",
        title: "Mix",
        bpmn_ref: "Task_1",
        work_duration_sec: 120,
        wait_duration_sec: 0,
      },
      {
        order_index: 2,
        id: "s2",
        title: "QC",
        bpmn_ref: "Task_2",
        work_duration_sec: 60,
        wait_duration_sec: 20,
      },
    ],
    robotMetaByElementId: {
      Task_1: {
        robot_meta_version: "v1",
        exec: {
          mode: "machine",
          executor: "node_red",
          action_key: "robot.mix",
          timeout_sec: 10,
          retry: { max_attempts: 1, backoff_sec: 0 },
        },
        mat: { from_zone: "A", to_zone: "B", inputs: [], outputs: [] },
        qc: { critical: false, checks: [] },
      },
      Task_2: {
        robot_meta_version: "v1",
        exec: {
          mode: "machine",
          executor: "robot_cell",
          action_key: "qc.validate",
          timeout_sec: 10,
          retry: { max_attempts: 1, backoff_sec: 0 },
        },
        mat: { from_zone: "", to_zone: "", inputs: [], outputs: [] },
        qc: { critical: true, checks: [] },
      },
    },
    bpmnTypeById: {
      Task_1: "userTask",
      Task_2: "serviceTask",
    },
  });

  assert.notEqual(base.steps_hash, changed.steps_hash);
  assert.equal(changed.stats.robot_ready, 2);
  assert.equal(changed.stats.robot_incomplete, 0);

  const changedTiming = await buildExecutionPlan({
    sessionId: "sess_1",
    projectId: "proj_1",
    pathId: "primary",
    scenarioLabel: "P0 Ideal",
    generatedAt: "2026-03-01T16:00:00.000Z",
    steps: [
      {
        order_index: 1,
        id: "s1",
        title: "Mix",
        bpmn_ref: "Task_1",
        work_duration_sec: 121,
        wait_duration_sec: 0,
      },
      {
        order_index: 2,
        id: "s2",
        title: "QC",
        bpmn_ref: "Task_2",
        work_duration_sec: 60,
        wait_duration_sec: 20,
      },
    ],
    robotMetaByElementId: {
      Task_1: {
        robot_meta_version: "v1",
        exec: {
          mode: "machine",
          executor: "node_red",
          action_key: "robot.mix",
          timeout_sec: 10,
          retry: { max_attempts: 1, backoff_sec: 0 },
        },
        mat: { from_zone: "A", to_zone: "B", inputs: [], outputs: [] },
        qc: { critical: false, checks: [] },
      },
      Task_2: {
        robot_meta_version: "v1",
        exec: {
          mode: "machine",
          executor: "robot_cell",
          action_key: "qc.validate",
          timeout_sec: 10,
          retry: { max_attempts: 1, backoff_sec: 0 },
        },
        mat: { from_zone: "", to_zone: "", inputs: [], outputs: [] },
        qc: { critical: true, checks: [] },
      },
    },
    bpmnTypeById: {
      Task_1: "userTask",
      Task_2: "serviceTask",
    },
  });
  assert.notEqual(changed.steps_hash, changedTiming.steps_hash);
});

test("normalize/append execution plan versions keeps entry contract", () => {
  const list = normalizeExecutionPlanVersionList([
    {
      id: "v1",
      created_at: "2026-03-01T16:00:00.000Z",
      path_id: "primary",
      steps_hash: "abc",
      stats: {
        steps_total: 1,
        robot_ready: 1,
        robot_incomplete: 0,
        human_only: 0,
      },
      json: { plan_version: "v1", path_id: "primary", steps_hash: "abc", stats: { steps_total: 1 } },
    },
  ]);
  assert.equal(list.length, 1);
  assert.equal(list[0].id, "v1");
  const appended = appendExecutionPlanVersionEntry(list, {
    plan_version: "v1",
    path_id: "secondary",
    steps_hash: "def",
    generated_at: "2026-03-01T16:10:00.000Z",
    stats: {
      steps_total: 2,
      robot_ready: 0,
      robot_incomplete: 1,
      human_only: 1,
    },
    steps: [],
    issues: [],
  });
  assert.equal(appended.length, 2);
  assert.equal(appended[1].path_id, "secondary");
  assert.equal(appended[1].steps_hash, "def");
  assert.ok(appended[1].id.startsWith("exec_plan_"));
});
