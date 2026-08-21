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

test("buildInterviewVM prefers explicit node_path_meta scenarios over flow-tier", () => {
  const timeline = [
    makeStep({ id: "s1", seq: 1, title: "Start", nodeId: "N_start", tier: "None" }),
    makeStep({ id: "s2", seq: 2, title: "Mitigated 1", nodeId: "N_m1", tier: "None" }),
    makeStep({ id: "s3", seq: 3, title: "Mitigated 2", nodeId: "N_m2", tier: "None" }),
  ];
  const graphModel = {
    nodesById: {
      N_start: { id: "N_start", type: "startevent", name: "Start" },
      N_m1: { id: "N_m1", type: "task", name: "Mitigated 1" },
      N_m2: { id: "N_m2", type: "task", name: "Mitigated 2" },
    },
    outgoingByNode: {
      N_start: [{ id: "F1", sourceId: "N_start", targetId: "N_m1" }],
      N_m1: [{ id: "F2", sourceId: "N_m1", targetId: "N_m2" }],
      N_m2: [],
    },
    incomingByNode: {
      N_start: [],
      N_m1: [{ id: "F1", sourceId: "N_start", targetId: "N_m1" }],
      N_m2: [{ id: "F2", sourceId: "N_m1", targetId: "N_m2" }],
    },
    startNodeIds: ["N_start"],
  };
  const vm = buildInterviewVM({
    timelineView: timeline,
    dodSnapshot: {},
    graphModel,
    graphNodeRank: { N_start: 0, N_m1: 1, N_m2: 2 },
    nodePathMetaByNodeId: {
      N_m2: { paths: ["P1"], sequence_key: "mitigated_1", source: "manual" },
      N_start: { paths: ["P1"], sequence_key: "mitigated_1", source: "manual" },
      N_m1: { paths: ["P1"], sequence_key: "mitigated_1", source: "manual" },
    },
    bpmnTraversalOrder: ["N_start", "N_m1", "N_m2"],
  });
  assert.equal(vm.path_source, "node_path_meta");
  const p1 = vm.scenarios.find((item) => String(item?.tier || "").toUpperCase() === "P1");
  assert.ok(p1);
  assert.deepEqual(
    p1.sequence.map((step) => step.node_id),
    ["N_start", "N_m1", "N_m2"],
  );
});

test("buildInterviewVM keeps scenarios stable after explicit node_path_meta import even if tier hints change", () => {
  const timelineBase = [
    makeStep({ id: "s1", seq: 1, title: "Start", nodeId: "N_start", tier: "P0" }),
    makeStep({ id: "s2", seq: 2, title: "Task A", nodeId: "N_a", tier: "P0" }),
    makeStep({ id: "s3", seq: 3, title: "Task B", nodeId: "N_b", tier: "P2" }),
  ];
  const timelineChangedTiers = [
    makeStep({ id: "s1", seq: 1, title: "Start", nodeId: "N_start", tier: "P2" }),
    makeStep({ id: "s2", seq: 2, title: "Task A", nodeId: "N_a", tier: "P2" }),
    makeStep({ id: "s3", seq: 3, title: "Task B", nodeId: "N_b", tier: "P0" }),
  ];
  const graphModel = {
    nodesById: {
      N_start: { id: "N_start", type: "startevent", name: "Start" },
      N_a: { id: "N_a", type: "task", name: "Task A" },
      N_b: { id: "N_b", type: "task", name: "Task B" },
    },
    outgoingByNode: {
      N_start: [{ id: "F1", sourceId: "N_start", targetId: "N_a" }],
      N_a: [{ id: "F2", sourceId: "N_a", targetId: "N_b" }],
      N_b: [],
    },
    incomingByNode: {
      N_start: [],
      N_a: [{ id: "F1", sourceId: "N_start", targetId: "N_a" }],
      N_b: [{ id: "F2", sourceId: "N_a", targetId: "N_b" }],
    },
    startNodeIds: ["N_start"],
  };
  const nodePathMetaByNodeId = {
    N_start: { paths: ["P0"], sequence_key: "primary", source: "color_auto" },
    N_a: { paths: ["P0"], sequence_key: "primary", source: "color_auto" },
    N_b: { paths: ["P0"], sequence_key: "primary", source: "color_auto" },
  };

  const vmBase = buildInterviewVM({
    timelineView: timelineBase,
    dodSnapshot: {},
    graphModel,
    graphNodeRank: { N_start: 0, N_a: 1, N_b: 2 },
    nodePathMetaByNodeId,
    bpmnTraversalOrder: ["N_start", "N_a", "N_b"],
  });
  const vmChanged = buildInterviewVM({
    timelineView: timelineChangedTiers,
    dodSnapshot: {},
    graphModel,
    graphNodeRank: { N_start: 0, N_a: 1, N_b: 2 },
    nodePathMetaByNodeId,
    bpmnTraversalOrder: ["N_start", "N_a", "N_b"],
  });

  assert.equal(vmBase.path_source, "node_path_meta");
  assert.equal(vmChanged.path_source, "node_path_meta");
  const p0Base = vmBase.scenarios.find((item) => item?.id === "primary");
  const p0Changed = vmChanged.scenarios.find((item) => item?.id === "primary");
  assert.ok(p0Base);
  assert.ok(p0Changed);
  assert.deepEqual(
    p0Base.sequence.map((step) => step.node_id),
    p0Changed.sequence.map((step) => step.node_id),
  );
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
