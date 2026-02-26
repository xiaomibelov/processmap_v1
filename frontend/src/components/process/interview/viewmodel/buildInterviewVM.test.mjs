import test from "node:test";
import assert from "node:assert/strict";

import { buildInterviewVM, assertInterviewVMInvariants } from "./buildInterviewVM.js";

function makeStep({
  id,
  seq,
  orderIndex = seq,
  title,
  nodeId,
  laneName = "L1",
  laneKey = "lane_1",
  tier = "P0",
  workSec = 10,
  waitSec = 0,
}) {
  return {
    id,
    seq,
    order_index: orderIndex,
    seq_label: String(seq),
    action: title,
    bpmn_ref: nodeId,
    node_bind_id: nodeId,
    node_bind_title: title,
    node_bind_kind: "task",
    lane_name: laneName,
    lane_key: laneKey,
    tier,
    work_duration_sec: workSec,
    wait_duration_sec: waitSec,
    step_time_sec: workSec,
  };
}

test("buildInterviewVM keeps deterministic order by seq/order_index", () => {
  const timelineView = [
    makeStep({ id: "s3", seq: 3, title: "Step 3", nodeId: "N3", tier: "P1" }),
    makeStep({ id: "s1", seq: 1, title: "Step 1", nodeId: "N1", tier: "P0" }),
    makeStep({ id: "s2", seq: 2, title: "Step 2", nodeId: "N2", tier: "P0" }),
  ];

  const vm = buildInterviewVM({ timelineView, dodSnapshot: {} });
  assert.deepEqual(vm.steps.map((step) => step.id), ["s1", "s2", "s3"]);
  assert.deepEqual(vm.steps.map((step) => step.order_index), [1, 2, 3]);
  assert.equal(assertInterviewVMInvariants(vm).length, 0);
});

test("buildInterviewVM marks cycle in linear part when node repeats", () => {
  const timelineView = [
    makeStep({ id: "s1", seq: 1, title: "A", nodeId: "N1" }),
    makeStep({ id: "s2", seq: 2, title: "B", nodeId: "N2" }),
    makeStep({ id: "s3", seq: 3, title: "C", nodeId: "N1" }),
  ];

  const vm = buildInterviewVM({ timelineView, dodSnapshot: {} });
  assert.equal(vm.linear.has_cycle, true);
  assert.ok(vm.warnings.includes("linear_cycle_detected"));
});

test("buildInterviewVM order is stable with identical lane names", () => {
  const timelineView = [
    makeStep({ id: "s1", seq: 1, title: "Start", nodeId: "N1", laneName: "Работа с оборудованием", laneKey: "lane_eq_1" }),
    makeStep({ id: "s2", seq: 2, title: "Middle", nodeId: "N2", laneName: "Работа с оборудованием", laneKey: "lane_eq_2" }),
    makeStep({ id: "s3", seq: 3, title: "End", nodeId: "N3", laneName: "Работа с оборудованием", laneKey: "lane_eq_3" }),
  ];

  const vm = buildInterviewVM({ timelineView, dodSnapshot: {} });
  assert.deepEqual(vm.steps.map((step) => step.id), ["s1", "s2", "s3"]);
  assert.deepEqual(vm.steps.map((step) => step.order_index), [1, 2, 3]);
});

test("buildInterviewVM recomputes work/wait totals when a single step changes", () => {
  const baseTimeline = [
    makeStep({ id: "s1", seq: 1, title: "Start", nodeId: "N1", workSec: 120, waitSec: 0 }),
    makeStep({ id: "s2", seq: 2, title: "Task", nodeId: "N2", workSec: 300, waitSec: 60 }),
  ];
  const vmBase = buildInterviewVM({ timelineView: baseTimeline, dodSnapshot: {} });
  assert.equal(vmBase.path_metrics.steps_count, 2);
  assert.equal(vmBase.path_metrics.work_time_total_sec, 420);
  assert.equal(vmBase.path_metrics.wait_time_total_sec, 60);
  assert.equal(vmBase.path_metrics.total_time_sec, 480);

  const changedTimeline = [
    makeStep({ id: "s1", seq: 1, title: "Start", nodeId: "N1", workSec: 120, waitSec: 0 }),
    makeStep({ id: "s2", seq: 2, title: "Task", nodeId: "N2", workSec: 300, waitSec: 360 }),
  ];
  const vmChanged = buildInterviewVM({ timelineView: changedTimeline, dodSnapshot: {} });
  assert.equal(vmChanged.path_metrics.work_time_total_sec, 420);
  assert.equal(vmChanged.path_metrics.wait_time_total_sec, 360);
  assert.equal(vmChanged.path_metrics.total_time_sec, 780);
});

test("buildInterviewVM strips nullish suffix from step titles", () => {
  const timeline = [
    makeStep({ id: "s1", seq: 1, title: "заказ на супNone", nodeId: "N1" }),
    makeStep({ id: "s2", seq: 2, title: "ожидание undefined", nodeId: "N2" }),
  ];
  const vm = buildInterviewVM({ timelineView: timeline, dodSnapshot: {} });
  assert.equal(vm.steps[0].title, "заказ на суп");
  assert.equal(vm.steps[1].title, "ожидание");
});
