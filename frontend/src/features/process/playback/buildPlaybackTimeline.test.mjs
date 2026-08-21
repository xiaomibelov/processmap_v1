import assert from "node:assert/strict";
import test from "node:test";

import { buildPlaybackTimeline } from "./buildPlaybackTimeline.js";

test("buildPlaybackTimeline preserves incoming route order and keeps node ids", () => {
  const timeline = buildPlaybackTimeline({
    scenarioLabel: "P0 Alt #2",
    pathId: "p0_alt_2",
    routeItems: [
      { order_index: 3, bpmn_ref: "Task_3", title: "Step 3" },
      { order_index: 1, bpmn_ref: "Task_1", title: "Step 1" },
      { order_index: 2, bpmn_ref: "Task_2", title: "Step 2" },
    ],
  });

  assert.equal(timeline.total, 3);
  assert.deepEqual(
    timeline.events.map((item) => item.nodeId),
    ["Task_3", "Task_1", "Task_2"],
  );
  assert.deepEqual(
    timeline.events.map((item) => item.orderIndex),
    [1, 2, 3],
  );
  assert.equal(timeline.scenarioLabel, "P0 Alt #2");
  assert.equal(timeline.pathId, "p0_alt_2");
});

test("buildPlaybackTimeline carries transition flow and branch label from previous decision step", () => {
  const timeline = buildPlaybackTimeline({
    routeItems: [
      {
        order_index: 1,
        bpmn_ref: "Gateway_1",
        decision: { selected_flow_id: "Flow_yes", selected_label: "Да" },
      },
      {
        order_index: 2,
        bpmn_ref: "Task_Yes",
        title: "Handle yes branch",
      },
    ],
  });

  assert.equal(timeline.total, 2);
  assert.equal(timeline.events[1].flowId, "Flow_yes");
  assert.equal(timeline.events[1].branchLabel, "Да");
  assert.equal(timeline.events[1].branchFlowId, "Flow_yes");
});

test("buildPlaybackTimeline trims ids and falls back to incoming flow on current step", () => {
  const timeline = buildPlaybackTimeline({
    routeItems: [
      { order_index: 1, node_id: " Task_A " },
      { order_index: 2, node_id: " Task_B ", incoming_flow_id: " Flow_A_B " },
    ],
  });

  assert.equal(timeline.events[0].nodeId, "Task_A");
  assert.equal(timeline.events[1].nodeId, "Task_B");
  assert.equal(timeline.events[1].flowId, "Flow_A_B");
});
